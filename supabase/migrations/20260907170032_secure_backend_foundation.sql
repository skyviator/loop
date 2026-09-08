create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.record_status as enum ('active', 'inactive', 'archived');
create type public.school_role as enum ('school_admin', 'teacher', 'guardian');
create type public.enrollment_status as enum ('planned', 'active', 'completed', 'cancelled');
create type public.feature_category as enum ('core', 'care', 'communication', 'media');
create type public.timetable_exception_kind as enum ('cancelled', 'changed', 'replacement', 'additional');
create type public.care_category as enum ('meal', 'bottle', 'water', 'sleep', 'toilet', 'nappy', 'mood', 'activity', 'note');
create type public.care_event_status as enum ('recorded', 'corrected', 'voided');
create type public.meal_outcome as enum ('ate_all', 'ate_most', 'ate_some', 'ate_little', 'none_refused');
create type public.attendance_status as enum ('expected', 'present', 'absent', 'excused');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  preferred_locale text not null default 'en-LK' check (char_length(preferred_locale) between 2 and 16),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_administrators (
  user_id uuid primary key references public.user_profiles(id) on delete restrict,
  status public.record_status not null default 'active',
  granted_by_user_id uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,49}$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  max_active_children integer not null check (max_active_children > 0),
  max_staff integer not null check (max_staff > 0),
  storage_allowance_bytes bigint not null default 0 check (storage_allowance_bytes >= 0),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feature_catalogue (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,49}$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  category public.feature_category not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null references public.feature_catalogue(key) on update cascade on delete restrict,
  is_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'Asia/Colombo' check (char_length(timezone) between 1 and 80),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role public.school_role not null,
  status public.record_status not null default 'active',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id),
  unique (id, school_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id)
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  branch_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, school_id) references public.branches(id, school_id) on delete cascade,
  unique (branch_id, name),
  unique (id, school_id)
);

create table public.classroom_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null,
  membership_id uuid not null,
  status public.record_status not null default 'active',
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete cascade,
  foreign key (membership_id, school_id) references public.school_memberships(id, school_id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on),
  unique (classroom_id, membership_id, starts_on),
  unique (id, school_id)
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  preferred_name text not null check (char_length(trim(preferred_name)) between 1 and 80),
  legal_name text check (legal_name is null or char_length(trim(legal_name)) between 1 and 160),
  date_of_birth date,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);

create table public.child_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  child_id uuid not null,
  classroom_id uuid not null,
  starts_on date not null,
  ends_on date,
  status public.enrollment_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, school_id) references public.children(id, school_id) on delete cascade,
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on),
  unique (id, school_id)
);

create unique index child_enrollments_one_active_per_child
  on public.child_enrollments (child_id)
  where status = 'active';

create table public.child_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  child_id uuid not null,
  guardian_membership_id uuid not null,
  relationship_label text not null check (char_length(trim(relationship_label)) between 1 and 50),
  is_primary boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, school_id) references public.children(id, school_id) on delete cascade,
  foreign key (guardian_membership_id, school_id) references public.school_memberships(id, school_id) on delete cascade,
  unique (child_id, guardian_membership_id),
  unique (id, school_id)
);

create table public.school_feature_settings (
  school_id uuid not null references public.schools(id) on delete cascade,
  feature_key text not null references public.feature_catalogue(key) on update cascade on delete restrict,
  is_enabled boolean not null default false,
  configured_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, feature_key)
);

create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  care_feature_key text references public.feature_catalogue(key) on update cascade on delete restrict,
  status public.record_status not null default 'active',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete cascade,
  check (end_time > start_time),
  unique (id, school_id)
);

create table public.timetable_exceptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null,
  timetable_slot_id uuid,
  service_date date not null,
  kind public.timetable_exception_kind not null,
  replacement_title text check (replacement_title is null or char_length(trim(replacement_title)) between 1 and 120),
  replacement_start_time time,
  replacement_end_time time,
  reason text check (reason is null or char_length(reason) <= 300),
  status public.record_status not null default 'active',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete cascade,
  foreign key (timetable_slot_id, school_id) references public.timetable_slots(id, school_id) on delete cascade,
  check ((kind = 'additional' and timetable_slot_id is null) or (kind <> 'additional' and timetable_slot_id is not null)),
  check ((replacement_start_time is null and replacement_end_time is null) or (replacement_start_time is not null and replacement_end_time is not null and replacement_end_time > replacement_start_time)),
  check (kind <> 'additional' or (replacement_title is not null and replacement_start_time is not null)),
  unique (timetable_slot_id, service_date)
);

