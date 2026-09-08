-- Step 4: private R2-backed photo metadata and focused school communication.
-- R2 credentials and signed URLs never enter Postgres. Only opaque object keys
-- and verified object metadata are persisted here.

create type public.media_consent_state as enum ('not_recorded', 'granted', 'denied');
create type public.media_upload_status as enum ('reserved', 'ready', 'failed', 'expired');
create type public.media_asset_status as enum ('pending', 'ready', 'failed', 'deleted');
create type public.media_variant_kind as enum ('original', 'display', 'thumbnail');
create type public.communication_target_scope as enum ('school', 'branch', 'classroom');
create type public.publication_status as enum ('draft', 'published', 'archived');
create type public.announcement_priority as enum ('normal', 'important');

alter table public.schools
  add column teachers_can_publish_announcements boolean not null default false,
  add column teachers_can_manage_calendar boolean not null default false;

create table public.child_media_consents (
  child_id uuid primary key,
  school_id uuid not null,
  state public.media_consent_state not null default 'not_recorded',
  changed_by_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, school_id) references public.children(id, school_id) on delete cascade,
  unique (child_id, school_id)
);

insert into public.child_media_consents (child_id, school_id)
select id, school_id from public.children;

create table public.school_storage_usage (
  school_id uuid primary key references public.schools(id) on delete cascade,
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  updated_at timestamptz not null default now()
);

insert into public.school_storage_usage (school_id)
select id from public.schools;

create table public.media_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null,
  uploader_membership_id uuid not null,
  uploader_user_id uuid not null references auth.users(id) on delete restrict,
  status public.media_upload_status not null default 'reserved',
  reserved_bytes bigint not null check (reserved_bytes > 0),
  actual_bytes bigint check (actual_bytes is null or actual_bytes > 0),
  expires_at timestamptz not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete restrict,
  foreign key (uploader_membership_id, school_id) references public.school_memberships(id, school_id) on delete restrict,
  check (expires_at > created_at),
  check ((status = 'ready') = (finalized_at is not null and actual_bytes is not null)),
  unique (id, school_id)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique,
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null,
  uploader_membership_id uuid not null,
  uploader_user_id uuid not null references auth.users(id) on delete restrict,
  status public.media_asset_status not null default 'pending',
  caption text check (caption is null or char_length(trim(caption)) between 1 and 300),
  captured_at timestamptz,
  ready_at timestamptz,
  total_bytes bigint check (total_bytes is null or total_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (reservation_id, school_id) references public.media_upload_reservations(id, school_id) on delete restrict,
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete restrict,
  foreign key (uploader_membership_id, school_id) references public.school_memberships(id, school_id) on delete restrict,
  unique (id, school_id)
);

