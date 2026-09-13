begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

create function pg_temp.throws_any(command text, description text)
returns text
language sql
as $$
  select extensions.throws_ok(command, null::text, description);
$$;

-- Keep the security suite deterministic even when the optional local demo seed
-- has been loaded. The surrounding transaction restores that seed afterward.
truncate table
  public.notification_preferences,
  public.audit_log,
  public.invitations,
  public.attendance_records,
  public.care_events,
  public.timetable_exceptions,
  public.timetable_slots,
  public.school_feature_settings,
  public.child_guardians,
  public.child_enrollments,
  public.children,
  public.classroom_staff_assignments,
  public.classrooms,
  public.branches,
  public.school_memberships,
  public.schools,
  public.plan_features,
  public.plans,
  public.platform_administrators,
  public.user_profiles
restart identity cascade;
delete from auth.users;

-- Fixed identities make failures readable. They are transaction-scoped and rolled back.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  id,
  'authenticated',
  'authenticated',
  email,
  crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', full_name),
  now(),
  now()
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'admin-a@loop.test', 'Admin A'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'teacher-a@loop.test', 'Teacher A'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'guardian-a@loop.test', 'Guardian A'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'unassigned-a@loop.test', 'Unassigned Teacher'),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'admin-b@loop.test', 'Admin B'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'teacher-b@loop.test', 'Teacher B'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'guardian-b@loop.test', 'Guardian B'),
  ('90000000-0000-0000-0000-000000000001'::uuid, 'platform@loop.test', 'Platform Admin')
) as identities(id, email, full_name);

insert into public.platform_administrators (user_id)
values ('90000000-0000-0000-0000-000000000001');

insert into public.plans (id, key, label, max_active_children, max_staff, storage_allowance_bytes)
values ('30000000-0000-0000-0000-000000000001', 'local_test', 'Local test', 100, 30, 104857600);

insert into public.plan_features (plan_id, feature_key, is_allowed)
select '30000000-0000-0000-0000-000000000001', key, true
from public.feature_catalogue;

