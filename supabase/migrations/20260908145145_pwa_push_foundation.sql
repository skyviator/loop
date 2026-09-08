-- Step 5: private Web Push capabilities, user preferences, and a durable outbox.
-- Raw subscription endpoints and encryption keys stay in the unexposed private
-- schema. Public wrappers derive the user from auth.uid(); delivery RPCs are
-- service-role only and return capabilities solely to the trusted server.

create type public.notification_event_type as enum (
  'attendance_check_in',
  'attendance_check_out',
  'message',
  'important_announcement',
  'photo'
);

create type private.push_subscription_status as enum ('active', 'inactive');
create type private.push_outbox_status as enum ('pending', 'completed');
create type private.push_delivery_status as enum ('pending', 'sending', 'succeeded', 'temporary_failure', 'permanent_failure', 'cancelled');

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  attendance_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  important_announcements_enabled boolean not null default true,
  photos_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  endpoint_hash bytea not null unique,
  p256dh text not null,
  auth_secret text not null,
  status private.push_subscription_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deactivated_at timestamptz,
  check (endpoint ~ '^https://' and char_length(endpoint) between 16 and 2048),
  check (char_length(p256dh) between 16 and 512),
  check (char_length(auth_secret) between 8 and 256),
  check ((status = 'active') = (deactivated_at is null))
);

create table private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type public.notification_event_type not null,
  school_id uuid not null references public.schools(id) on delete cascade,
  source_id uuid not null,
  source_user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 160),
  route text not null check (left(route, 1) = '/' and left(route, 2) <> '//' and position(E'\\' in route) = 0 and char_length(route) <= 240),
  status private.push_outbox_status not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (event_type, source_id),
  check ((status = 'completed') = (completed_at is not null))
);

