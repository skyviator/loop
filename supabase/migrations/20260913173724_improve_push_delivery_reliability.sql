create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- A Web Push request has a 15-second application timeout. A two-minute lease
-- leaves room for cold starts and the completion RPC while allowing the
-- every-minute worker to recover an abandoned attempt promptly.
create or replace function public.claim_push_deliveries(batch_size integer default 25)
returns table (
  delivery_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  title text,
  body text,
  route text,
  event_type public.notification_event_type
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 100 then raise exception 'Invalid batch size'; end if;

  update private.push_deliveries delivery
  set status = case when delivery.attempts < 5 then 'temporary_failure'::private.push_delivery_status else 'permanent_failure'::private.push_delivery_status end,
    failure_class = case when delivery.attempts < 5 then 'temporary' else 'permanent' end,
    available_at = case when delivery.attempts < 5 then now() else delivery.available_at end,
    updated_at = now()
  where delivery.status = 'sending'
    and delivery.updated_at <= now() - interval '2 minutes';

  insert into private.push_deliveries (outbox_id, subscription_id, recipient_user_id)
  select o.id, subscription.id, subscription.user_id
  from private.notification_outbox o
  join private.push_subscriptions subscription on subscription.status = 'active'
  where o.status = 'pending' and private.user_can_receive_push_event(subscription.user_id, o.id)
  on conflict (outbox_id, subscription_id) do nothing;

  update private.push_deliveries delivery
  set status = 'cancelled', failure_class = 'permanent', updated_at = now()
  where delivery.status in ('pending', 'temporary_failure')
    and (not private.user_can_receive_push_event(delivery.recipient_user_id, delivery.outbox_id)
      or not exists (select 1 from private.push_subscriptions subscription where subscription.id = delivery.subscription_id and subscription.status = 'active'));

  return query
  with picked as (
    select delivery.id
    from private.push_deliveries delivery
    where delivery.status in ('pending', 'temporary_failure') and delivery.available_at <= now()
    order by delivery.available_at, delivery.id
    for update skip locked
    limit batch_size
  ), claimed as (
    update private.push_deliveries delivery
    set status = 'sending', attempts = delivery.attempts + 1, updated_at = now()
    from picked
    where delivery.id = picked.id
    returning delivery.id, delivery.outbox_id, delivery.subscription_id
  )
  select claimed.id, subscription.endpoint, subscription.p256dh, subscription.auth_secret,
    outbox.title, outbox.body, outbox.route, outbox.event_type
  from claimed
  join private.push_subscriptions subscription on subscription.id = claimed.subscription_id
  join private.notification_outbox outbox on outbox.id = claimed.outbox_id;

  update private.notification_outbox outbox
  set status = 'completed', completed_at = now()
  where outbox.status = 'pending'
    and not exists (
      select 1 from private.push_deliveries delivery
      where delivery.outbox_id = outbox.id
        and delivery.status in ('pending', 'sending', 'temporary_failure')
    )
    and (
      exists (select 1 from private.push_deliveries delivery where delivery.outbox_id = outbox.id)
      or not exists (
        select 1 from private.push_subscriptions subscription
        where subscription.status = 'active'
          and private.user_can_receive_push_event(subscription.user_id, outbox.id)
      )
    );
end;
$$;

create or replace function private.invoke_push_retry_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_secret text;
begin
  select secret.decrypted_secret
  into worker_url
  from vault.decrypted_secrets secret
  where secret.name = 'loop_push_worker_url'
  limit 1;

  select secret.decrypted_secret
  into worker_secret
  from vault.decrypted_secrets secret
  where secret.name = 'loop_push_worker_secret'
  limit 1;

  if worker_url is null or worker_secret is null or char_length(worker_secret) < 32 then
    return;
  end if;

  -- Hosted environments must use HTTPS. The single HTTP exception is Docker's
  -- local host bridge so the same migration can be verified without cloud state.
  if worker_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/api/internal/push/retry$'
    and worker_url !~ '^http://host[.]docker[.]internal(:[0-9]+)?/api/internal/push/retry$' then
    return;
  end if;

  perform net.http_post(
    url := worker_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function private.invoke_push_retry_worker() from public, anon, authenticated, service_role;
grant execute on function private.invoke_push_retry_worker() to postgres;

select cron.schedule(
  'loop-push-retry-worker',
  '* * * * *',
  'select private.invoke_push_retry_worker();'
);
