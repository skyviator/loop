-- Privacy-safe media withdrawal and object cleanup.
-- Database state revokes access immediately; R2 deletion is asynchronous and
-- idempotent so a provider failure never makes a withdrawn photo visible.

alter table public.media_upload_reservations
  add column quota_released_at timestamptz;

update public.media_upload_reservations
set quota_released_at = coalesce(finalized_at, updated_at, now())
where status <> 'reserved';

alter table public.media_assets
  add column withdrawn_at timestamptz,
  add column withdrawn_by_user_id uuid references auth.users(id) on delete set null,
  add column withdrawal_reason text,
  add column cleanup_completed_at timestamptz,
  add constraint media_assets_withdrawal_reason_check check (
    withdrawal_reason is null or withdrawal_reason in (
      'staff_removed', 'consent_revoked', 'upload_failed',
      'reservation_expired', 'legacy_deleted'
    )
  );

update public.media_assets
set withdrawn_at = coalesce(updated_at, now()),
    withdrawal_reason = 'legacy_deleted'
where status = 'deleted';

alter table public.media_assets
  add constraint media_assets_deleted_has_withdrawal_check
  check (status <> 'deleted' or (withdrawn_at is not null and withdrawal_reason is not null));

alter table public.media_variants
  add column deleted_at timestamptz;

create index media_assets_school_ready_idx
  on public.media_assets (school_id, created_at desc, id)
  where status = 'ready';

create type private.media_cleanup_scope as enum ('asset', 'original');
create type private.media_cleanup_status as enum (
  'pending', 'sending', 'temporary_failure', 'permanent_failure', 'completed', 'cancelled'
);

create table private.media_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  asset_id uuid not null,
  scope private.media_cleanup_scope not null,
  reason text not null check (reason in (
    'staff_removed', 'consent_revoked', 'upload_failed',
    'reservation_expired', 'original_retention'
  )),
  status private.media_cleanup_status not null default 'pending',
  attempts integer not null default 0 check (attempts between 0 and 8),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_failure_class text check (
    last_failure_class is null or last_failure_class in ('provider', 'permanent')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (asset_id, school_id) references public.media_assets(id, school_id) on delete cascade,
  unique (asset_id, scope)
);

create index media_cleanup_jobs_due_idx
  on private.media_cleanup_jobs (available_at, id)
  where status in ('pending', 'temporary_failure');
create index media_cleanup_jobs_school_idx
  on private.media_cleanup_jobs (school_id, created_at desc);

revoke all on private.media_cleanup_jobs from public, anon, authenticated, service_role;

