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
values ('30000000-0000-0000-0000-000000000001', 'local_test', 'Local test', 100, 30, 0);

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
cross join (values ('attendance'), ('timetable'), ('meals')) features(feature_key);

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

select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  20,
  'exactly 20 public application tables exist'
);
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  20,
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
select extensions.lives_ok($$update public.school_memberships set role = 'school_admin' where id = 'a0000000-0000-0000-0000-000000000042'$$, 'teacher role update is filtered');
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

select * from extensions.finish();
rollback;