insert into public.schools (id, plan_id, name, slug)
values
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'School A', 'school-a'),
  ('b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'School B', 'school-b');

insert into public.school_memberships (id, school_id, user_id, role)
values
  ('a0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'school_admin'),
  ('a0000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'teacher'),
  ('a0000000-0000-0000-0000-000000000043', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'guardian'),
  ('a0000000-0000-0000-0000-000000000044', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'teacher'),
  ('b0000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'school_admin'),
  ('b0000000-0000-0000-0000-000000000042', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'teacher'),
  ('b0000000-0000-0000-0000-000000000043', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'guardian');

insert into public.branches (id, school_id, name)
values
  ('a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'A Main'),
  ('b0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', 'B Main');

insert into public.classrooms (id, school_id, branch_id, name)
values
  ('a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'A Sunbirds'),
  ('a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'A Moonbirds'),
  ('b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000010', 'B Sunbirds');

insert into public.classroom_staff_assignments (id, school_id, classroom_id, membership_id, starts_on)
values
  ('a0000000-0000-0000-0000-000000000045', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000042', current_date - 1),
  ('b0000000-0000-0000-0000-000000000045', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000042', current_date - 1);

insert into public.children (id, school_id, preferred_name)
values
  ('a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001', 'Child A'),
  ('b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000001', 'Child B');

insert into public.child_enrollments (id, school_id, child_id, classroom_id, starts_on, status)
values
  ('a0000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020', current_date - 1, 'active'),
  ('b0000000-0000-0000-0000-000000000050', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000020', current_date - 1, 'active');

insert into public.child_guardians (id, school_id, child_id, guardian_membership_id, relationship_label, is_primary)
values
  ('a0000000-0000-0000-0000-000000000060', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000043', 'Parent', true),
  ('b0000000-0000-0000-0000-000000000060', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000043', 'Parent', true);

insert into public.school_feature_settings (school_id, feature_key, is_enabled, configured_by_user_id)
select school_id, feature_key, true, admin_id
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid),
  ('b0000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid)
) schools(school_id, admin_id)
cross join (values ('attendance'), ('timetable'), ('meals'), ('photos'), ('messaging'), ('announcements'), ('calendar')) features(feature_key);

insert into public.timetable_slots (id, school_id, classroom_id, day_of_week, start_time, end_time, title, care_feature_key, created_by_user_id)
values
  ('a0000000-0000-0000-0000-000000000070', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000020', 1, '11:30', '12:00', 'Lunch', 'meals', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000070', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000020', 1, '11:30', '12:00', 'Lunch', 'meals', '20000000-0000-0000-0000-000000000001');

insert into public.care_events (
  id, school_id, child_id, classroom_id, enrollment_id, category, meal_outcome,
  recorded_by_membership_id, recorded_by_user_id
)
values
  ('a0000000-0000-0000-0000-000000000071', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000050', 'meal', 'ate_most', 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000071', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000050', 'meal', 'ate_some', 'b0000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000002');

insert into public.attendance_records (
  id, school_id, child_id, classroom_id, enrollment_id, service_date, status, checked_in_at,
  recorded_by_membership_id, recorded_by_user_id
)
values
  ('a0000000-0000-0000-0000-000000000080', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000050', current_date, 'present', now(), 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000080', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000050', current_date, 'present', now(), 'b0000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000002');

insert into public.invitations (
  id, school_id, invited_email, invited_role, token_hash, expires_at, invited_by_user_id
)
values (
  'a0000000-0000-0000-0000-000000000090',
  'a0000000-0000-0000-0000-000000000001',
  'new-teacher@loop.test',
  'teacher',
  extensions.digest('one-time-secret-never-stored', 'sha256'),
  now() + interval '24 hours',
  '10000000-0000-0000-0000-000000000001'
);

update public.child_media_consents
set state = 'granted', changed_by_user_id = case school_id
  when 'a0000000-0000-0000-0000-000000000001' then '10000000-0000-0000-0000-000000000001'::uuid
  else '20000000-0000-0000-0000-000000000001'::uuid end,
  changed_at = now();

insert into public.media_upload_reservations (id, school_id, classroom_id, uploader_membership_id, uploader_user_id, status, reserved_bytes, actual_bytes, expires_at, finalized_at)
values
  ('a0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002', 'ready', 300, 300, now() + interval '1 hour', now()),
  ('b0000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000002', 'ready', 300, 300, now() + interval '1 hour', now());

insert into public.media_assets (id, reservation_id, school_id, classroom_id, uploader_membership_id, uploader_user_id, status, ready_at, total_bytes)
values
  ('a0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002', 'ready', now(), 300),
  ('b0000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000002', 'ready', now(), 300);

insert into public.media_variants (id, school_id, asset_id, kind, object_key, content_type, byte_size, width, height, status)
select id, school_id, asset_id, kind::public.media_variant_kind,
  prefix || '/' || school_id || '/' || asset_id || '/' || id || '.jpg', 'image/jpeg', 100, size, size, 'ready'
from (values
  ('a0000000-0000-0000-0000-000000000111'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000102'::uuid, 'original', 'originals', 1000),
  ('a0000000-0000-0000-0000-000000000112'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000102'::uuid, 'display', 'display', 800),
  ('a0000000-0000-0000-0000-000000000113'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000102'::uuid, 'thumbnail', 'thumbs', 360),
  ('b0000000-0000-0000-0000-000000000111'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000102'::uuid, 'original', 'originals', 1000),
  ('b0000000-0000-0000-0000-000000000112'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000102'::uuid, 'display', 'display', 800),
  ('b0000000-0000-0000-0000-000000000113'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000102'::uuid, 'thumbnail', 'thumbs', 360)
) variants(id, school_id, asset_id, kind, prefix, size);

insert into public.media_asset_children (asset_id, child_id, school_id) values
  ('a0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000001');

insert into public.message_threads (id, school_id, child_id, guardian_membership_id) values
  ('a0000000-0000-0000-0000-000000000120', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000043'),
  ('b0000000-0000-0000-0000-000000000120', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000043');
insert into public.messages (id, thread_id, school_id, sender_membership_id, sender_user_id, body) values
  ('a0000000-0000-0000-0000-000000000121', 'a0000000-0000-0000-0000-000000000120', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002', 'School A message'),
  ('b0000000-0000-0000-0000-000000000121', 'b0000000-0000-0000-0000-000000000120', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000002', 'School B message');

insert into public.announcements (id, school_id, target_scope, classroom_id, title, body, status, publish_at, created_by_membership_id, created_by_user_id) values
  ('a0000000-0000-0000-0000-000000000130', 'a0000000-0000-0000-0000-000000000001', 'classroom', 'a0000000-0000-0000-0000-000000000020', 'A notice', 'For School A', 'published', now() - interval '1 minute', 'a0000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000130', 'b0000000-0000-0000-0000-000000000001', 'classroom', 'b0000000-0000-0000-0000-000000000020', 'B notice', 'For School B', 'published', now() - interval '1 minute', 'b0000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000001');
insert into public.calendar_events (id, school_id, target_scope, title, starts_at, ends_at, created_by_membership_id, created_by_user_id) values
  ('a0000000-0000-0000-0000-000000000140', 'a0000000-0000-0000-0000-000000000001', 'school', 'A event', now() + interval '1 day', now() + interval '1 day 1 hour', 'a0000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000140', 'b0000000-0000-0000-0000-000000000001', 'school', 'B event', now() + interval '1 day', now() + interval '1 day 1 hour', 'b0000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000001');

select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  32,
  'exactly 32 public application tables exist'
);
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  32,
  'RLS is enabled on every public application table'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select pg_temp.throws_any('select * from public.children', 'anonymous cannot select private child records');
select pg_temp.throws_any($$insert into public.children (school_id, preferred_name) values ('a0000000-0000-0000-0000-000000000001', 'No access')$$, 'anonymous cannot insert private child records');
reset role;

-- School A admin: full tenant administration, but no School B or platform escalation.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.schools), 1, 'admin A sees only School A');
select extensions.is((select count(*)::integer from public.children), 1, 'admin A sees only School A children');
select extensions.lives_ok($$insert into public.branches (id, school_id, name) values ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'A Temporary')$$, 'admin A can insert in School A');
select pg_temp.throws_any($$insert into public.branches (school_id, name) values ('b0000000-0000-0000-0000-000000000001', 'A in B')$$, 'admin A cannot insert in School B');
select extensions.lives_ok($$update public.children set preferred_name = 'Attempted B edit' where id = 'b0000000-0000-0000-0000-000000000030'$$, 'cross-school update is filtered rather than leaking existence');
select extensions.lives_ok($$delete from public.branches where id = 'b0000000-0000-0000-0000-000000000010'$$, 'cross-school delete is filtered rather than leaking existence');
select pg_temp.throws_any($$insert into public.platform_administrators (user_id) values ('10000000-0000-0000-0000-000000000001')$$, 'school admin cannot become platform admin');
select pg_temp.throws_any($$update public.schools set plan_id = gen_random_uuid() where id = 'a0000000-0000-0000-0000-000000000001'$$, 'school admin cannot change its plan');
select pg_temp.throws_any('select token_hash from public.invitations', 'invitation token hashes are not readable through authenticated API privileges');
select extensions.lives_ok($$delete from public.branches where id = 'a0000000-0000-0000-0000-000000000011'$$, 'admin A can delete an unused School A branch');
reset role;
select extensions.is((select preferred_name from public.children where id = 'b0000000-0000-0000-0000-000000000030'), 'Child B', 'admin A did not update Child B');
select extensions.is((select count(*)::integer from public.branches where id = 'b0000000-0000-0000-0000-000000000010'), 1, 'admin A did not delete School B branch');

-- Teacher A: assigned classroom only, staff writes only, no self-promotion/assignment.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.classrooms), 1, 'teacher A sees only assigned classroom');
select extensions.is((select count(*)::integer from public.children), 1, 'teacher A sees only assigned-class child');
select extensions.is((select count(*)::integer from public.children where school_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'teacher A cannot access School B children');
select extensions.lives_ok($$insert into public.care_events (school_id, child_id, classroom_id, enrollment_id, category, meal_outcome, recorded_by_membership_id, recorded_by_user_id) values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000050', 'meal', 'ate_all', 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002')$$, 'teacher A can create a care event for assigned child');
select pg_temp.throws_any($$insert into public.care_events (school_id, child_id, classroom_id, enrollment_id, category, meal_outcome, recorded_by_membership_id, recorded_by_user_id) values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000050', 'meal', 'ate_all', 'b0000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000002')$$, 'teacher A cannot create care in School B');
select extensions.lives_ok($$update public.care_events set note = 'Updated by assigned teacher' where id = 'a0000000-0000-0000-0000-000000000071'$$, 'teacher A can update assigned care event');
select pg_temp.throws_any($$delete from public.care_events where id = 'a0000000-0000-0000-0000-000000000071'$$, 'teacher cannot hard-delete care history');
select pg_temp.throws_any($$update public.school_memberships set role = 'school_admin' where id = 'a0000000-0000-0000-0000-000000000042'$$, 'teacher has no direct membership update privilege');
select pg_temp.throws_any($$insert into public.classroom_staff_assignments (school_id, classroom_id, membership_id) values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000042')$$, 'teacher cannot self-assign another classroom');
reset role;
select extensions.is((select role::text from public.school_memberships where id = 'a0000000-0000-0000-0000-000000000042'), 'teacher', 'teacher A did not self-promote');

-- An active but unassigned teacher has no classroom or child access.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.classrooms), 0, 'unassigned teacher sees no classrooms');
select extensions.is((select count(*)::integer from public.children), 0, 'unassigned teacher sees no children');
select pg_temp.throws_any($$insert into public.care_events (school_id, child_id, classroom_id, enrollment_id, category, meal_outcome, recorded_by_membership_id, recorded_by_user_id) values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000050', 'meal', 'ate_all', 'a0000000-0000-0000-0000-000000000044', '10000000-0000-0000-0000-000000000004')$$, 'unassigned teacher cannot record care');
reset role;

-- Guardian A: linked child read only; never staff writes.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 1, 'guardian A sees one linked child');
select extensions.is((select count(*)::integer from public.children where school_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'guardian A cannot access School B child');
select extensions.is((select count(*)::integer from public.care_events where child_id = 'a0000000-0000-0000-0000-000000000030'), 2, 'guardian A sees linked child care events');
select extensions.is((select count(*)::integer from public.care_events where school_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'guardian A cannot access School B care events');
select pg_temp.throws_any($$insert into public.care_events (school_id, child_id, classroom_id, enrollment_id, category, meal_outcome, recorded_by_membership_id, recorded_by_user_id) values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000050', 'meal', 'ate_all', 'a0000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000003')$$, 'guardian cannot create a teacher care record');
select extensions.lives_ok($$update public.care_events set note = 'Guardian edit' where id = 'a0000000-0000-0000-0000-000000000071'$$, 'guardian care update is filtered without leaking row existence');
select pg_temp.throws_any($$delete from public.care_events where id = 'a0000000-0000-0000-0000-000000000071'$$, 'guardian cannot delete care records');
reset role;
select extensions.is((select note from public.care_events where id = 'a0000000-0000-0000-0000-000000000071'), 'Updated by assigned teacher', 'guardian did not update care record');

-- Every School B identity is explicitly checked against School A.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children where school_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'admin B cannot access School A children');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.care_events where school_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'teacher B cannot access School A care');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.attendance_records where school_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'guardian B cannot access School A attendance');
reset role;

-- Platform administration covers catalogue/plans/schools, never automatic child privacy access.
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.schools), 2, 'platform admin sees school configuration');
select extensions.lives_ok($$insert into public.plans (key, label, max_active_children, max_staff) values ('platform_test', 'Platform test', 10, 5)$$, 'platform admin can create plan configuration');
select extensions.is((select count(*)::integer from public.children), 0, 'platform admin has no automatic child access');
select extensions.is((select count(*)::integer from public.care_events), 0, 'platform admin has no automatic care-event access');
select pg_temp.throws_any($$insert into public.children (school_id, preferred_name) values ('a0000000-0000-0000-0000-000000000001', 'Platform child')$$, 'platform admin cannot create child data without a school role');
reset role;

-- Audit records are readable to the tenant admin but append-only through application roles.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.ok((select count(*) from public.audit_log where school_id = 'a0000000-0000-0000-0000-000000000001') > 0, 'admin A can read School A audit history');
select pg_temp.throws_any($$update public.audit_log set action = 'tampered' where school_id = 'a0000000-0000-0000-0000-000000000001'$$, 'application users cannot update audit history');
select pg_temp.throws_any($$delete from public.audit_log where school_id = 'a0000000-0000-0000-0000-000000000001'$$, 'application users cannot delete audit history');
reset role;

-- Step 3: school-configured teacher timetable management remains assignment scoped.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.throws_any($$insert into public.timetable_slots (id, school_id, classroom_id, day_of_week, start_time, end_time, title, created_by_user_id) values ('a0000000-0000-0000-0000-000000000072', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000020', 2, '09:00', '09:30', 'Teacher slot', '10000000-0000-0000-0000-000000000002')$$, 'teacher cannot manage timetable while school permission is disabled');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$update public.schools set teachers_can_manage_timetable = true where id = 'a0000000-0000-0000-0000-000000000001'$$, 'school admin can enable teacher timetable management');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.lives_ok($$insert into public.timetable_slots (id, school_id, classroom_id, day_of_week, start_time, end_time, title, created_by_user_id) values ('a0000000-0000-0000-0000-000000000072', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000020', 2, '09:00', '09:30', 'Teacher slot', '10000000-0000-0000-0000-000000000002')$$, 'assigned teacher can create a timetable slot after permission is enabled');
select pg_temp.throws_any($$insert into public.timetable_slots (school_id, classroom_id, day_of_week, start_time, end_time, title, created_by_user_id) values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000021', 2, '09:00', '09:30', 'Unassigned slot', '10000000-0000-0000-0000-000000000002')$$, 'teacher cannot manage an unassigned classroom timetable');
select extensions.lives_ok($$delete from public.timetable_slots where id = 'a0000000-0000-0000-0000-000000000072'$$, 'assigned teacher can remove a permitted timetable slot');
reset role;

-- Step 3: platform structure setup does not expand child-data access.
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$insert into public.branches (id, school_id, name) values ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Platform starter branch')$$, 'platform admin can create starter branch structure');
select extensions.lives_ok($$insert into public.classrooms (school_id, branch_id, name) values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'Platform starter classroom')$$, 'platform admin can create starter classroom structure');
select extensions.lives_ok($$insert into public.invitations (school_id, invited_email, invited_role, token_hash, expires_at, invited_by_user_id) values ('b0000000-0000-0000-0000-000000000001', 'first-admin@loop.test', 'school_admin', extensions.digest('platform-admin-invite-token', 'sha256'), now() + interval '1 day', '90000000-0000-0000-0000-000000000001')$$, 'platform admin can create a first school-admin invitation');
select extensions.is((select count(*)::integer from public.children), 0, 'platform starter structure policy still exposes no children');
reset role;

-- Step 3: plan limits are database-enforced, not merely advisory UI checks.
update public.plans set max_active_children = 1, max_staff = 3 where id = '30000000-0000-0000-0000-000000000001';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'limit-teacher@loop.test', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Limit Teacher"}', now(), now());
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select pg_temp.throws_any($$insert into public.children (school_id, preferred_name) values ('a0000000-0000-0000-0000-000000000001', 'Over plan child')$$, 'active child limit is enforced by the database');
select pg_temp.throws_any($$insert into public.school_memberships (school_id, user_id, role) values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'teacher')$$, 'active staff limit is enforced by the database');
reset role;

-- Step 3: redemption needs both the one-time token and matching Auth email.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'new-teacher@loop.test', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Invited Teacher"}', now(), now());
update public.plans set max_staff = 4 where id = '30000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.throws_any($$select public.redeem_invitation('one-time-secret-never-stored')$$, 'a valid token cannot be redeemed by a different authenticated email');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
set local role authenticated;
select extensions.lives_ok($$select public.redeem_invitation('one-time-secret-never-stored')$$, 'matching authenticated email can redeem the pending invitation');
select extensions.is((select role::text from public.school_memberships where user_id = '10000000-0000-0000-0000-000000000006'), 'teacher', 'redemption creates only the invited role');
select pg_temp.throws_any($$select public.redeem_invitation('one-time-secret-never-stored')$$, 'an accepted invitation cannot be replayed');
reset role;

-- Step 3B: a whole-class care save is one atomic database operation. A single
-- absent child rejects the complete batch; valid present children share one batch id.
update public.plans
set max_active_children = 100, max_staff = 30
where id = '30000000-0000-0000-0000-000000000001';
insert into public.children (id, school_id, preferred_name)
values ('a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001', 'Child A Two');
insert into public.child_enrollments (id, school_id, child_id, classroom_id, starts_on, status)
values ('a0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000020', current_date - 1, 'active');
insert into public.attendance_records (
  id, school_id, child_id, classroom_id, enrollment_id, service_date, status,
  recorded_by_membership_id, recorded_by_user_id
)
values (
  'a0000000-0000-0000-0000-000000000081', 'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000020',
  'a0000000-0000-0000-0000-000000000051', current_date, 'absent',
  'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.record_care_batch(
    'a0000000-0000-0000-0000-000000000020', current_date, 'meal',
    '[{"child_id":"a0000000-0000-0000-0000-000000000030","meal_outcome":"ate_little"},{"child_id":"a0000000-0000-0000-0000-000000000031","meal_outcome":"ate_little"}]'::jsonb
  )$$,
  'one absent child rejects the complete care batch'
);
reset role;

-- Step 5 push capabilities stay private, preferences are self-only, and
-- recipient eligibility is recalculated from current relationships.
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  32,
  'exactly 32 public application tables exist after notification preferences'
);
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  32,
  'RLS remains enabled on every public application table'
);
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.care_events'::regclass and p.proname = 'enqueue_push_event'),
  0,
  'routine care events have no push trigger'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.throws_any('select * from public.notification_preferences', 'anonymous users cannot read notification preferences');
select pg_temp.throws_any($$select public.register_push_subscription('https://push.example/anon-device', repeat('a', 32), repeat('b', 16))$$, 'anonymous users cannot register push capabilities');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.lives_ok(
  $$insert into public.notification_preferences (user_id) values ('10000000-0000-0000-0000-000000000003')$$,
  'guardian can create only their own notification preferences'
);
select pg_temp.throws_any(
  $$insert into public.notification_preferences (user_id) values ('20000000-0000-0000-0000-000000000003')$$,
  'guardian cannot create preferences for another user or school'
);
select extensions.is((select count(*)::integer from public.notification_preferences), 1, 'guardian cannot enumerate another user preferences');
select extensions.lives_ok(
  $$select public.register_push_subscription('https://push.example/guardian-a', repeat('g', 32), repeat('h', 16))$$,
  'guardian can register the current device without supplying a user id'
);
select extensions.lives_ok(
  $$select public.register_push_subscription('https://push.example/guardian-a-spare', repeat('i', 32), repeat('j', 16))$$,
  'guardian can register multiple devices'
);
select extensions.ok(
  public.deactivate_push_subscription('https://push.example/guardian-a-spare'),
  'guardian can deactivate their own current device'
);
select pg_temp.throws_any('select * from private.push_subscriptions', 'guardian cannot enumerate private push endpoints or keys');
select pg_temp.throws_any('select * from private.notification_outbox', 'guardian cannot read the private notification outbox');
select pg_temp.throws_any('select public.claim_push_deliveries(10)', 'guardian cannot claim arbitrary recipients or delivery capabilities');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.register_push_subscription('https://push.example/guardian-a', repeat('t', 32), repeat('u', 16))$$,
  'another authenticated identity cannot take over an active device endpoint'
);
select extensions.lives_ok(
  $$select public.register_push_subscription('https://push.example/teacher-a', repeat('t', 32), repeat('u', 16))$$,
  'teacher can register their own device'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.register_push_subscription('https://push.example/platform', repeat('p', 32), repeat('q', 16))$$,
  'platform administrator cannot register for child or school pushes'
);
select pg_temp.throws_any(
  $$insert into public.notification_preferences (user_id) values ('90000000-0000-0000-0000-000000000001')$$,
  'platform administrator cannot create school notification preferences'
);
reset role;

select extensions.is(
  (select count(*)::integer from private.notification_outbox where
    (event_type = 'attendance_check_in' and source_id in ('a0000000-0000-0000-0000-000000000080', 'b0000000-0000-0000-0000-000000000080'))
    or (event_type = 'message' and source_id in ('a0000000-0000-0000-0000-000000000121', 'b0000000-0000-0000-0000-000000000121'))),
  4,
  'authoritative attendance and message fixture writes enqueue focused events for both schools'
);
select extensions.is(
  (select count(*)::integer from private.notification_outbox where event_type = 'photo'),
  2,
  'ready photo writes enqueue an optional photo event for both schools'
);
select extensions.is(
  (select count(*)::integer from private.notification_outbox where event_type = 'important_announcement'),
  0,
  'normal announcements do not enqueue important-announcement pushes'
);
select extensions.is(
  private.user_can_receive_push_event(
    '10000000-0000-0000-0000-000000000003',
    (select id from private.notification_outbox where event_type = 'photo' and school_id = 'a0000000-0000-0000-0000-000000000001')
  ),
  false,
  'optional photo delivery is disabled by default'
);
update public.notification_preferences set photos_enabled = true where user_id = '10000000-0000-0000-0000-000000000003';
select extensions.ok(
  private.user_can_receive_push_event(
    '10000000-0000-0000-0000-000000000003',
    (select id from private.notification_outbox where event_type = 'photo' and school_id = 'a0000000-0000-0000-0000-000000000001')
  ),
  'guardian who opted in and remains linked can receive a photo push'
);
update public.child_guardians set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000060';
select extensions.is(
  private.user_can_receive_push_event(
    '10000000-0000-0000-0000-000000000003',
    (select id from private.notification_outbox where event_type = 'attendance_check_in' and school_id = 'a0000000-0000-0000-0000-000000000001')
  ),
  false,
  'revoked guardian link prevents attendance delivery before claim'
);
update public.child_guardians set status = 'active' where id = 'a0000000-0000-0000-0000-000000000060';

insert into public.messages (id, thread_id, school_id, sender_membership_id, sender_user_id, body)
values ('a0000000-0000-0000-0000-000000000122', 'a0000000-0000-0000-0000-000000000120', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000003', 'Guardian reply');
select extensions.ok(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000122')),
  'currently assigned teacher is a database-derived message recipient'
);
update public.classroom_staff_assignments set status = 'inactive', ends_on = current_date where id = 'a0000000-0000-0000-0000-000000000045';
select extensions.is(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000122')),
  false,
  'revoked teacher assignment prevents message delivery before claim'
);
update public.classroom_staff_assignments set status = 'active', ends_on = null where id = 'a0000000-0000-0000-0000-000000000045';
delete from public.messages where id = 'a0000000-0000-0000-0000-000000000122';

set local role service_role;
select extensions.ok(
  (select count(*) > 0 from public.claim_push_deliveries(25)),
  'service delivery worker can claim eligible private capabilities without client-selected recipients'
);
reset role;
create temporary table pg_temp.claimed_push_delivery_ids as
select id, row_number() over (order by id) as position from private.push_deliveries where status = 'sending';
select extensions.lives_ok(
  format('select public.complete_push_delivery(%L::uuid, %L, 201)', (select id from pg_temp.claimed_push_delivery_ids where position = 1), 'success'),
  'successful push delivery records only its HTTP status and completion'
);
select extensions.is(
  (select status::text from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 1)),
  'succeeded',
  'successful push delivery reaches succeeded state'
);
select extensions.lives_ok(
  format('select public.complete_push_delivery(%L::uuid, %L, 503)', (select id from pg_temp.claimed_push_delivery_ids where position = 3), 'temporary_failure'),
  'temporary push failure is accepted for bounded retry'
);
select extensions.is(
  (select status::text from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3)),
  'temporary_failure',
  'temporary push failure remains retryable without storing a response body'
);
select extensions.ok(
  (select available_at > now() + interval '1 minute'
    from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3)),
  'temporary push failure receives exponential backoff before another claim'
);

update private.push_deliveries
set available_at = now(), updated_at = now()
where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3);
set local role service_role;
select extensions.is(
  (select count(*)::integer from public.claim_push_deliveries(25)),
  1,
  'a due temporary failure is reclaimed once'
);
select extensions.is(
  (select count(*)::integer from public.claim_push_deliveries(25)),
  0,
  'an active delivery lease cannot be claimed by a concurrent worker'
);
reset role;
select extensions.is(
  (select attempts::integer from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3)),
  2,
  'each actual delivery claim increments the bounded attempt counter once'
);

update private.push_deliveries
set updated_at = now() - interval '2 minutes 1 second'
where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3);
set local role service_role;
select extensions.is(
  (select count(*)::integer from public.claim_push_deliveries(25)),
  1,
  'an abandoned delivery lease is atomically recovered and reclaimed'
);
reset role;
select extensions.is(
  (select attempts::integer from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3)),
  3,
  'stale lease recovery preserves attempt history before the next claim'
);
select extensions.is(
  (select count(*)::integer
    from private.push_deliveries delivery
    where (delivery.outbox_id, delivery.subscription_id) = (
      select expected.outbox_id, expected.subscription_id
      from private.push_deliveries expected
      where expected.id = (select id from pg_temp.claimed_push_delivery_ids where position = 3)
    )),
  1,
  'stale lease recovery reuses the delivery row instead of duplicating it'
);

select extensions.lives_ok(
  format('select public.complete_push_delivery(%L::uuid, %L, 503)', (select id from pg_temp.claimed_push_delivery_ids where position = 3), 'temporary_failure'),
  'a recovered delivery can record another temporary provider failure'
);
set local role service_role;
select extensions.is(
  (select count(*)::integer from public.claim_push_deliveries(25)),
  0,
  'the scheduled worker cannot claim a retry before its new due time'
);
reset role;
select extensions.ok(
  (select available_at > now() + interval '7 minutes'
    from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3)),
  'recovered attempt receives the correct exponential retry backoff'
);

update private.push_deliveries
set status = 'sending', attempts = 5, updated_at = now() - interval '2 minutes 1 second'
where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3);
set local role service_role;
select extensions.is(
  (select count(*)::integer from public.claim_push_deliveries(25)),
  0,
  'a stale delivery at the retry limit is not sent again'
);
reset role;
select extensions.is(
  (select status::text from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 3)),
  'permanent_failure',
  'a stale delivery at the retry limit reaches a terminal state'
);

select extensions.lives_ok(
  format('select public.complete_push_delivery(%L::uuid, %L, 410)', (select id from pg_temp.claimed_push_delivery_ids where position = 2), 'permanent_failure'),
  'HTTP 410 is handled as an expired permanent failure'
);
select extensions.is(
  (select status::text from private.push_subscriptions where id = (select subscription_id from private.push_deliveries where id = (select id from pg_temp.claimed_push_delivery_ids where position = 2))),
  'inactive',
  'HTTP 404 or 410 handling deactivates the expired endpoint'
);

select extensions.is(
  (select count(*)::integer from cron.job
    where jobname = 'loop-push-retry-worker'
      and schedule = '* * * * *'
      and command = 'select private.invoke_push_retry_worker();'
      and active),
  1,
  'one active every-minute push retry Cron job is installed'
);
select extensions.lives_ok(
  'select private.invoke_push_retry_worker()',
  'the local Cron helper exits safely when its Vault configuration is absent'
);
select extensions.is(
  (select count(*)::integer from net.http_request_queue),
  0,
  'missing local Vault configuration does not enqueue an HTTP request'
);
select extensions.ok(
  not has_function_privilege('anon', 'private.invoke_push_retry_worker()', 'execute')
    and not has_function_privilege('authenticated', 'private.invoke_push_retry_worker()', 'execute')
    and not has_function_privilege('service_role', 'private.invoke_push_retry_worker()', 'execute'),
  'ordinary and application roles cannot invoke the private Cron helper'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.care_events where meal_outcome = 'ate_little'),
  0,
  'a rejected care batch leaves no partial rows'
);

update public.attendance_records
set status = 'present', checked_in_at = now()
where id = 'a0000000-0000-0000-0000-000000000081';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is(
  public.record_care_batch(
    'a0000000-0000-0000-0000-000000000020', current_date, 'meal',
    '[{"child_id":"a0000000-0000-0000-0000-000000000030","meal_outcome":"ate_little"},{"child_id":"a0000000-0000-0000-0000-000000000031","meal_outcome":"ate_little"}]'::jsonb
  ),
  2,
  'assigned teacher saves two present-child care records in one call'
);
reset role;
select extensions.is(
  (select count(distinct bulk_batch_id)::integer from public.care_events where meal_outcome = 'ate_little'),
  1,
  'one whole-class care action shares one batch id'
);

-- Module entitlements and classroom assignment are enforced inside the RPC.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.record_care_batch('a0000000-0000-0000-0000-000000000020', current_date, 'water', '[{"child_id":"a0000000-0000-0000-0000-000000000030","outcome_code":"some"}]'::jsonb)$$,
  'a disabled care module cannot be written'
);
select pg_temp.throws_any(
  $$select public.record_care_batch('b0000000-0000-0000-0000-000000000020', current_date, 'meal', '[{"child_id":"b0000000-0000-0000-0000-000000000030","meal_outcome":"ate_all"}]'::jsonb)$$,
  'teacher A cannot call the batch RPC for School B'
);
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.record_care_batch('a0000000-0000-0000-0000-000000000020', current_date, 'meal', '[{"child_id":"a0000000-0000-0000-0000-000000000030","meal_outcome":"ate_all"}]'::jsonb)$$,
  'unassigned teacher cannot call the batch RPC'
);
reset role;