create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  child_id uuid not null,
  classroom_id uuid not null,
  enrollment_id uuid not null,
  category public.care_category not null,
  status public.care_event_status not null default 'recorded',
  recorded_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  outcome_code text check (outcome_code is null or char_length(outcome_code) <= 40),
  meal_outcome public.meal_outcome,
  quantity numeric(10,2) check (quantity is null or quantity >= 0),
  unit text check (unit is null or unit in ('ml', 'g', 'oz', 'minutes', 'count')),
  note text check (note is null or char_length(note) <= 500),
  recorded_by_membership_id uuid not null,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  timetable_slot_id uuid,
  timetable_service_date date,
  bulk_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, school_id) references public.children(id, school_id) on delete cascade,
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete restrict,
  foreign key (enrollment_id, school_id) references public.child_enrollments(id, school_id) on delete restrict,
  foreign key (recorded_by_membership_id, school_id) references public.school_memberships(id, school_id) on delete restrict,
  foreign key (timetable_slot_id, school_id) references public.timetable_slots(id, school_id) on delete set null,
  check (ended_at is null or started_at is not null),
  check (ended_at is null or ended_at >= started_at),
  check ((timetable_slot_id is null and timetable_service_date is null) or (timetable_slot_id is not null and timetable_service_date is not null)),
  check ((category = 'meal' and meal_outcome is not null) or (category <> 'meal' and meal_outcome is null)),
  unique (id, school_id)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  child_id uuid not null,
  classroom_id uuid not null,
  enrollment_id uuid not null,
  service_date date not null,
  status public.attendance_status not null default 'expected',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  recorded_by_membership_id uuid not null,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, school_id) references public.children(id, school_id) on delete cascade,
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id) on delete restrict,
  foreign key (enrollment_id, school_id) references public.child_enrollments(id, school_id) on delete restrict,
  foreign key (recorded_by_membership_id, school_id) references public.school_memberships(id, school_id) on delete restrict,
  check (checked_out_at is null or checked_in_at is not null),
  check (checked_out_at is null or checked_out_at >= checked_in_at),
  check (status <> 'present' or checked_in_at is not null),
  check (status not in ('absent', 'excused') or (checked_in_at is null and checked_out_at is null)),
  unique (child_id, service_date),
  unique (id, school_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  invited_email extensions.citext not null,
  invited_role public.school_role not null,
  token_hash bytea not null unique check (octet_length(token_hash) >= 32),
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  invited_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((status = 'revoked') = (revoked_at is not null)),
  check ((status = 'accepted') = (accepted_at is not null and accepted_by_user_id is not null)),
  check (status <> 'pending' or (revoked_at is null and accepted_at is null))
);

create unique index invitations_one_pending_per_school_email_role
  on public.invitations (school_id, invited_email, invited_role)
  where status = 'pending';

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  action text not null check (char_length(action) between 3 and 100),
  entity_table text not null check (entity_table ~ '^[a-z_]+$'),
  entity_id uuid,
  old_values jsonb not null default '{}'::jsonb check (jsonb_typeof(old_values) = 'object'),
  new_values jsonb not null default '{}'::jsonb check (jsonb_typeof(new_values) = 'object')
);

create index school_memberships_user_active_idx on public.school_memberships (user_id, school_id, role) where status = 'active';
create index school_memberships_school_role_idx on public.school_memberships (school_id, role, user_id) where status = 'active';
create index branches_school_idx on public.branches (school_id) where status = 'active';
create index classrooms_school_branch_idx on public.classrooms (school_id, branch_id) where status = 'active';
create index classroom_staff_membership_active_idx on public.classroom_staff_assignments (membership_id, classroom_id) where status = 'active';
create index classroom_staff_classroom_active_idx on public.classroom_staff_assignments (classroom_id, membership_id) where status = 'active';
create index children_school_active_idx on public.children (school_id, id) where status = 'active';
create index child_enrollments_classroom_active_idx on public.child_enrollments (classroom_id, child_id) where status = 'active';
create index child_guardians_membership_active_idx on public.child_guardians (guardian_membership_id, child_id) where status = 'active';
create index timetable_slots_classroom_day_idx on public.timetable_slots (classroom_id, day_of_week, start_time) where status = 'active';
create index timetable_exceptions_classroom_date_idx on public.timetable_exceptions (classroom_id, service_date) where status = 'active';
create index care_events_child_recorded_idx on public.care_events (child_id, recorded_at desc);
create index care_events_classroom_recorded_idx on public.care_events (classroom_id, recorded_at desc);
create index care_events_bulk_batch_idx on public.care_events (bulk_batch_id) where bulk_batch_id is not null;
create index attendance_school_date_idx on public.attendance_records (school_id, service_date, classroom_id);
create index invitations_school_status_idx on public.invitations (school_id, status, expires_at);
create index audit_log_school_occurred_idx on public.audit_log (school_id, occurred_at desc);
create index audit_log_actor_occurred_idx on public.audit_log (actor_user_id, occurred_at desc);

insert into public.feature_catalogue (key, label, category) values
  ('attendance', 'Attendance', 'core'),
  ('timetable', 'Timetable', 'core'),
  ('meals', 'Meals', 'care'),
  ('bottle', 'Bottle', 'care'),
  ('water', 'Water', 'care'),
  ('sleep', 'Sleep', 'care'),
  ('toilet', 'Toilet', 'care'),
  ('nappy', 'Nappy', 'care'),
  ('mood', 'Mood', 'care'),
  ('activities', 'Activities', 'care'),
  ('notes', 'Notes', 'care'),
  ('photos', 'Photos', 'media'),
  ('short_video', 'Short video', 'media'),
  ('messaging', 'Messaging', 'communication'),
  ('announcements', 'Announcements', 'communication'),
  ('calendar', 'Calendar', 'core'),
  ('incidents', 'Incidents', 'care');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, new.phone, 'Loop user'), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.validate_school_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown IANA timezone';
  end if;
  return new;