create table public.media_variants (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  asset_id uuid not null,
  kind public.media_variant_kind not null,
  object_key text not null unique check (object_key ~ '^(originals|display|thumbs)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  content_type text not null check (content_type = 'image/jpeg'),
  byte_size bigint not null check (byte_size > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  status public.media_asset_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (asset_id, school_id) references public.media_assets(id, school_id) on delete cascade,
  unique (asset_id, kind),
  unique (id, school_id)
);

create table public.media_asset_children (
  asset_id uuid not null,
  child_id uuid not null,
  school_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (asset_id, school_id) references public.media_assets(id, school_id) on delete cascade,
  foreign key (child_id, school_id) references public.children(id, school_id) on delete restrict,
  primary key (asset_id, child_id)
);

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  child_id uuid not null,
  guardian_membership_id uuid not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, school_id) references public.children(id, school_id) on delete cascade,
  foreign key (guardian_membership_id, school_id) references public.school_memberships(id, school_id) on delete cascade,
  unique (child_id, guardian_membership_id),
  unique (id, school_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  school_id uuid not null,
  sender_membership_id uuid not null,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (thread_id, school_id) references public.message_threads(id, school_id) on delete cascade,
  foreign key (sender_membership_id, school_id) references public.school_memberships(id, school_id) on delete restrict,
  unique (id, school_id)
);

create table public.message_thread_reads (
  thread_id uuid not null,
  school_id uuid not null,
  membership_id uuid not null,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (thread_id, school_id) references public.message_threads(id, school_id) on delete cascade,
  foreign key (membership_id, school_id) references public.school_memberships(id, school_id) on delete cascade,
  primary key (thread_id, membership_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  target_scope public.communication_target_scope not null,
  branch_id uuid,
  classroom_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  priority public.announcement_priority not null default 'normal',
  status public.publication_status not null default 'draft',
  publish_at timestamptz,
  expires_at timestamptz,
  created_by_membership_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, school_id) references public.branches(id, school_id) on delete restrict,
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete restrict,
  foreign key (created_by_membership_id, school_id) references public.school_memberships(id, school_id) on delete restrict,
  check ((target_scope = 'school' and branch_id is null and classroom_id is null)
    or (target_scope = 'branch' and branch_id is not null and classroom_id is null)
    or (target_scope = 'classroom' and classroom_id is not null)),
  check (status <> 'published' or publish_at is not null),
  check (expires_at is null or publish_at is null or expires_at > publish_at),
  unique (id, school_id)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  target_scope public.communication_target_scope not null,
  branch_id uuid,
  classroom_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  location text check (location is null or char_length(trim(location)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  status public.record_status not null default 'active',
  created_by_membership_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, school_id) references public.branches(id, school_id) on delete restrict,
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete restrict,
  foreign key (created_by_membership_id, school_id) references public.school_memberships(id, school_id) on delete restrict,
  check ((target_scope = 'school' and branch_id is null and classroom_id is null)
    or (target_scope = 'branch' and branch_id is not null and classroom_id is null)
    or (target_scope = 'classroom' and classroom_id is not null)),
  check (ends_at > starts_at),
  unique (id, school_id)
);

create index child_media_consents_school_state_idx on public.child_media_consents (school_id, state, child_id);
create index media_reservations_uploader_status_idx on public.media_upload_reservations (uploader_user_id, status, expires_at);
create index media_assets_classroom_ready_idx on public.media_assets (classroom_id, created_at desc, id) where status = 'ready';
create index media_variants_asset_kind_idx on public.media_variants (asset_id, kind);
create index media_asset_children_child_asset_idx on public.media_asset_children (child_id, asset_id);
create index message_threads_school_child_idx on public.message_threads (school_id, child_id) where status = 'active';
create index messages_thread_created_idx on public.messages (thread_id, created_at desc, id desc);
create index message_reads_membership_idx on public.message_thread_reads (membership_id, last_read_at);
create index announcements_school_published_idx on public.announcements (school_id, publish_at desc, id) where status = 'published';
create index calendar_events_school_starts_idx on public.calendar_events (school_id, starts_at, id) where status = 'active';

create or replace function private.create_default_media_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.child_media_consents (child_id, school_id) values (new.id, new.school_id);
  return new;
end;
$$;

create or replace function private.validate_communication_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_scope = 'classroom' and new.branch_id is not null and not exists (
    select 1 from public.classrooms c where c.id = new.classroom_id and c.school_id = new.school_id and c.branch_id = new.branch_id
  ) then
    raise exception 'The classroom does not belong to the selected branch.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.current_user_can_receive_target(
  target_school_id uuid,
  target_scope public.communication_target_scope,
  target_branch_id uuid,
  target_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_has_school_role(target_school_id, array['school_admin']::public.school_role[])
    or exists (
      select 1
      from public.school_memberships m
      left join public.classroom_staff_assignments a
        on a.membership_id = m.id and a.school_id = m.school_id and a.status = 'active'
        and a.starts_on <= current_date and (a.ends_on is null or a.ends_on >= current_date)
      left join public.classrooms c on c.id = a.classroom_id and c.school_id = a.school_id
      where m.user_id = (select auth.uid()) and m.school_id = target_school_id and m.status = 'active'
        and m.role = 'teacher'
        and (target_scope = 'school' or (target_scope = 'branch' and c.branch_id = target_branch_id)
          or (target_scope = 'classroom' and c.id = target_classroom_id))
    )
    or exists (
      select 1
      from public.school_memberships m
      join public.child_guardians g on g.guardian_membership_id = m.id and g.school_id = m.school_id and g.status = 'active'
      join public.child_enrollments e on e.child_id = g.child_id and e.school_id = g.school_id and e.status = 'active'
      join public.classrooms c on c.id = e.classroom_id and c.school_id = e.school_id
      where m.user_id = (select auth.uid()) and m.school_id = target_school_id and m.status = 'active' and m.role = 'guardian'
        and (target_scope = 'school' or (target_scope = 'branch' and c.branch_id = target_branch_id)
          or (target_scope = 'classroom' and c.id = target_classroom_id))
    );
$$;

create or replace function private.current_user_can_manage_target(
  target_school_id uuid,
  target_scope public.communication_target_scope,
  target_branch_id uuid,
  target_classroom_id uuid,
  school_teacher_permission boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_has_school_role(target_school_id, array['school_admin']::public.school_role[])
    or (school_teacher_permission and target_scope = 'classroom'
      and private.current_user_has_school_role(target_school_id, array['teacher']::public.school_role[])
      and private.current_user_can_access_classroom(target_school_id, target_classroom_id));
$$;

create or replace function private.current_user_can_access_message_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = target_thread_id and t.status = 'active'
      and private.school_feature_is_enabled(t.school_id, 'messaging')
      and (
        private.current_user_has_school_role(t.school_id, array['school_admin']::public.school_role[])
        or private.current_user_membership_matches(t.school_id, t.guardian_membership_id, array['guardian']::public.school_role[])
          and exists (select 1 from public.child_guardians g where g.school_id = t.school_id and g.child_id = t.child_id and g.guardian_membership_id = t.guardian_membership_id and g.status = 'active')
        or exists (
          select 1 from public.child_enrollments e
          where e.school_id = t.school_id and e.child_id = t.child_id and e.status = 'active'
            and private.current_user_has_school_role(t.school_id, array['teacher']::public.school_role[])
            and private.current_user_can_access_classroom(t.school_id, e.classroom_id)
        )
      )
  );
$$;

create or replace function private.current_user_can_access_media_asset(target_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_assets a
    where a.id = target_asset_id and a.status = 'ready'
      and private.school_feature_is_enabled(a.school_id, 'photos')
      and (
        private.current_user_has_school_role(a.school_id, array['school_admin']::public.school_role[])
        or private.current_user_has_school_role(a.school_id, array['teacher']::public.school_role[])
          and private.current_user_can_access_classroom(a.school_id, a.classroom_id)
        or exists (
          select 1 from public.media_asset_children mac
          join public.child_guardians g on g.child_id = mac.child_id and g.school_id = mac.school_id and g.status = 'active'
          where mac.asset_id = a.id
            and private.current_user_membership_matches(a.school_id, g.guardian_membership_id, array['guardian']::public.school_role[])
        )
      )
  );
$$;

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
  variants_result jsonb := '[]'::jsonb;
begin
  if current_user_id is null or cardinality(target_child_ids) < 1 or cardinality(target_child_ids) > 50
    or cardinality(target_child_ids) <> (select count(distinct child_id)::integer from unnest(target_child_ids) child_id)
    or jsonb_typeof(variant_manifest) <> 'array' or jsonb_array_length(variant_manifest) <> 3
    or (photo_caption is not null and char_length(trim(photo_caption)) not between 1 and 300) then
    raise exception 'The photo reservation is invalid.' using errcode = '22023';
  end if;

  select c.school_id into target_school_id from public.classrooms c
  where c.id = target_classroom_id and c.status = 'active';

  select m.id into uploader_membership_id from public.school_memberships m
  where m.school_id = target_school_id and m.user_id = current_user_id
    and m.role in ('school_admin', 'teacher') and m.status = 'active' limit 1;

  if target_school_id is null or uploader_membership_id is null
    or not private.current_user_can_access_classroom(target_school_id, target_classroom_id)
    or not private.school_feature_is_enabled(target_school_id, 'photos') then
    raise exception 'Photo upload is not authorized.' using errcode = '42501';
  end if;

  if (select count(*) from public.child_enrollments e join public.child_media_consents consent
      on consent.child_id = e.child_id and consent.school_id = e.school_id and consent.state = 'granted'
      where e.school_id = target_school_id and e.classroom_id = target_classroom_id and e.status = 'active'
        and e.child_id = any(target_child_ids)) <> cardinality(target_child_ids) then
    raise exception 'Every tagged child must be actively enrolled here with granted media consent.' using errcode = '42501';
  end if;

  if (select count(distinct item.kind) from jsonb_to_recordset(variant_manifest) item(kind text)) <> 3
    or exists (select 1 from jsonb_to_recordset(variant_manifest) item(kind text, content_type text, byte_size bigint, width integer, height integer)
      where item.kind not in ('original', 'display', 'thumbnail') or item.content_type <> 'image/jpeg'
        or item.byte_size <= 0 or item.byte_size > case item.kind when 'original' then 8388608 when 'display' then 5242880 else 1048576 end
        or greatest(item.width, item.height) > case item.kind when 'original' then 2560 when 'display' then 1600 else 400 end
        or least(item.width, item.height) <= 0) then
    raise exception 'The photo variants do not meet Loop upload limits.' using errcode = '22023';
  end if;

  select sum(item.byte_size) into requested_bytes
  from jsonb_to_recordset(variant_manifest) item(byte_size bigint);

  insert into public.school_storage_usage (school_id) values (target_school_id) on conflict do nothing;
  select * into usage_row from public.school_storage_usage where school_id = target_school_id for update;
  update public.media_upload_reservations set status = 'expired', updated_at = now()
    where school_id = target_school_id and status = 'reserved' and expires_at <= now();
  select coalesce(sum(r.reserved_bytes), 0) into usage_row.reserved_bytes
    from public.media_upload_reservations r where r.school_id = target_school_id and r.status = 'reserved';
  select p.storage_allowance_bytes into allowance_bytes from public.schools s join public.plans p on p.id = s.plan_id
    where s.id = target_school_id and s.status = 'active' and p.status = 'active';

  if usage_row.used_bytes + usage_row.reserved_bytes + requested_bytes > allowance_bytes then
    raise exception 'The school photo storage allowance has been reached.' using errcode = 'P0001';
  end if;

  update public.school_storage_usage set reserved_bytes = usage_row.reserved_bytes + requested_bytes, updated_at = now()
    where school_id = target_school_id;
  insert into public.media_upload_reservations (id, school_id, classroom_id, uploader_membership_id, uploader_user_id, reserved_bytes, expires_at)
  values (reservation_id, target_school_id, target_classroom_id, uploader_membership_id, current_user_id, requested_bytes, now() + interval '10 minutes');
  insert into public.media_assets (id, reservation_id, school_id, classroom_id, uploader_membership_id, uploader_user_id, caption, captured_at)
  values (asset_id, reservation_id, target_school_id, target_classroom_id, uploader_membership_id, current_user_id, nullif(trim(photo_caption), ''), photo_captured_at);
  insert into public.media_asset_children (asset_id, child_id, school_id)
  select asset_id, child_id, target_school_id from unnest(target_child_ids) child_id;

  for variant in select * from jsonb_to_recordset(variant_manifest) item(kind text, content_type text, byte_size bigint, width integer, height integer)
  loop
    declare
      variant_id uuid := gen_random_uuid();
      prefix text := case variant.kind when 'original' then 'originals' when 'display' then 'display' else 'thumbs' end;
      generated_key text := prefix || '/' || target_school_id || '/' || asset_id || '/' || variant_id || '.jpg';
    begin
      insert into public.media_variants (id, school_id, asset_id, kind, object_key, content_type, byte_size, width, height)
      values (variant_id, target_school_id, asset_id, variant.kind::public.media_variant_kind, generated_key, variant.content_type, variant.byte_size, variant.width, variant.height);
      variants_result := variants_result || jsonb_build_array(jsonb_build_object('kind', variant.kind, 'object_key', generated_key, 'content_type', variant.content_type));
    end;
  end loop;

  return jsonb_build_object('reservation_id', reservation_id, 'asset_id', asset_id, 'expires_at', now() + interval '10 minutes', 'variants', variants_result);
end;
$$;

create or replace function public.reserve_photo_upload(
  target_classroom_id uuid,
  target_child_ids uuid[],
  variant_manifest jsonb,
  photo_caption text default null,
  photo_captured_at timestamptz default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.reserve_photo_upload(target_classroom_id, target_child_ids, variant_manifest, photo_caption, photo_captured_at); $$;

create or replace function public.finalize_photo_upload(target_reservation_id uuid, actual_manifest jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation public.media_upload_reservations%rowtype;
  total_actual bigint;
  finalized_asset_id uuid;
begin
  if jsonb_typeof(actual_manifest) <> 'array' or jsonb_array_length(actual_manifest) <> 3 then
    raise exception 'Final media metadata is invalid.' using errcode = '22023';
  end if;
  select * into reservation from public.media_upload_reservations where id = target_reservation_id for update;
  if reservation.id is null or reservation.status <> 'reserved' or reservation.expires_at <= now() then
    raise exception 'The upload reservation is unavailable.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.media_variants expected
    full join jsonb_to_recordset(actual_manifest) actual(kind text, object_key text, content_type text, byte_size bigint)
      on actual.kind = expected.kind::text and actual.object_key = expected.object_key
    where expected.asset_id = (select a.id from public.media_assets a where a.reservation_id = reservation.id)
      and (actual.kind is null or actual.content_type <> expected.content_type or actual.byte_size <> expected.byte_size)
  ) or (select count(*) from jsonb_to_recordset(actual_manifest) actual(kind text)) <> 3 then
    raise exception 'Uploaded objects do not match the reservation.' using errcode = '22023';
  end if;
  select sum(actual.byte_size) into total_actual from jsonb_to_recordset(actual_manifest) actual(byte_size bigint);
  select a.id into finalized_asset_id from public.media_assets a where a.reservation_id = reservation.id;
  update public.media_variants set status = 'ready', updated_at = now() where media_variants.asset_id = finalized_asset_id;
  update public.media_assets set status = 'ready', ready_at = now(), total_bytes = total_actual, updated_at = now() where id = finalized_asset_id;
  update public.media_upload_reservations set status = 'ready', actual_bytes = total_actual, finalized_at = now(), updated_at = now() where id = reservation.id;
  update public.school_storage_usage set reserved_bytes = greatest(0, reserved_bytes - reservation.reserved_bytes), used_bytes = used_bytes + total_actual, updated_at = now()
    where school_id = reservation.school_id;
  return finalized_asset_id;
end;
$$;

create or replace function public.fail_photo_upload(target_reservation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare reservation public.media_upload_reservations%rowtype;
begin
  select * into reservation from public.media_upload_reservations where id = target_reservation_id for update;
  if reservation.id is not null and reservation.status = 'reserved' then
    update public.media_upload_reservations set status = 'failed', updated_at = now() where id = reservation.id;
    update public.media_assets set status = 'failed', updated_at = now() where reservation_id = reservation.id;
    update public.media_variants set status = 'failed', updated_at = now() where asset_id in (select id from public.media_assets where reservation_id = reservation.id);
    update public.school_storage_usage set reserved_bytes = greatest(0, reserved_bytes - reservation.reserved_bytes), updated_at = now() where school_id = reservation.school_id;
  end if;
end;
$$;

create or replace function private.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.message_threads set updated_at = new.created_at where id = new.thread_id;
  end if;
  perform realtime.broadcast_changes('message-thread:' || coalesce(new.thread_id, old.thread_id)::text, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
end;
$$;

create or replace function private.preserve_communication_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by_membership_id is distinct from old.created_by_membership_id
    or new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Communication creator attribution cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.create_default_media_consent() from public, anon, authenticated;
revoke all on function private.validate_communication_target() from public, anon, authenticated;
revoke all on function private.current_user_can_receive_target(uuid, public.communication_target_scope, uuid, uuid) from public, anon;
revoke all on function private.current_user_can_manage_target(uuid, public.communication_target_scope, uuid, uuid, boolean) from public, anon;
revoke all on function private.current_user_can_access_message_thread(uuid) from public, anon;
revoke all on function private.current_user_can_access_media_asset(uuid) from public, anon;
revoke all on function private.reserve_photo_upload(uuid, uuid[], jsonb, text, timestamptz) from public, anon;
revoke all on function private.broadcast_message_change() from public, anon, authenticated;
revoke all on function private.preserve_communication_creator() from public, anon, authenticated;
grant execute on function private.current_user_can_receive_target(uuid, public.communication_target_scope, uuid, uuid) to authenticated;
grant execute on function private.current_user_can_manage_target(uuid, public.communication_target_scope, uuid, uuid, boolean) to authenticated;
grant execute on function private.current_user_can_access_message_thread(uuid) to authenticated;
grant execute on function private.current_user_can_access_media_asset(uuid) to authenticated;
grant execute on function private.reserve_photo_upload(uuid, uuid[], jsonb, text, timestamptz) to authenticated;

create trigger children_create_media_consent after insert on public.children for each row execute function private.create_default_media_consent();
create trigger announcements_validate_target before insert or update on public.announcements for each row execute function private.validate_communication_target();
create trigger calendar_events_validate_target before insert or update on public.calendar_events for each row execute function private.validate_communication_target();
create trigger announcements_preserve_creator before update on public.announcements for each row execute function private.preserve_communication_creator();
create trigger calendar_events_preserve_creator before update on public.calendar_events for each row execute function private.preserve_communication_creator();
create trigger messages_broadcast_change after insert or update or delete on public.messages for each row execute function private.broadcast_message_change();

do $$
declare table_name text;
begin
  foreach table_name in array array['child_media_consents', 'media_upload_reservations', 'media_assets', 'media_variants', 'message_threads', 'message_thread_reads', 'announcements', 'calendar_events']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end;
$$;

create or replace function private.write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  before_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  after_data jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  safe_keys text[];
begin
  safe_keys := case tg_table_name
    when 'school_memberships' then array['user_id', 'role', 'status']
    when 'classroom_staff_assignments' then array['classroom_id', 'membership_id', 'status', 'starts_on', 'ends_on']
    when 'school_feature_settings' then array['feature_key', 'is_enabled']
    when 'timetable_slots' then array['classroom_id', 'day_of_week', 'start_time', 'end_time', 'care_feature_key', 'status']
    when 'timetable_exceptions' then array['classroom_id', 'timetable_slot_id', 'service_date', 'kind', 'status']
    when 'invitations' then array['invited_role', 'status', 'expires_at', 'revoked_at', 'accepted_at', 'accepted_by_user_id']
    when 'platform_administrators' then array['user_id', 'status']
    when 'schools' then array['plan_id', 'status', 'teachers_can_manage_timetable', 'teachers_can_publish_announcements', 'teachers_can_manage_calendar']
    when 'child_media_consents' then array['child_id', 'state', 'changed_by_user_id', 'changed_at']
    when 'announcements' then array['target_scope', 'branch_id', 'classroom_id', 'priority', 'status', 'publish_at', 'expires_at']
    when 'calendar_events' then array['target_scope', 'branch_id', 'classroom_id', 'starts_at', 'ends_at', 'all_day', 'status']
    else array[]::text[]
  end;
  insert into public.audit_log (actor_user_id, school_id, action, entity_table, entity_id, old_values, new_values)
  values ((select auth.uid()), nullif(row_data ->> 'school_id', '')::uuid, tg_table_name || '.' || lower(tg_op), tg_table_name,
    coalesce(nullif(row_data ->> 'id', '')::uuid, nullif(row_data ->> 'child_id', '')::uuid, nullif(row_data ->> 'user_id', '')::uuid),
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(before_data) where key = any(safe_keys)),
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(after_data) where key = any(safe_keys)));
  return coalesce(new, old);
end;
$$;

create trigger audit_child_media_consents after insert or update or delete on public.child_media_consents for each row execute function private.write_audit_event();
create trigger audit_announcements after insert or update or delete on public.announcements for each row execute function private.write_audit_event();
create trigger audit_calendar_events after insert or update or delete on public.calendar_events for each row execute function private.write_audit_event();

alter table public.child_media_consents enable row level security;
alter table public.school_storage_usage enable row level security;
alter table public.media_upload_reservations enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_variants enable row level security;
alter table public.media_asset_children enable row level security;
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.message_thread_reads enable row level security;
alter table public.announcements enable row level security;
alter table public.calendar_events enable row level security;

revoke all on public.child_media_consents, public.school_storage_usage, public.media_upload_reservations, public.media_assets,
  public.media_variants, public.media_asset_children, public.message_threads, public.messages, public.message_thread_reads,
  public.announcements, public.calendar_events from anon, authenticated;

grant select, insert, update, delete on public.child_media_consents to service_role;
grant select, insert, update, delete on public.school_storage_usage to service_role;
grant select, insert, update, delete on public.media_upload_reservations to service_role;
grant select, insert, update, delete on public.media_assets to service_role;
grant select, insert, update, delete on public.media_variants to service_role;
grant select, insert, update, delete on public.media_asset_children to service_role;
grant select, insert, update, delete on public.message_threads, public.messages, public.message_thread_reads, public.announcements, public.calendar_events to service_role;

grant select, insert, update on public.child_media_consents to authenticated;
grant select on public.school_storage_usage, public.media_upload_reservations, public.media_assets, public.media_variants, public.media_asset_children to authenticated;
grant select, insert, update on public.message_threads, public.messages, public.message_thread_reads to authenticated;
grant select, insert, update on public.announcements, public.calendar_events to authenticated;
revoke all on function public.reserve_photo_upload(uuid, uuid[], jsonb, text, timestamptz) from public, anon;
grant execute on function public.reserve_photo_upload(uuid, uuid[], jsonb, text, timestamptz) to authenticated;
revoke all on function public.finalize_photo_upload(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_photo_upload(uuid) from public, anon, authenticated;
grant execute on function public.finalize_photo_upload(uuid, jsonb) to service_role;
grant execute on function public.fail_photo_upload(uuid) to service_role;

create policy media_consents_select_authorized on public.child_media_consents for select to authenticated using (private.current_user_can_access_child(school_id, child_id));
create policy media_consents_insert_admin on public.child_media_consents for insert to authenticated with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]) and changed_by_user_id = (select auth.uid())
);
create policy media_consents_update_admin on public.child_media_consents for update to authenticated using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
) with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]) and changed_by_user_id = (select auth.uid()));
create policy school_storage_usage_select_admin on public.school_storage_usage for select to authenticated using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);
create policy media_reservations_select_uploader on public.media_upload_reservations for select to authenticated using (uploader_user_id = (select auth.uid()));
create policy media_assets_select_authorized on public.media_assets for select to authenticated using (private.current_user_can_access_media_asset(id));
create policy media_variants_select_authorized on public.media_variants for select to authenticated using (private.current_user_can_access_media_asset(asset_id));
create policy media_asset_children_select_authorized on public.media_asset_children for select to authenticated using (private.current_user_can_access_media_asset(asset_id));