-- Sleep has an explicit start/end lifecycle and only one active row per child.
insert into public.school_feature_settings (school_id, feature_key, is_enabled, configured_by_user_id)
values ('a0000000-0000-0000-0000-000000000001', 'sleep', true, '10000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is(
  public.record_care_batch(
    'a0000000-0000-0000-0000-000000000020', current_date, 'sleep',
    '[{"child_id":"a0000000-0000-0000-0000-000000000030","outcome_code":"started"}]'::jsonb
  ),
  1,
  'assigned teacher starts sleep for a present child'
);
select pg_temp.throws_any(
  $$select public.record_care_batch('a0000000-0000-0000-0000-000000000020', current_date, 'sleep', '[{"child_id":"a0000000-0000-0000-0000-000000000030","outcome_code":"started"}]'::jsonb)$$,
  'a child cannot have two active sleep records'
);
select extensions.is(
  public.end_sleep_batch(
    'a0000000-0000-0000-0000-000000000020',
    array[(select id from public.care_events where child_id = 'a0000000-0000-0000-0000-000000000030' and category = 'sleep' and ended_at is null)]
  ),
  1,
  'assigned teacher ends an active sleep'
);
reset role;
select extensions.ok(
  (select ended_at >= started_at from public.care_events where child_id = 'a0000000-0000-0000-0000-000000000030' and category = 'sleep'),
  'ended sleep keeps a valid non-negative duration'
);