end;
$$;

create or replace function private.validate_classroom_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.school_memberships m
    where m.id = new.membership_id and m.school_id = new.school_id and m.role = 'teacher' and m.status = 'active'
  ) then
    raise exception 'Classroom assignments require an active teacher membership';
  end if;
  return new;
end;
$$;

create or replace function private.validate_child_guardian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.school_memberships m
    where m.id = new.guardian_membership_id and m.school_id = new.school_id and m.role = 'guardian' and m.status = 'active'
  ) then
    raise exception 'Child guardian links require an active guardian membership';
  end if;
  return new;
end;
$$;

create or replace function private.validate_context_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.child_enrollments e
    where e.id = new.enrollment_id and e.school_id = new.school_id
      and e.child_id = new.child_id and e.classroom_id = new.classroom_id
  ) then
    raise exception 'Child, classroom, and enrollment context must match';
  end if;

  if not exists (
    select 1 from public.school_memberships m
    where m.id = new.recorded_by_membership_id and m.school_id = new.school_id
      and m.user_id = new.recorded_by_user_id and m.role in ('school_admin', 'teacher') and m.status = 'active'
  ) then
    raise exception 'Recorder must be an active staff member in the school';
  end if;

  if tg_table_name = 'care_events'
    and nullif(to_jsonb(new) ->> 'timetable_slot_id', '') is not null
    and not exists (
    select 1 from public.timetable_slots t
    where t.id = (to_jsonb(new) ->> 'timetable_slot_id')::uuid
      and t.school_id = new.school_id
      and t.classroom_id = new.classroom_id
  ) then
    raise exception 'Timetable association must match the event classroom';
  end if;

  return new;
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
    when 'schools' then array['plan_id', 'status']
    else array[]::text[]
  end;

  insert into public.audit_log (actor_user_id, school_id, action, entity_table, entity_id, old_values, new_values)
  values (
    (select auth.uid()),
    nullif(row_data ->> 'school_id', '')::uuid,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(nullif(row_data ->> 'id', '')::uuid, nullif(row_data ->> 'user_id', '')::uuid),
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(before_data) where key = any(safe_keys)),
    (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(after_data) where key = any(safe_keys))
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.sync_auth_user_profile() from public, anon, authenticated;
revoke all on function private.validate_school_timezone() from public, anon, authenticated;
revoke all on function private.validate_classroom_staff_assignment() from public, anon, authenticated;
revoke all on function private.validate_child_guardian() from public, anon, authenticated;
revoke all on function private.validate_context_record() from public, anon, authenticated;
revoke all on function private.write_audit_event() from public, anon, authenticated;

create trigger auth_user_profile_created
  after insert on auth.users
  for each row execute function private.sync_auth_user_profile();

create trigger schools_validate_timezone before insert or update of timezone on public.schools
  for each row execute function private.validate_school_timezone();
create trigger classroom_staff_validate before insert or update on public.classroom_staff_assignments
  for each row execute function private.validate_classroom_staff_assignment();
create trigger child_guardians_validate before insert or update on public.child_guardians
  for each row execute function private.validate_child_guardian();
create trigger care_events_validate before insert or update on public.care_events
  for each row execute function private.validate_context_record();
create trigger attendance_records_validate before insert or update on public.attendance_records
  for each row execute function private.validate_context_record();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles', 'platform_administrators', 'plans', 'feature_catalogue', 'plan_features',
    'schools', 'school_memberships', 'branches', 'classrooms', 'classroom_staff_assignments',
    'children', 'child_enrollments', 'child_guardians', 'school_feature_settings', 'timetable_slots',
    'timetable_exceptions', 'care_events', 'attendance_records', 'invitations'
  ]
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end;
$$;

create trigger audit_school_memberships after insert or update or delete on public.school_memberships
  for each row execute function private.write_audit_event();
create trigger audit_classroom_staff after insert or update or delete on public.classroom_staff_assignments
  for each row execute function private.write_audit_event();
create trigger audit_school_features after insert or update or delete on public.school_feature_settings
  for each row execute function private.write_audit_event();
create trigger audit_timetable_slots after insert or update or delete on public.timetable_slots
  for each row execute function private.write_audit_event();
create trigger audit_timetable_exceptions after insert or update or delete on public.timetable_exceptions
  for each row execute function private.write_audit_event();
create trigger audit_invitations after insert or update or delete on public.invitations
  for each row execute function private.write_audit_event();
create trigger audit_platform_administrators after insert or update or delete on public.platform_administrators
  for each row execute function private.write_audit_event();
create trigger audit_schools after insert or update or delete on public.schools
  for each row execute function private.write_audit_event();