create policy message_threads_select_authorized on public.message_threads for select to authenticated using (private.current_user_can_access_message_thread(id));
create policy message_threads_insert_authorized on public.message_threads for insert to authenticated with check (
  private.school_feature_is_enabled(school_id, 'messaging') and (
    private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
    or private.current_user_membership_matches(school_id, guardian_membership_id, array['guardian']::public.school_role[])
      and exists (select 1 from public.child_guardians g where g.school_id = message_threads.school_id and g.child_id = message_threads.child_id and g.guardian_membership_id = message_threads.guardian_membership_id and g.status = 'active')
  )
);
create policy message_threads_update_admin on public.message_threads for update to authenticated using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
) with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy messages_select_authorized on public.messages for select to authenticated using (private.current_user_can_access_message_thread(thread_id));
create policy messages_insert_authorized on public.messages for insert to authenticated with check (
  sender_user_id = (select auth.uid()) and private.current_user_can_access_message_thread(thread_id)
  and private.current_user_membership_matches(school_id, sender_membership_id, array['school_admin', 'teacher', 'guardian']::public.school_role[])
);
create policy message_reads_select_authorized on public.message_thread_reads for select to authenticated using (private.current_user_can_access_message_thread(thread_id));
create policy message_reads_insert_self on public.message_thread_reads for insert to authenticated with check (
  private.current_user_can_access_message_thread(thread_id)
  and private.current_user_membership_matches(school_id, membership_id, array['school_admin', 'teacher', 'guardian']::public.school_role[])
);
create policy message_reads_update_self on public.message_thread_reads for update to authenticated using (
  private.current_user_membership_matches(school_id, membership_id, array['school_admin', 'teacher', 'guardian']::public.school_role[])
) with check (private.current_user_can_access_message_thread(thread_id)
  and private.current_user_membership_matches(school_id, membership_id, array['school_admin', 'teacher', 'guardian']::public.school_role[]));