-- School administrators may move enrollment history atomically, but cannot
-- edit platform-owned plan/status fields. Platform administrators can edit limits.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.move_child_enrollment('a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000021', current_date)$$,
  'school admin can move a child to another classroom in the same school'
);
select pg_temp.throws_any(
  $$select public.move_child_enrollment('b0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000020', current_date)$$,
  'school admin cannot move a child in another school'
);
select pg_temp.throws_any(
  $$update public.schools set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  'school admin cannot change a platform-owned school status'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.child_enrollments where child_id = 'a0000000-0000-0000-0000-000000000031' and status = 'active' and classroom_id = 'a0000000-0000-0000-0000-000000000021'),
  1,
  'child move leaves exactly one active enrollment in the destination classroom'
);
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$update public.plans set max_active_children = 101 where id = '30000000-0000-0000-0000-000000000001'$$,
  'platform admin can edit plan limits'
);
select extensions.lives_ok(
  $$update public.schools set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  'platform admin can change a school status'
);
reset role;

-- Step 4: private photo metadata and communication remain relationship scoped.
update public.schools set status = 'active' where id = 'a0000000-0000-0000-0000-000000000001';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select pg_temp.throws_any('select * from public.media_assets', 'anonymous cannot inspect private media metadata');
select pg_temp.throws_any('select * from public.messages', 'anonymous cannot inspect private messages');
select pg_temp.throws_any('select * from public.announcements', 'anonymous cannot inspect school announcements');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.media_assets), 1, 'assigned teacher sees only assigned School A media');
select extensions.is((select count(*)::integer from public.messages), 1, 'assigned teacher sees only the assigned child thread');
select extensions.is((select count(*)::integer from public.announcements), 1, 'assigned teacher sees only the relevant announcement');
select extensions.is((select count(*)::integer from public.calendar_events), 1, 'assigned teacher sees only the relevant calendar');
select extensions.lives_ok(
  $$insert into public.messages (thread_id, school_id, sender_membership_id, sender_user_id, body)
    values ('a0000000-0000-0000-0000-000000000120', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002', 'Teacher reply')$$,
  'assigned teacher can reply in the guardian-specific thread'
);
select pg_temp.throws_any(
  $$insert into public.messages (thread_id, school_id, sender_membership_id, sender_user_id, body)
    values ('b0000000-0000-0000-0000-000000000120', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002', 'Cross tenant')$$,
  'teacher cannot send into another school thread'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.media_assets), 0, 'unassigned teacher sees no child media');
select extensions.is((select count(*)::integer from public.message_threads), 0, 'unassigned teacher sees no guardian threads');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.media_assets), 1, 'guardian sees media tagged to the linked child only');
select extensions.is((select count(*)::integer from public.message_threads), 1, 'guardian sees only their own linked-child thread');
select extensions.is((select count(*)::integer from public.announcements), 1, 'guardian sees the relevant classroom announcement only');
select extensions.is((select count(*)::integer from public.calendar_events), 1, 'guardian sees the relevant school calendar only');
select extensions.lives_ok(
  $$insert into public.messages (thread_id, school_id, sender_membership_id, sender_user_id, body)
    values ('a0000000-0000-0000-0000-000000000120', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000003', 'Guardian reply')$$,
  'guardian can reply only in their guardian-specific thread'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.media_assets), 0, 'platform admin has no child-media bypass');