create or replace function private.enqueue_media_cleanup(
  target_asset_id uuid,
  target_scope private.media_cleanup_scope,
  target_reason text,
  target_available_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_asset public.media_assets%rowtype;
begin
  select * into target_asset
  from public.media_assets asset
  where asset.id = target_asset_id;

  if not found then return; end if;

  if target_scope = 'asset' then
    update private.media_cleanup_jobs
    set status = 'cancelled', updated_at = now()
    where asset_id = target_asset.id
      and scope = 'original'
      and status not in ('completed', 'cancelled');
  elsif target_asset.status <> 'ready' or exists (
    select 1 from private.media_cleanup_jobs job
    where job.asset_id = target_asset.id
      and job.scope = 'asset'
      and job.status not in ('completed', 'cancelled')
  ) then
    return;
  end if;

  insert into private.media_cleanup_jobs (
    school_id, asset_id, scope, reason, status, attempts, available_at,
    claimed_at, completed_at, last_failure_class
  ) values (
    target_asset.school_id, target_asset.id, target_scope, target_reason,
    'pending', 0, target_available_at, null, null, null
  )
  on conflict (asset_id, scope) do update
  set reason = excluded.reason,
      status = case
        when private.media_cleanup_jobs.status = 'completed' then private.media_cleanup_jobs.status
        else 'pending'::private.media_cleanup_status
      end,
      attempts = case when private.media_cleanup_jobs.status = 'completed' then private.media_cleanup_jobs.attempts else 0 end,
      available_at = case when private.media_cleanup_jobs.status = 'completed' then private.media_cleanup_jobs.available_at else excluded.available_at end,
      claimed_at = case when private.media_cleanup_jobs.status = 'completed' then private.media_cleanup_jobs.claimed_at else null end,
      completed_at = case when private.media_cleanup_jobs.status = 'completed' then private.media_cleanup_jobs.completed_at else null end,
      last_failure_class = case when private.media_cleanup_jobs.status = 'completed' then private.media_cleanup_jobs.last_failure_class else null end,
      updated_at = now();
end;
$$;

create or replace function private.current_user_can_remove_media_asset(target_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_assets asset
    where asset.id = target_asset_id
      and asset.status in ('ready', 'deleted')
      and (
        private.current_user_has_school_role(
          asset.school_id,
          array['school_admin']::public.school_role[]
        )
        or asset.uploader_user_id = (select auth.uid())
          and private.current_user_has_school_role(
            asset.school_id,
            array['teacher']::public.school_role[]
          )
          and private.current_user_can_operate_classroom(asset.school_id, asset.classroom_id)
      )
  );
$$;

create or replace function private.withdraw_media_asset(
  target_asset_id uuid,
  target_reason text default 'staff_removed'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_asset public.media_assets%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or target_reason <> 'staff_removed'
    or not private.current_user_can_remove_media_asset(target_asset_id) then
    raise exception 'Photo removal is not authorized.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_asset_id::text, 0));
  select * into target_asset
  from public.media_assets asset
  where asset.id = target_asset_id
  for update;

  if not found or not private.current_user_can_remove_media_asset(target_asset_id) then
    raise exception 'Photo removal is not authorized.' using errcode = '42501';
  end if;

  if target_asset.status = 'deleted' then return false; end if;

  update public.media_assets
  set status = 'deleted',
      withdrawn_at = now(),
      withdrawn_by_user_id = current_user_id,
      withdrawal_reason = target_reason,
      cleanup_completed_at = null,
      updated_at = now()
  where id = target_asset.id;

  perform private.enqueue_media_cleanup(target_asset.id, 'asset', target_reason, now());

  insert into public.audit_log (
    actor_user_id, school_id, action, entity_table, entity_id, new_values
  ) values (
    current_user_id, target_asset.school_id, 'media.withdrawn', 'media_assets',
    target_asset.id, jsonb_build_object('status', 'deleted', 'reason', target_reason)
  );
  return true;
end;
$$;

create or replace function public.withdraw_media_asset(target_asset_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.withdraw_media_asset(target_asset_id, 'staff_removed'); $$;

create or replace function private.withdraw_media_for_revoked_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_asset record;
begin
  if old.state = 'granted' and new.state <> 'granted' then
    for affected_asset in
      select asset.id, asset.school_id, asset.status, asset.reservation_id
      from public.media_assets asset
      join public.media_asset_children tagged
        on tagged.asset_id = asset.id and tagged.school_id = asset.school_id
      where tagged.child_id = new.child_id
        and tagged.school_id = new.school_id
        and asset.status in ('pending', 'ready')
      for update of asset
    loop
      if affected_asset.status = 'pending' then
        update public.media_upload_reservations
        set status = 'failed', updated_at = now()
        where id = affected_asset.reservation_id and status = 'reserved';
      end if;

      update public.media_assets
      set status = 'deleted',
          withdrawn_at = now(),
          withdrawn_by_user_id = (select auth.uid()),
          withdrawal_reason = 'consent_revoked',
          cleanup_completed_at = null,
          updated_at = now()
      where id = affected_asset.id;

      perform private.enqueue_media_cleanup(
        affected_asset.id, 'asset', 'consent_revoked', now()
      );

      insert into public.audit_log (
        actor_user_id, school_id, action, entity_table, entity_id, new_values
      ) values (
        (select auth.uid()), affected_asset.school_id,
        'media.consent_withdrawn', 'media_assets', affected_asset.id,
        jsonb_build_object('status', 'deleted', 'reason', 'consent_revoked')
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger media_consent_withdraw_existing
after update of state on public.child_media_consents
for each row execute function private.withdraw_media_for_revoked_consent();

create or replace function private.schedule_original_retention_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ready' and old.status is distinct from 'ready' then
    perform private.enqueue_media_cleanup(
      new.id,
      'original',
      'original_retention',
      coalesce(new.ready_at, now()) + interval '30 days'
    );
  end if;
  return new;
end;
$$;

create trigger media_assets_schedule_original_cleanup
after update of status on public.media_assets
for each row execute function private.schedule_original_retention_cleanup();

-- Existing ready assets receive the same private-original retention policy.
insert into private.media_cleanup_jobs (
  school_id, asset_id, scope, reason, available_at
)
select asset.school_id, asset.id, 'original', 'original_retention',
  coalesce(asset.ready_at, asset.created_at) + interval '30 days'
from public.media_assets asset
where asset.status = 'ready'
  and exists (
    select 1 from public.media_variants variant
    where variant.asset_id = asset.id
      and variant.kind = 'original'
      and variant.status = 'ready'
  )
on conflict (asset_id, scope) do nothing;

-- Recheck pending state and current consent at finalization time. Ownership of
-- a reservation is never sufficient after consent or assignment changes.
create or replace function private.current_user_can_finalize_media_reservation(target_reservation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_upload_reservations reservation
    join public.media_assets asset
      on asset.reservation_id = reservation.id and asset.school_id = reservation.school_id
    where reservation.id = target_reservation_id
      and reservation.status = 'reserved'
      and reservation.expires_at > now()
      and reservation.uploader_user_id = (select auth.uid())
      and asset.status = 'pending'
      and private.current_user_membership_matches(
        reservation.school_id,
        reservation.uploader_membership_id,
        array['school_admin', 'teacher']::public.school_role[]
      )
      and private.current_user_can_operate_classroom(
        reservation.school_id,
        reservation.classroom_id
      )
      and exists (
        select 1 from public.media_asset_children tagged
        where tagged.asset_id = asset.id and tagged.school_id = reservation.school_id
      )
      and not exists (
        select 1
        from public.media_asset_children tagged
        where tagged.asset_id = asset.id
          and tagged.school_id = reservation.school_id
          and not exists (
            select 1
            from public.children child
            join public.child_enrollments enrollment
              on enrollment.child_id = child.id
              and enrollment.school_id = child.school_id
              and enrollment.classroom_id = reservation.classroom_id
              and enrollment.status = 'active'
              and enrollment.starts_on <= current_date
              and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
            join public.child_media_consents consent
              on consent.child_id = child.id
              and consent.school_id = child.school_id
              and consent.state = 'granted'
            where child.id = tagged.child_id
              and child.school_id = reservation.school_id
              and child.status = 'active'
          )
      )
  );
$$;

-- Reservation creation no longer releases stale quota before stale R2 objects
-- have been deleted. Expired reservations are queued and remain counted until
-- cleanup completion.
create or replace function private.reserve_photo_upload(
  target_classroom_id uuid,
  target_child_ids uuid[],
  variant_manifest jsonb,
  photo_caption text default null,
  photo_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_school_id uuid;
  uploader_membership_id uuid;
  reservation_id uuid := gen_random_uuid();
  asset_id uuid := gen_random_uuid();
  requested_bytes bigint;
  allowance_bytes bigint;
  usage_row public.school_storage_usage%rowtype;
  variant record;
  stale record;
  variants_result jsonb := '[]'::jsonb;
begin
  if current_user_id is null or cardinality(target_child_ids) < 1 or cardinality(target_child_ids) > 50
    or cardinality(target_child_ids) <> (select count(distinct child_id)::integer from unnest(target_child_ids) child_id)
    or jsonb_typeof(variant_manifest) <> 'array' or jsonb_array_length(variant_manifest) <> 3
    or (photo_caption is not null and char_length(trim(photo_caption)) not between 1 and 300) then
    raise exception 'The photo reservation is invalid.' using errcode = '22023';
  end if;

  select classroom.school_id into target_school_id
  from public.classrooms classroom
  where classroom.id = target_classroom_id and classroom.status = 'active';

  select membership.id into uploader_membership_id
  from public.school_memberships membership
  where membership.school_id = target_school_id
    and membership.user_id = current_user_id
    and membership.role in ('school_admin', 'teacher')
    and membership.status = 'active'
  limit 1;

  if target_school_id is null or uploader_membership_id is null
    or not private.current_user_can_access_classroom(target_school_id, target_classroom_id)
    or not private.school_feature_is_enabled(target_school_id, 'photos') then
    raise exception 'Photo upload is not authorized.' using errcode = '42501';
  end if;

  if (select count(*)
      from public.child_enrollments enrollment
      join public.child_media_consents consent
        on consent.child_id = enrollment.child_id
        and consent.school_id = enrollment.school_id
        and consent.state = 'granted'
      where enrollment.school_id = target_school_id
        and enrollment.classroom_id = target_classroom_id
        and enrollment.status = 'active'
        and enrollment.child_id = any(target_child_ids)) <> cardinality(target_child_ids) then
    raise exception 'Every tagged child must be actively enrolled here with granted media consent.' using errcode = '42501';
  end if;

  if (select count(distinct item.kind) from jsonb_to_recordset(variant_manifest) item(kind text)) <> 3
    or exists (
      select 1
      from jsonb_to_recordset(variant_manifest)
        item(kind text, content_type text, byte_size bigint, width integer, height integer)
      where item.kind not in ('original', 'display', 'thumbnail')
        or item.content_type <> 'image/jpeg'
        or item.byte_size <= 0
        or item.byte_size > case item.kind when 'original' then 8388608 when 'display' then 5242880 else 1048576 end
        or greatest(item.width, item.height) > case item.kind when 'original' then 2560 when 'display' then 1600 else 400 end
        or least(item.width, item.height) <= 0
    ) then
    raise exception 'The photo variants do not meet Loop upload limits.' using errcode = '22023';
  end if;

  select sum(item.byte_size) into requested_bytes
  from jsonb_to_recordset(variant_manifest) item(byte_size bigint);

  insert into public.school_storage_usage (school_id)
  values (target_school_id)
  on conflict do nothing;
  select * into usage_row
  from public.school_storage_usage usage
  where usage.school_id = target_school_id
  for update;

  for stale in
    select reservation.id, asset.id as asset_id
    from public.media_upload_reservations reservation
    join public.media_assets asset
      on asset.reservation_id = reservation.id and asset.school_id = reservation.school_id
    where reservation.school_id = target_school_id
      and reservation.status = 'reserved'
      and reservation.expires_at <= now()
    for update of reservation, asset
  loop
    update public.media_upload_reservations
    set status = 'expired', updated_at = now()
    where id = stale.id;
    update public.media_assets
    set status = 'deleted', withdrawn_at = now(),
        withdrawal_reason = 'reservation_expired', updated_at = now()
    where id = stale.asset_id;
    perform private.enqueue_media_cleanup(
      stale.asset_id, 'asset', 'reservation_expired', now()
    );
  end loop;

  select plan.storage_allowance_bytes into allowance_bytes
  from public.schools school
  join public.plans plan on plan.id = school.plan_id
  where school.id = target_school_id
    and school.status = 'active'
    and plan.status = 'active';

  if allowance_bytes is null
    or usage_row.used_bytes + usage_row.reserved_bytes + requested_bytes > allowance_bytes then
    raise exception 'The school photo storage allowance has been reached.' using errcode = 'P0001';
  end if;

  update public.school_storage_usage
  set reserved_bytes = reserved_bytes + requested_bytes, updated_at = now()
  where school_id = target_school_id;

  insert into public.media_upload_reservations (
    id, school_id, classroom_id, uploader_membership_id,
    uploader_user_id, reserved_bytes, expires_at
  ) values (
    reservation_id, target_school_id, target_classroom_id,
    uploader_membership_id, current_user_id, requested_bytes,
    now() + interval '10 minutes'
  );
  insert into public.media_assets (
    id, reservation_id, school_id, classroom_id,
    uploader_membership_id, uploader_user_id, caption, captured_at
  ) values (
    asset_id, reservation_id, target_school_id, target_classroom_id,
    uploader_membership_id, current_user_id,
    nullif(trim(photo_caption), ''), photo_captured_at
  );
  insert into public.media_asset_children (asset_id, child_id, school_id)
  select asset_id, child_id, target_school_id from unnest(target_child_ids) child_id;

  for variant in
    select * from jsonb_to_recordset(variant_manifest)
      item(kind text, content_type text, byte_size bigint, width integer, height integer)
  loop
    declare
      variant_id uuid := gen_random_uuid();
      prefix text := case variant.kind when 'original' then 'originals' when 'display' then 'display' else 'thumbs' end;
      generated_key text := prefix || '/' || target_school_id || '/' || asset_id || '/' || variant_id || '.jpg';
    begin
      insert into public.media_variants (
        id, school_id, asset_id, kind, object_key,
        content_type, byte_size, width, height
      ) values (
        variant_id, target_school_id, asset_id,
        variant.kind::public.media_variant_kind, generated_key,
        variant.content_type, variant.byte_size, variant.width, variant.height
      );
      variants_result := variants_result || jsonb_build_array(
        jsonb_build_object(
          'kind', variant.kind,
          'object_key', generated_key,
          'content_type', variant.content_type
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'reservation_id', reservation_id,
    'asset_id', asset_id,
    'expires_at', now() + interval '10 minutes',
    'variants', variants_result
  );
end;
$$;

create or replace function public.finalize_photo_upload(
  target_reservation_id uuid,
  actual_manifest jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation public.media_upload_reservations%rowtype;
  finalized_asset public.media_assets%rowtype;
  total_actual bigint;
begin
  if jsonb_typeof(actual_manifest) <> 'array'
    or jsonb_array_length(actual_manifest) <> 3 then
    raise exception 'Final media metadata is invalid.' using errcode = '22023';
  end if;

  select * into reservation
  from public.media_upload_reservations
  where id = target_reservation_id
  for update;

  if reservation.id is null or reservation.status <> 'reserved'
    or reservation.expires_at <= now() then
    raise exception 'The upload reservation is unavailable.' using errcode = 'P0001';
  end if;

  select * into finalized_asset
  from public.media_assets asset
  where asset.reservation_id = reservation.id
  for update;

  if not found or finalized_asset.status <> 'pending'
    or exists (
      select 1
      from public.media_asset_children tagged
      where tagged.asset_id = finalized_asset.id
        and not exists (
          select 1
          from public.children child
          join public.child_enrollments enrollment
            on enrollment.child_id = child.id
            and enrollment.school_id = child.school_id
            and enrollment.classroom_id = reservation.classroom_id
            and enrollment.status = 'active'
            and enrollment.starts_on <= current_date
            and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
          join public.child_media_consents consent
            on consent.child_id = child.id
            and consent.school_id = child.school_id
            and consent.state = 'granted'
          where child.id = tagged.child_id
            and child.school_id = reservation.school_id
            and child.status = 'active'
        )
    ) then
    raise exception 'The upload reservation is unavailable.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.media_variants expected
    full join jsonb_to_recordset(actual_manifest)
      actual(kind text, object_key text, content_type text, byte_size bigint)
      on actual.kind = expected.kind::text
      and actual.object_key = expected.object_key
    where expected.asset_id = finalized_asset.id
      and (
        actual.kind is null
        or actual.content_type <> expected.content_type
        or actual.byte_size <> expected.byte_size
      )
  ) or (
    select count(*) from jsonb_to_recordset(actual_manifest) actual(kind text)
  ) <> 3 then
    raise exception 'Uploaded objects do not match the reservation.' using errcode = '22023';
  end if;

  select sum(actual.byte_size) into total_actual
  from jsonb_to_recordset(actual_manifest) actual(byte_size bigint);

  update public.media_variants
  set status = 'ready', updated_at = now()
  where asset_id = finalized_asset.id;
  update public.media_assets
  set status = 'ready', ready_at = now(), total_bytes = total_actual,
      updated_at = now()
  where id = finalized_asset.id;
  update public.media_upload_reservations
  set status = 'ready', actual_bytes = total_actual,
      finalized_at = now(), quota_released_at = now(), updated_at = now()
  where id = reservation.id;
  update public.school_storage_usage
  set reserved_bytes = greatest(0, reserved_bytes - reservation.reserved_bytes),
      used_bytes = used_bytes + total_actual,
      updated_at = now()
  where school_id = reservation.school_id;

  return finalized_asset.id;
end;
$$;

create or replace function public.fail_photo_upload(target_reservation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation public.media_upload_reservations%rowtype;
  failed_asset public.media_assets%rowtype;
begin
  select * into reservation
  from public.media_upload_reservations
  where id = target_reservation_id
  for update;

  if reservation.id is null or reservation.status <> 'reserved' then return; end if;

  select * into failed_asset
  from public.media_assets
  where reservation_id = reservation.id
  for update;

  update public.media_upload_reservations
  set status = 'failed', updated_at = now()
  where id = reservation.id;
  update public.media_assets
  set status = 'deleted', withdrawn_at = now(),
      withdrawal_reason = 'upload_failed', updated_at = now()
  where id = failed_asset.id;
  update public.media_variants
  set status = 'failed', updated_at = now()
  where asset_id = failed_asset.id;

  perform private.enqueue_media_cleanup(
    failed_asset.id, 'asset', 'upload_failed', now()
  );
end;
$$;

create or replace function public.claim_media_cleanup_jobs(batch_size integer default 10)
returns table (
  cleanup_id uuid,
  asset_id uuid,
  cleanup_scope text,
  object_keys text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale record;
begin
  if batch_size < 1 or batch_size > 50 then
    raise exception 'Invalid batch size';
  end if;

  update private.media_cleanup_jobs job
  set status = case
        when job.attempts < 8 then 'temporary_failure'::private.media_cleanup_status
        else 'permanent_failure'::private.media_cleanup_status
      end,
      available_at = case when job.attempts < 8 then now() else job.available_at end,
      last_failure_class = case when job.attempts < 8 then 'provider' else 'permanent' end,
      updated_at = now()
  where job.status = 'sending'
    and job.updated_at <= now() - interval '2 minutes';

  for stale in
    select reservation.id, asset.id as asset_id
    from public.media_upload_reservations reservation
    join public.media_assets asset
      on asset.reservation_id = reservation.id and asset.school_id = reservation.school_id
    where reservation.status = 'reserved'
      and reservation.expires_at <= now()
    for update of reservation, asset skip locked
  loop
    update public.media_upload_reservations
    set status = 'expired', updated_at = now()
    where id = stale.id;
    update public.media_assets
    set status = 'deleted', withdrawn_at = now(),
        withdrawal_reason = 'reservation_expired', updated_at = now()
    where id = stale.asset_id;
    perform private.enqueue_media_cleanup(
      stale.asset_id, 'asset', 'reservation_expired', now()
    );
  end loop;

  return query
  with picked as (
    select job.id
    from private.media_cleanup_jobs job
    where job.status in ('pending', 'temporary_failure')
      and job.available_at <= now()
    order by job.available_at, job.id
    for update skip locked
    limit batch_size
  ), claimed as (
    update private.media_cleanup_jobs job
    set status = 'sending',
        attempts = job.attempts + 1,
        claimed_at = now(),
        updated_at = now()
    from picked
    where job.id = picked.id
    returning job.id, job.asset_id, job.scope
  )
  select claimed.id,
         claimed.asset_id,
         claimed.scope::text,
         coalesce(array_agg(variant.object_key order by variant.kind)
           filter (where variant.object_key is not null), array[]::text[])
  from claimed
  left join public.media_variants variant
    on variant.asset_id = claimed.asset_id
    and variant.status <> 'deleted'
    and (claimed.scope = 'asset' or variant.kind = 'original')
  group by claimed.id, claimed.asset_id, claimed.scope;
end;
$$;

create or replace function public.complete_media_cleanup_job(
  target_cleanup_id uuid,
  outcome text,
  failure_class text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.media_cleanup_jobs%rowtype;
  target_asset public.media_assets%rowtype;
  target_reservation public.media_upload_reservations%rowtype;
  released_used_bytes bigint := 0;
begin
  if outcome not in ('success', 'temporary_failure', 'permanent_failure') then
    raise exception 'Invalid cleanup outcome';
  end if;
  if failure_class is not null and failure_class not in ('provider', 'permanent') then
    raise exception 'Invalid cleanup failure class';
  end if;

  select * into target_job
  from private.media_cleanup_jobs job
  where job.id = target_cleanup_id
  for update;

  if not found or target_job.status <> 'sending' then return; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_job.asset_id::text, 0)
  );
  select * into target_asset
  from public.media_assets asset
  where asset.id = target_job.asset_id
  for update;

  if outcome = 'success' then
    perform 1
    from public.media_variants variant
    where variant.asset_id = target_job.asset_id
      and variant.status <> 'deleted'
      and (target_job.scope = 'asset' or variant.kind = 'original')
    for update;

    select coalesce(sum(variant.byte_size), 0)
    into released_used_bytes
    from public.media_variants variant
    where variant.asset_id = target_job.asset_id
      and variant.status = 'ready'
      and (target_job.scope = 'asset' or variant.kind = 'original');

    update public.media_variants variant
    set status = 'deleted', deleted_at = now(), updated_at = now()
    where variant.asset_id = target_job.asset_id
      and variant.status <> 'deleted'
      and (target_job.scope = 'asset' or variant.kind = 'original');

    if released_used_bytes > 0 then
      update public.school_storage_usage
      set used_bytes = greatest(0, used_bytes - released_used_bytes),
          updated_at = now()
      where school_id = target_job.school_id;
    end if;

    if target_job.scope = 'asset' then
      select * into target_reservation
      from public.media_upload_reservations reservation
      where reservation.id = target_asset.reservation_id
      for update;

      if target_reservation.status <> 'ready'
        and target_reservation.quota_released_at is null then
        update public.school_storage_usage
        set reserved_bytes = greatest(
              0, reserved_bytes - target_reservation.reserved_bytes
            ),
            updated_at = now()
        where school_id = target_job.school_id;
        update public.media_upload_reservations
        set quota_released_at = now(), updated_at = now()
        where id = target_reservation.id;
      end if;

      update public.media_assets
      set cleanup_completed_at = now(), updated_at = now()
      where id = target_asset.id;
    end if;

    update private.media_cleanup_jobs
    set status = 'completed', completed_at = now(),
        last_failure_class = null, updated_at = now()
    where id = target_job.id;

    insert into public.audit_log (
      actor_user_id, school_id, action, entity_table, entity_id, new_values
    ) values (
      null, target_job.school_id, 'media.cleanup_completed',
      'media_assets', target_job.asset_id,
      jsonb_build_object('scope', target_job.scope::text, 'reason', target_job.reason)
    );
  elsif outcome = 'temporary_failure' and target_job.attempts < 8 then
    update private.media_cleanup_jobs
    set status = 'temporary_failure',
        available_at = now() + make_interval(
          mins => least(60, power(2, target_job.attempts)::integer)
        ),
        last_failure_class = coalesce(failure_class, 'provider'),
        updated_at = now()
    where id = target_job.id;
  else
    update private.media_cleanup_jobs
    set status = 'permanent_failure',
        last_failure_class = coalesce(failure_class, 'permanent'),
        updated_at = now()
    where id = target_job.id;

    insert into public.audit_log (
      actor_user_id, school_id, action, entity_table, entity_id, new_values
    ) values (
      null, target_job.school_id, 'media.cleanup_failed',
      'media_assets', target_job.asset_id,
      jsonb_build_object('scope', target_job.scope::text, 'reason', target_job.reason)
    );
  end if;
end;
$$;

revoke all on function private.enqueue_media_cleanup(uuid, private.media_cleanup_scope, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.current_user_can_remove_media_asset(uuid) from public, anon, authenticated, service_role;
revoke all on function private.withdraw_media_asset(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.withdraw_media_for_revoked_consent() from public, anon, authenticated, service_role;
revoke all on function private.schedule_original_retention_cleanup() from public, anon, authenticated, service_role;

revoke all on function public.withdraw_media_asset(uuid) from public, anon;
grant execute on function private.withdraw_media_asset(uuid, text) to authenticated;
grant execute on function public.withdraw_media_asset(uuid) to authenticated;
revoke all on function public.claim_media_cleanup_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_media_cleanup_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_media_cleanup_jobs(integer) to service_role;
grant execute on function public.complete_media_cleanup_job(uuid, text, text) to service_role;

-- A dedicated worker credential is intentionally separate from Push and R2.
create or replace function private.invoke_media_cleanup_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_secret text;
begin
  select secret.decrypted_secret into worker_url
  from vault.decrypted_secrets secret
  where secret.name = 'loop_media_cleanup_worker_url'
  limit 1;

  select secret.decrypted_secret into worker_secret
  from vault.decrypted_secrets secret
  where secret.name = 'loop_media_cleanup_worker_secret'
  limit 1;

  if worker_url is null or worker_secret is null
    or char_length(worker_secret) < 32 then
    return;
  end if;

  if worker_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/api/internal/media/cleanup$'
    and worker_url !~ '^http://host[.]docker[.]internal(:[0-9]+)?/api/internal/media/cleanup$' then
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

revoke all on function private.invoke_media_cleanup_worker() from public, anon, authenticated, service_role;
grant execute on function private.invoke_media_cleanup_worker() to postgres;

select cron.schedule(
  'loop-media-cleanup-worker',
  '*/5 * * * *',
  'select private.invoke_media_cleanup_worker();'
);