create policy announcements_select_relevant on public.announcements for select to authenticated using (
  private.school_feature_is_enabled(school_id, 'announcements') and (
    private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
    or (status = 'published' and publish_at <= now() and (expires_at is null or expires_at > now())
      and private.current_user_can_receive_target(school_id, target_scope, branch_id, classroom_id))
  )
);
create policy announcements_insert_authorized on public.announcements for insert to authenticated with check (
  created_by_user_id = (select auth.uid()) and private.school_feature_is_enabled(school_id, 'announcements')
  and private.current_user_membership_matches(school_id, created_by_membership_id, array['school_admin', 'teacher']::public.school_role[])
  and private.current_user_can_manage_target(school_id, target_scope, branch_id, classroom_id,
    (select s.teachers_can_publish_announcements from public.schools s where s.id = announcements.school_id))
);
create policy announcements_update_authorized on public.announcements for update to authenticated using (
  private.current_user_can_manage_target(school_id, target_scope, branch_id, classroom_id,
    (select s.teachers_can_publish_announcements from public.schools s where s.id = announcements.school_id))
) with check (private.school_feature_is_enabled(school_id, 'announcements') and private.current_user_can_manage_target(school_id, target_scope, branch_id, classroom_id,
    (select s.teachers_can_publish_announcements from public.schools s where s.id = announcements.school_id)));