select extensions.is((select count(*)::integer from public.messages), 0, 'platform admin has no message bypass');
reset role;

select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'message_thread_broadcast_select'),
  1,
  'private message Broadcast has an explicit realtime authorization policy'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select pg_temp.throws_any(
  $$update public.announcements set created_by_user_id = '10000000-0000-0000-0000-000000000002' where id = 'a0000000-0000-0000-0000-000000000130'$$,
  'announcement creator attribution is immutable even to a school admin'
);
select pg_temp.throws_any(
  $$update public.calendar_events set created_by_membership_id = 'a0000000-0000-0000-0000-000000000042' where id = 'a0000000-0000-0000-0000-000000000140'$$,
  'calendar creator attribution is immutable even to a school admin'
);
reset role;

-- Consent is conservative: not-recorded and denied both prevent reservations.
update public.child_media_consents set state = 'not_recorded', changed_by_user_id = null, changed_at = now()
where child_id = 'a0000000-0000-0000-0000-000000000030';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.reserve_photo_upload(
    'a0000000-0000-0000-0000-000000000020', array['a0000000-0000-0000-0000-000000000030'::uuid],
    '[{"kind":"original","content_type":"image/jpeg","byte_size":2000,"width":1200,"height":800},{"kind":"display","content_type":"image/jpeg","byte_size":1500,"width":1000,"height":667},{"kind":"thumbnail","content_type":"image/jpeg","byte_size":500,"width":360,"height":240}]'::jsonb,
    null, now())$$,
  'not-recorded consent blocks a teacher photo reservation'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$update public.child_media_consents set state = 'granted', changed_by_user_id = '10000000-0000-0000-0000-000000000001', changed_at = now()
    where child_id = 'a0000000-0000-0000-0000-000000000030'$$,
  'school admin can record granted media consent'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.reserve_photo_upload(
    'a0000000-0000-0000-0000-000000000020', array['a0000000-0000-0000-0000-000000000030'::uuid],
    '[{"kind":"original","content_type":"image/jpeg","byte_size":2000,"width":1200,"height":800},{"kind":"display","content_type":"image/jpeg","byte_size":1500,"width":1000,"height":667},{"kind":"thumbnail","content_type":"image/jpeg","byte_size":500,"width":360,"height":240}]'::jsonb,
    'Class activity', now())$$,
  'assigned teacher can reserve a bounded photo after consent is granted'
);
select extensions.is(
  (select reserved_bytes::integer from public.media_upload_reservations where uploader_user_id = '10000000-0000-0000-0000-000000000002' and status = 'reserved'),
  4000,
  'photo reservation records exact quota bytes transactionally'
);
select pg_temp.throws_any(
  $$select public.reserve_photo_upload(
    'a0000000-0000-0000-0000-000000000020', array['b0000000-0000-0000-0000-000000000030'::uuid],
    '[{"kind":"original","content_type":"image/jpeg","byte_size":2000,"width":1200,"height":800},{"kind":"display","content_type":"image/jpeg","byte_size":1500,"width":1000,"height":667},{"kind":"thumbnail","content_type":"image/jpeg","byte_size":500,"width":360,"height":240}]'::jsonb,
    null, now())$$,
  'photo reservation rejects a cross-tenant child tag'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
update public.child_media_consents set state = 'denied', changed_by_user_id = '10000000-0000-0000-0000-000000000001', changed_at = now()
where child_id = 'a0000000-0000-0000-0000-000000000030';
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.reserve_photo_upload(
    'a0000000-0000-0000-0000-000000000020', array['a0000000-0000-0000-0000-000000000030'::uuid],
    '[{"kind":"original","content_type":"image/jpeg","byte_size":2000,"width":1200,"height":800},{"kind":"display","content_type":"image/jpeg","byte_size":1500,"width":1000,"height":667},{"kind":"thumbnail","content_type":"image/jpeg","byte_size":500,"width":360,"height":240}]'::jsonb,
    null, now())$$,
  'denied consent blocks a teacher photo reservation'
);
reset role;