create table private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references private.notification_outbox(id) on delete cascade,
  subscription_id uuid not null references private.push_subscriptions(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status private.push_delivery_status not null default 'pending',
  attempts smallint not null default 0 check (attempts between 0 and 6),
  available_at timestamptz not null default now(),
  http_status integer check (http_status is null or http_status between 100 and 599),
  failure_class text check (failure_class is null or failure_class in ('temporary', 'permanent', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (outbox_id, subscription_id)
);

create index push_subscriptions_active_user_idx on private.push_subscriptions (user_id, id) where status = 'active';
create index push_outbox_pending_idx on private.notification_outbox (created_at, id) where status = 'pending';
create index push_deliveries_claim_idx on private.push_deliveries (available_at, id) where status in ('pending', 'temporary_failure');

create or replace function private.register_push_subscription(subscription_endpoint text, subscription_p256dh text, subscription_auth text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  subscription_id uuid;
begin
  if current_user_id is null or not exists (
    select 1 from public.school_memberships m
    where m.user_id = current_user_id and m.status = 'active'
  ) or exists (
    select 1 from public.platform_administrators p
    where p.user_id = current_user_id and p.status = 'active'
  ) then
    raise exception 'An active school membership is required';
  end if;
  if subscription_endpoint !~ '^https://' or char_length(subscription_endpoint) not between 16 and 2048
    or char_length(subscription_p256dh) not between 16 and 512
    or char_length(subscription_auth) not between 8 and 256 then
    raise exception 'Push subscription is invalid';
  end if;

  insert into private.push_subscriptions as existing (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
  values (current_user_id, subscription_endpoint, extensions.digest(subscription_endpoint, 'sha256'), subscription_p256dh, subscription_auth)
  on conflict (endpoint_hash) do update
    set user_id = current_user_id,
        endpoint = excluded.endpoint,
        p256dh = excluded.p256dh,
        auth_secret = excluded.auth_secret,
        status = 'active',
        updated_at = now(),
        last_seen_at = now(),
        deactivated_at = null
    where existing.user_id = current_user_id or existing.status = 'inactive'
  returning id into subscription_id;

  if subscription_id is null then
    raise exception 'Push subscription is already active for another account';
  end if;
  return subscription_id;
end;
$$;

create or replace function public.register_push_subscription(subscription_endpoint text, subscription_p256dh text, subscription_auth text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.register_push_subscription(subscription_endpoint, subscription_p256dh, subscription_auth); $$;

create or replace function private.deactivate_push_subscription(subscription_endpoint text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update private.push_subscriptions
    set status = 'inactive', deactivated_at = now(), updated_at = now()
    where user_id = (select auth.uid())
      and endpoint_hash = extensions.digest(subscription_endpoint, 'sha256')
      and status = 'active'
    returning 1
  ) select exists (select 1 from changed);
$$;

create or replace function public.deactivate_push_subscription(subscription_endpoint text)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.deactivate_push_subscription(subscription_endpoint); $$;

create or replace function private.enqueue_push_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'attendance_records' then
    if new.checked_in_at is not null and (tg_op = 'INSERT' or old.checked_in_at is null) then
      insert into private.notification_outbox (event_type, school_id, source_id, source_user_id, title, body, route)
      values ('attendance_check_in', new.school_id, new.id, new.recorded_by_user_id, 'Loop attendance update', 'An attendance update is ready in Loop.', '/parent?child=' || new.child_id)
      on conflict (event_type, source_id) do nothing;
    end if;
    if new.checked_out_at is not null and (tg_op = 'INSERT' or old.checked_out_at is null) then
      insert into private.notification_outbox (event_type, school_id, source_id, source_user_id, title, body, route)
      values ('attendance_check_out', new.school_id, new.id, new.recorded_by_user_id, 'Loop attendance update', 'An attendance update is ready in Loop.', '/parent?child=' || new.child_id)
      on conflict (event_type, source_id) do nothing;
    end if;
  elsif tg_table_name = 'messages' then
    insert into private.notification_outbox (event_type, school_id, source_id, source_user_id, title, body, route)
    values ('message', new.school_id, new.id, new.sender_user_id, 'New Loop message', 'Open Loop to read your new message.', '/messages?thread=' || new.thread_id)
    on conflict (event_type, source_id) do nothing;
  elsif tg_table_name = 'announcements' then
    if new.priority = 'important' and new.status = 'published'
      and (tg_op = 'INSERT' or old.priority <> 'important' or old.status <> 'published') then
      insert into private.notification_outbox (event_type, school_id, source_id, source_user_id, title, body, route)
      values ('important_announcement', new.school_id, new.id, new.created_by_user_id, 'Important Loop announcement', 'Open Loop to read an important school update.', '/updates#announcement-' || new.id)
      on conflict (event_type, source_id) do nothing;
    end if;
  elsif tg_table_name = 'media_assets' then
    if new.status = 'ready' and (tg_op = 'INSERT' or old.status <> 'ready') then
      insert into private.notification_outbox (event_type, school_id, source_id, source_user_id, title, body, route)
      values ('photo', new.school_id, new.id, new.uploader_user_id, 'New photo in Loop', 'A new private photo is ready in Loop.', '/parent#photos')
      on conflict (event_type, source_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.user_can_receive_push_event(target_user_id uuid, target_outbox_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.notification_outbox o
    where o.id = target_outbox_id
      and o.status = 'pending'
      and target_user_id is distinct from o.source_user_id
      and exists (
        select 1 from public.school_memberships active_membership
        where active_membership.school_id = o.school_id
          and active_membership.user_id = target_user_id
          and active_membership.status = 'active'
      )
      and not exists (
        select 1 from public.platform_administrators p
        where p.user_id = target_user_id and p.status = 'active'
      )
      and case o.event_type
        when 'attendance_check_in' then
          coalesce((select p.attendance_enabled from public.notification_preferences p where p.user_id = target_user_id), true)
          and private.school_feature_is_enabled(o.school_id, 'attendance')
          and exists (
            select 1 from public.attendance_records a
            join public.child_guardians g on g.school_id = a.school_id and g.child_id = a.child_id and g.status = 'active'
            join public.school_memberships m on m.id = g.guardian_membership_id and m.user_id = target_user_id and m.status = 'active'
            where a.id = o.source_id and a.school_id = o.school_id
          )
        when 'attendance_check_out' then
          coalesce((select p.attendance_enabled from public.notification_preferences p where p.user_id = target_user_id), true)
          and private.school_feature_is_enabled(o.school_id, 'attendance')
          and exists (
            select 1 from public.attendance_records a
            join public.child_guardians g on g.school_id = a.school_id and g.child_id = a.child_id and g.status = 'active'
            join public.school_memberships m on m.id = g.guardian_membership_id and m.user_id = target_user_id and m.status = 'active'
            where a.id = o.source_id and a.school_id = o.school_id
          )
        when 'message' then
          coalesce((select p.messages_enabled from public.notification_preferences p where p.user_id = target_user_id), true)
          and private.school_feature_is_enabled(o.school_id, 'messaging')
          and exists (
            select 1
            from public.messages message
            join public.message_threads thread on thread.id = message.thread_id and thread.school_id = message.school_id and thread.status = 'active'
            join public.child_enrollments enrollment on enrollment.child_id = thread.child_id and enrollment.school_id = thread.school_id and enrollment.status = 'active'
            join public.school_memberships membership on membership.school_id = thread.school_id and membership.user_id = target_user_id and membership.status = 'active'
            where message.id = o.source_id and message.school_id = o.school_id
              and (
                membership.role = 'school_admin'
                or membership.role = 'guardian' and membership.id = thread.guardian_membership_id
                  and exists (select 1 from public.child_guardians g where g.child_id = thread.child_id and g.guardian_membership_id = membership.id and g.status = 'active')
                or membership.role = 'teacher' and exists (
                  select 1 from public.classroom_staff_assignments assignment
                  where assignment.membership_id = membership.id and assignment.classroom_id = enrollment.classroom_id
                    and assignment.status = 'active' and assignment.starts_on <= current_date
                    and (assignment.ends_on is null or assignment.ends_on >= current_date)
                )
              )
          )
        when 'important_announcement' then
          coalesce((select p.important_announcements_enabled from public.notification_preferences p where p.user_id = target_user_id), true)
          and private.school_feature_is_enabled(o.school_id, 'announcements')
          and exists (
            select 1
            from public.announcements announcement
            join public.school_memberships membership on membership.school_id = announcement.school_id and membership.user_id = target_user_id and membership.status = 'active'
            where announcement.id = o.source_id and announcement.school_id = o.school_id
              and announcement.priority = 'important' and announcement.status = 'published'
              and announcement.publish_at <= now() and (announcement.expires_at is null or announcement.expires_at > now())
              and (
                membership.role = 'school_admin'
                or membership.role = 'teacher' and exists (
                  select 1 from public.classroom_staff_assignments assignment
                  join public.classrooms classroom on classroom.id = assignment.classroom_id and classroom.school_id = assignment.school_id
                  where assignment.membership_id = membership.id and assignment.status = 'active'
                    and assignment.starts_on <= current_date and (assignment.ends_on is null or assignment.ends_on >= current_date)
                    and (announcement.target_scope = 'school'
                      or announcement.target_scope = 'branch' and classroom.branch_id = announcement.branch_id
                      or announcement.target_scope = 'classroom' and classroom.id = announcement.classroom_id)
                )
                or membership.role = 'guardian' and exists (
                  select 1 from public.child_guardians guardian
                  join public.child_enrollments enrollment on enrollment.child_id = guardian.child_id and enrollment.school_id = guardian.school_id and enrollment.status = 'active'
                  join public.classrooms classroom on classroom.id = enrollment.classroom_id and classroom.school_id = enrollment.school_id
                  where guardian.guardian_membership_id = membership.id and guardian.status = 'active'
                    and (announcement.target_scope = 'school'
                      or announcement.target_scope = 'branch' and classroom.branch_id = announcement.branch_id
                      or announcement.target_scope = 'classroom' and classroom.id = announcement.classroom_id)
                )
              )
          )
        when 'photo' then
          coalesce((select p.photos_enabled from public.notification_preferences p where p.user_id = target_user_id), false)
          and private.school_feature_is_enabled(o.school_id, 'photos')
          and exists (
            select 1 from public.media_assets asset
            join public.media_asset_children tagged on tagged.asset_id = asset.id and tagged.school_id = asset.school_id
            join public.child_guardians guardian on guardian.child_id = tagged.child_id and guardian.school_id = tagged.school_id and guardian.status = 'active'
            join public.school_memberships membership on membership.id = guardian.guardian_membership_id and membership.user_id = target_user_id and membership.status = 'active'
            where asset.id = o.source_id and asset.school_id = o.school_id and asset.status = 'ready'
          )
      end
  );
$$;

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
    and not exists (select 1 from private.push_subscriptions subscription where subscription.status = 'active' and private.user_can_receive_push_event(subscription.user_id, outbox.id))
    and not exists (select 1 from private.push_deliveries delivery where delivery.outbox_id = outbox.id and delivery.status in ('pending', 'sending', 'temporary_failure'));
end;
$$;

create or replace function public.complete_push_delivery(target_delivery_id uuid, outcome text, response_status integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery private.push_deliveries%rowtype;
begin
  if outcome not in ('success', 'temporary_failure', 'permanent_failure') then raise exception 'Invalid delivery outcome'; end if;
  select * into delivery from private.push_deliveries where id = target_delivery_id and status = 'sending' for update;
  if not found then return; end if;

  if outcome = 'success' then
    update private.push_deliveries set status = 'succeeded', http_status = response_status, delivered_at = now(), updated_at = now() where id = delivery.id;
  elsif response_status in (404, 410) then
    update private.push_deliveries set status = 'permanent_failure', http_status = response_status, failure_class = 'expired', updated_at = now() where id = delivery.id;
    update private.push_subscriptions set status = 'inactive', deactivated_at = now(), updated_at = now() where id = delivery.subscription_id;
  elsif outcome = 'temporary_failure' and delivery.attempts < 5 then
    update private.push_deliveries
    set status = 'temporary_failure', http_status = response_status, failure_class = 'temporary',
      available_at = now() + make_interval(mins => least(60, (power(2, delivery.attempts)::integer))), updated_at = now()
    where id = delivery.id;
  else
    update private.push_deliveries set status = 'permanent_failure', http_status = response_status, failure_class = 'permanent', updated_at = now() where id = delivery.id;
  end if;

  update private.notification_outbox outbox
  set status = 'completed', completed_at = now()
  where outbox.id = delivery.outbox_id and outbox.status = 'pending'
    and not exists (select 1 from private.push_deliveries candidate where candidate.outbox_id = outbox.id and candidate.status in ('pending', 'sending', 'temporary_failure'));
end;
$$;

create trigger attendance_enqueue_push after insert or update on public.attendance_records for each row execute function private.enqueue_push_event();
create trigger messages_enqueue_push after insert on public.messages for each row execute function private.enqueue_push_event();
create trigger announcements_enqueue_push after insert or update on public.announcements for each row execute function private.enqueue_push_event();
create trigger media_assets_enqueue_push after insert or update on public.media_assets for each row execute function private.enqueue_push_event();

alter table public.notification_preferences enable row level security;

revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_preferences to service_role;

create policy notification_preferences_select_self on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.school_memberships m where m.user_id = (select auth.uid()) and m.status = 'active'));
create policy notification_preferences_insert_self on public.notification_preferences for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.school_memberships m where m.user_id = (select auth.uid()) and m.status = 'active'));
create policy notification_preferences_update_self on public.notification_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (select 1 from public.school_memberships m where m.user_id = (select auth.uid()) and m.status = 'active'));

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on function private.register_push_subscription(text, text, text) from public, anon;
revoke all on function private.deactivate_push_subscription(text) from public, anon;
revoke all on function private.enqueue_push_event() from public, anon, authenticated;
revoke all on function private.user_can_receive_push_event(uuid, uuid) from public, anon, authenticated;
grant execute on function private.register_push_subscription(text, text, text) to authenticated;
grant execute on function private.deactivate_push_subscription(text) to authenticated;

revoke all on function public.register_push_subscription(text, text, text) from public, anon;
revoke all on function public.deactivate_push_subscription(text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;
grant execute on function public.deactivate_push_subscription(text) to authenticated;

revoke all on function public.claim_push_deliveries(integer) from public, anon, authenticated;
revoke all on function public.complete_push_delivery(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;
grant execute on function public.complete_push_delivery(uuid, text, integer) to service_role;