create policy calendar_select_relevant on public.calendar_events for select to authenticated using (
  private.school_feature_is_enabled(school_id, 'calendar') and private.current_user_can_receive_target(school_id, target_scope, branch_id, classroom_id)
);
create policy calendar_insert_authorized on public.calendar_events for insert to authenticated with check (
  created_by_user_id = (select auth.uid()) and private.school_feature_is_enabled(school_id, 'calendar')
  and private.current_user_membership_matches(school_id, created_by_membership_id, array['school_admin', 'teacher']::public.school_role[])
  and private.current_user_can_manage_target(school_id, target_scope, branch_id, classroom_id,
    (select s.teachers_can_manage_calendar from public.schools s where s.id = calendar_events.school_id))
);
create policy calendar_update_authorized on public.calendar_events for update to authenticated using (
  private.current_user_can_manage_target(school_id, target_scope, branch_id, classroom_id,
    (select s.teachers_can_manage_calendar from public.schools s where s.id = calendar_events.school_id))
) with check (private.school_feature_is_enabled(school_id, 'calendar') and private.current_user_can_manage_target(school_id, target_scope, branch_id, classroom_id,
    (select s.teachers_can_manage_calendar from public.schools s where s.id = calendar_events.school_id)));

create policy message_thread_broadcast_select
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) ~ '^message-thread:[0-9a-f-]{36}$'
  and private.current_user_can_access_message_thread(substring((select realtime.topic()) from '^message-thread:([0-9a-f-]{36})$')::uuid)
);