-- Access-lifecycle hardening: the database, not UI visibility, enforces current
-- school/structure/relationship state and the narrow membership mutation path.
select extensions.is(
  has_table_privilege('authenticated', 'public.school_memberships', 'UPDATE'),
  false,
  'authenticated has no direct membership UPDATE table privilege'
);
select extensions.is(
  has_table_privilege('authenticated', 'public.school_memberships', 'INSERT'),
  false,
  'authenticated has no direct membership INSERT table privilege'
);
select extensions.is(
  has_table_privilege('authenticated', 'public.school_memberships', 'DELETE'),
  false,
  'authenticated has no direct membership DELETE table privilege'
);
select extensions.is(
  pg_catalog.pg_get_function_identity_arguments('public.set_school_membership_status(uuid,public.record_status)'::regprocedure),
  'target_membership_id uuid, target_status record_status',
  'membership status RPC exposes only membership id and status'
);
select extensions.ok(
  pg_catalog.pg_get_functiondef('private.protect_last_active_school_admin()'::regprocedure) like '%pg_advisory_xact_lock%',
  'last-admin invariant uses a transaction-scoped advisory lock'
);
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_trigger
    where tgrelid = 'public.school_memberships'::regclass
      and tgname in ('school_memberships_protect_last_admin_update', 'school_memberships_protect_last_admin_delete')
      and not tgisinternal),
  2,
  'last-admin invariant covers membership updates and deletes'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000007',
  'authenticated', 'authenticated', 'admin-a-two@loop.test',
  crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Admin A Two"}'::jsonb, now(), now()
);
insert into public.school_memberships (id, school_id, user_id, role)
values ('a0000000-0000-0000-0000-000000000047', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'school_admin');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.throws_any(
  $$update public.school_memberships set user_id = '10000000-0000-0000-0000-000000000004', role = 'school_admin' where id = 'a0000000-0000-0000-0000-000000000042'$$,
  'school admin cannot directly mutate protected membership identity or role columns'
);
select pg_temp.throws_any(
  $$update public.school_memberships set school_id = 'b0000000-0000-0000-0000-000000000001' where id = 'a0000000-0000-0000-0000-000000000042'$$,
  'school admin cannot directly move a membership between tenants'
);
select extensions.lives_ok(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000042', 'inactive')$$,
  'school admin can deactivate a same-school teacher through the narrow status RPC'
);
select pg_temp.throws_any(
  $$select public.set_school_membership_status('b0000000-0000-0000-0000-000000000042', 'inactive')$$,
  'membership status RPC rejects another school'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive teacher membership immediately denies child access');
select extensions.is((select count(*)::integer from public.classrooms), 0, 'inactive teacher membership immediately denies classroom access');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000042', 'active')$$,
  'school admin can reactivate the same-school teacher'
);
select extensions.lives_ok(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000047', 'inactive')$$,
  'one of two active School Admins may be deactivated'
);
select pg_temp.throws_any(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000041', 'inactive')$$,
  'the remaining active School Admin cannot deactivate themselves'
);
select extensions.lives_ok(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000047', 'active')$$,
  'the remaining School Admin may reactivate another administrator'
);
select extensions.lives_ok(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000041', 'inactive')$$,
  'one administrator may be deactivated while another remains active'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive School Admin membership denies ordinary child workspace access');
select extensions.is((select count(*)::integer from public.branches), 0, 'inactive School Admin membership denies ordinary structure workspace access');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
set local role authenticated;
select pg_temp.throws_any(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000047', 'inactive')$$,
  'the second and now-final active School Admin cannot be deactivated'
);
select extensions.lives_ok(
  $$select public.set_school_membership_status('a0000000-0000-0000-0000-000000000041', 'active')$$,
  'active remaining administrator can restore the first administrator'
);
reset role;

-- Platform management can suspend and reactivate a school; every school user
-- fails closed during suspension while the other tenant remains unaffected.
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$update public.schools set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  'platform administrator can suspend School A'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.schools), 0, 'inactive school denies School Admin ordinary school access');
select extensions.is((select count(*)::integer from public.children), 0, 'inactive school denies School Admin operational child access');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.classrooms), 0, 'inactive school denies Teacher classroom access');
select extensions.is((select count(*)::integer from public.messages), 0, 'inactive school denies Teacher message access');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive school denies Guardian child access');
select extensions.is((select count(*)::integer from public.media_assets), 0, 'inactive school denies Guardian media access');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 1, 'School B Teacher remains unaffected by School A suspension');
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.schools where id = 'a0000000-0000-0000-0000-000000000001'), 1, 'platform administrator retains the school management row');
select extensions.lives_ok(
  $$update public.schools set status = 'active' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  'platform administrator can reactivate School A'
);
reset role;

-- Branch, classroom, child, assignment, enrollment, and guardian-link state are
-- immediate operational boundaries for Teachers and Guardians. Admin history
-- visibility and the unrelated tenant are preserved.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$update public.branches set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000010'$$, 'School Admin can archive branch operation');
select extensions.is((select count(*)::integer from public.classrooms where id = 'a0000000-0000-0000-0000-000000000020'), 1, 'School Admin retains classroom history under inactive branch');
select extensions.is((select count(*)::integer from public.children where id = 'a0000000-0000-0000-0000-000000000030'), 1, 'School Admin retains child history under inactive branch');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.classrooms where id = 'a0000000-0000-0000-0000-000000000020'), 0, 'inactive branch denies Teacher classroom access');
select extensions.is((select count(*)::integer from public.children where id = 'a0000000-0000-0000-0000-000000000030'), 0, 'inactive branch denies Teacher child access');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive branch denies Guardian child access');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 1, 'School B Guardian remains unaffected by School A branch state');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
update public.branches set status = 'active' where id = 'a0000000-0000-0000-0000-000000000010';
update public.classrooms set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000020';
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.classrooms), 0, 'inactive classroom denies Teacher access despite active assignment');
select extensions.is((select count(*)::integer from public.children where id = 'a0000000-0000-0000-0000-000000000030'), 0, 'inactive classroom denies Teacher child access');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive classroom denies Guardian despite active enrollment and link');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.classrooms where id = 'a0000000-0000-0000-0000-000000000020'), 1, 'School Admin retains inactive classroom administration visibility');
update public.classrooms set status = 'active' where id = 'a0000000-0000-0000-0000-000000000020';
update public.children set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000030';
select extensions.is((select count(*)::integer from public.children where id = 'a0000000-0000-0000-0000-000000000030'), 1, 'School Admin retains inactive child history visibility');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive child denies Teacher operational access');
select extensions.is((select count(*)::integer from public.messages), 0, 'inactive child denies Teacher messaging access');
select extensions.is((select count(*)::integer from public.media_upload_reservations), 0, 'inactive tagged child denies Teacher upload finalization lookup');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive child denies Guardian operational access');
select extensions.is((select count(*)::integer from public.media_variants), 0, 'inactive child denies Guardian signed-media metadata lookup');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
update public.children set status = 'active' where id = 'a0000000-0000-0000-0000-000000000030';
update public.classroom_staff_assignments set status = 'inactive', ends_on = current_date where id = 'a0000000-0000-0000-0000-000000000045';
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'inactive assignment immediately denies Teacher child access');
select extensions.is((select count(*)::integer from public.media_upload_reservations), 0, 'inactive assignment denies access to an owned upload reservation');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
update public.classroom_staff_assignments set status = 'active', ends_on = null where id = 'a0000000-0000-0000-0000-000000000045';
update public.child_guardians set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000060';
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'revoked guardian link immediately denies child timeline access');
select extensions.is((select count(*)::integer from public.messages), 0, 'revoked guardian link immediately denies message fetch');
select extensions.is((select count(*)::integer from public.media_variants), 0, 'revoked guardian link denies a new signed-media metadata lookup');
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
update public.child_guardians set status = 'active' where id = 'a0000000-0000-0000-0000-000000000060';
reset role;

-- Current-date enrollment is enforced independently of a lingering active enum.
update public.child_enrollments set ends_on = current_date - 1 where id = 'a0000000-0000-0000-0000-000000000050';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.children), 0, 'ended active-status enrollment denies Guardian operational access');
reset role;
update public.child_enrollments set ends_on = null where id = 'a0000000-0000-0000-0000-000000000050';

-- Push derivation uses the same current lifecycle graph.
insert into public.messages (id, thread_id, school_id, sender_membership_id, sender_user_id, body)
values ('a0000000-0000-0000-0000-000000000123', 'a0000000-0000-0000-0000-000000000120', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000003', 'Lifecycle test message');
select extensions.ok(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000123')),
  'active assigned Teacher is initially eligible for message push'
);
update public.branches set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000010';
select extensions.is(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000123')),
  false,
  'inactive branch removes Teacher from push recipients'
);
update public.branches set status = 'active' where id = 'a0000000-0000-0000-0000-000000000010';
update public.classrooms set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000020';
select extensions.is(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000123')),
  false,
  'inactive classroom removes Teacher from push recipients'
);
update public.classrooms set status = 'active' where id = 'a0000000-0000-0000-0000-000000000020';
update public.children set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000030';
select extensions.is(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000123')),
  false,
  'inactive child removes Teacher from push recipients'
);
update public.children set status = 'active' where id = 'a0000000-0000-0000-0000-000000000030';
update public.school_memberships set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000042';
select extensions.is(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000123')),
  false,
  'inactive Teacher membership removes recipient before push claim'
);
update public.school_memberships set status = 'active' where id = 'a0000000-0000-0000-0000-000000000042';
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
update public.schools set status = 'inactive' where id = 'a0000000-0000-0000-0000-000000000001';
select extensions.is(
  private.user_can_receive_push_event('10000000-0000-0000-0000-000000000002', (select id from private.notification_outbox where source_id = 'a0000000-0000-0000-0000-000000000123')),
  false,
  'inactive school removes every school recipient before push claim'
);
update public.schools set status = 'active' where id = 'a0000000-0000-0000-0000-000000000001';

select extensions.ok(
  pg_catalog.pg_get_functiondef('private.broadcast_message_change()'::regprocedure) like '%realtime.send(%message_changed%',
  'message trigger sends a constant invalidation event'
);
select extensions.ok(
  pg_catalog.pg_get_functiondef('private.broadcast_message_change()'::regprocedure) not like '%realtime.broadcast_changes%',
  'message trigger no longer Broadcasts complete row records'
);
select extensions.ok(
  pg_catalog.pg_get_functiondef('private.broadcast_message_change()'::regprocedure) not like '%new.body%',
  'message Broadcast function never references message bodies'
);
select extensions.ok(
  (select count(*) from public.audit_log where school_id = 'a0000000-0000-0000-0000-000000000001'
    and entity_table in ('school_memberships', 'branches', 'classrooms', 'children', 'child_enrollments', 'child_guardians')) >= 6,
  'security-relevant lifecycle changes are represented in the reduced audit log'
);

select * from extensions.finish();
rollback;
