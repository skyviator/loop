begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

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
  '{}'::jsonb,
  now(),
  now()
from (values
  ('51000000-0000-4000-8000-000000000001'::uuid, 'boundary-admin@loop.test'),
  ('51000000-0000-4000-8000-000000000002'::uuid, 'boundary-teacher@loop.test'),
  ('51000000-0000-4000-8000-000000000003'::uuid, 'boundary-guardian@loop.test'),
  ('51000000-0000-4000-8000-000000000004'::uuid, 'boundary-unassigned@loop.test'),
  ('51000000-0000-4000-8000-000000000005'::uuid, 'boundary-other@loop.test'),
  ('51000000-0000-4000-8000-000000000006'::uuid, 'boundary-platform@loop.test')
) identities(id, email);

insert into public.platform_administrators (user_id)
values ('51000000-0000-4000-8000-000000000006');

insert into public.plans (
  id, key, label, max_active_children, max_staff, storage_allowance_bytes
)
values (
  '52000000-0000-4000-8000-000000000001',
  'school_local_date_test',
  'School local date test',
  20,
  20,
  1048576
);

insert into public.schools (id, plan_id, name, slug, timezone)
values
  ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Colombo Boundary School', 'colombo-boundary-school', 'Asia/Colombo'),
  ('53000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', 'UTC Boundary School', 'utc-boundary-school', 'UTC'),
  ('53000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000001', 'New York Boundary School', 'new-york-boundary-school', 'America/New_York'),
  ('53000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000001', 'Other Boundary School', 'other-boundary-school', 'Pacific/Auckland');

insert into public.branches (id, school_id, name)
values
  ('54000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'Colombo Branch'),
  ('54000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000004', 'Other Branch');

insert into public.classrooms (id, school_id, branch_id, name)
values
  ('55000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', 'Boundary Classroom'),
  ('55000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000004', '54000000-0000-4000-8000-000000000004', 'Other Classroom');

insert into public.school_memberships (id, school_id, user_id, role)
values
  ('56000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'school_admin'),
  ('56000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 'teacher'),
  ('56000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000003', 'guardian'),
  ('56000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000004', 'teacher'),
  ('56000000-0000-4000-8000-000000000005', '53000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000005', 'teacher');

insert into public.classroom_staff_assignments (
  id, school_id, classroom_id, membership_id, starts_on, ends_on
)
values (
  '57000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000002',
  date '2026-01-16',
  null
);

insert into public.children (id, school_id, preferred_name)
values
  ('58000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'Boundary Child'),
  ('58000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000004', 'Other Child');

insert into public.child_enrollments (
  id, school_id, child_id, classroom_id, starts_on, ends_on, status
)
values
  ('59000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', date '2026-01-16', null, 'active'),
  ('59000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000004', '58000000-0000-4000-8000-000000000004', '55000000-0000-4000-8000-000000000004', date '2026-01-01', null, 'active');

insert into public.child_guardians (
  id, school_id, child_id, guardian_membership_id, relationship_label
)
values (
  '5a000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000003',
  'Parent'
);

-- The calendar helper follows the stored IANA zone, including a half-hour offset.
select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000001', '2026-01-15 18:29:59+00'),
  date '2026-01-15',
  'Asia/Colombo remains on the previous local date immediately before midnight'
);
select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000001', '2026-01-15 18:30:00+00'),
  date '2026-01-16',
  'Asia/Colombo changes date exactly at local midnight'
);

select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000002', '2026-01-15 23:59:59+00'),
  date '2026-01-15',
  'UTC school remains on the previous date immediately before UTC midnight'
);
select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000002', '2026-01-16 00:00:00+00'),
  date '2026-01-16',
  'UTC school changes date exactly at UTC midnight'
);

select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000003', '2026-01-16 04:59:59+00'),
  date '2026-01-15',
  'negative-offset New York school remains on the previous date before winter midnight'
);
select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000003', '2026-01-16 05:00:00+00'),
  date '2026-01-16',
  'negative-offset New York school changes date at winter midnight'
);
select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000003', '2026-07-16 03:59:59+00'),
  date '2026-07-15',
  'New York IANA rules retain the previous date before daylight-saving midnight'
);
select extensions.is(
  private.school_local_date_at('53000000-0000-4000-8000-000000000003', '2026-07-16 04:00:00+00'),
  date '2026-07-16',
  'New York IANA rules apply the daylight-saving midnight boundary'
);

-- Assignment access changes at the school's local boundary, never at UTC midnight.
select extensions.is(
  private.user_can_access_operational_classroom_at(
    '51000000-0000-4000-8000-000000000002',
    '53000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    '2026-01-15 18:29:59+00'
  ),
  false,
  'Teacher receives no early classroom access before Colombo local midnight'
);
select extensions.is(
  private.user_can_access_operational_classroom_at(
    '51000000-0000-4000-8000-000000000002',
    '53000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  true,
  'Teacher gains classroom access exactly at Colombo local midnight'
);
select extensions.is(
  private.user_can_access_operational_classroom_at(
    '51000000-0000-4000-8000-000000000004',
    '53000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  false,
  'unassigned Teacher remains denied at the local boundary'
);
select extensions.is(
  private.user_can_access_operational_classroom_at(
    '51000000-0000-4000-8000-000000000002',
    '53000000-0000-4000-8000-000000000004',
    '55000000-0000-4000-8000-000000000004',
    '2026-01-15 18:30:00+00'
  ),
  false,
  'Teacher cannot cross tenants by changing school and classroom identifiers'
);

delete from public.classroom_staff_assignments
where id = '57000000-0000-4000-8000-000000000001';
insert into public.classroom_staff_assignments (
  id, school_id, classroom_id, membership_id, starts_on, ends_on
)
values (
  '57000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000002',
  date '2026-01-14',
  date '2026-01-15'
);

select extensions.is(
  private.user_can_access_operational_classroom_at(
    '51000000-0000-4000-8000-000000000002',
    '53000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    '2026-01-15 18:29:59+00'
  ),
  true,
  'assignment end date remains inclusive through the final school-local day'
);
select extensions.is(
  private.user_can_access_operational_classroom_at(
    '51000000-0000-4000-8000-000000000002',
    '53000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  false,
  'Teacher loses classroom access after the inclusive end date in school time'
);

-- Enrollment visibility uses the same date and inclusive end-date semantics.
select extensions.is(
  private.user_can_access_operational_child_at(
    '51000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    '2026-01-15 18:29:59+00'
  ),
  false,
  'active School Admin receives no early child access before enrollment starts'
);
select extensions.is(
  private.user_can_access_operational_child_at(
    '51000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  true,
  'child becomes operationally visible exactly when enrollment starts locally'
);
select extensions.is(
  private.user_can_access_operational_child_at(
    '51000000-0000-4000-8000-000000000003',
    '53000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  true,
  'linked Guardian gains child access at the same local enrollment boundary'
);
select extensions.is(
  private.user_can_access_operational_child_at(
    '51000000-0000-4000-8000-000000000006',
    '53000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  false,
  'Platform Super Admin remains child-data blind'
);
select extensions.is(
  private.user_can_access_operational_child_at(
    '51000000-0000-4000-8000-000000000005',
    '53000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  false,
  'other-school user cannot access the child at the boundary'
);

delete from public.child_enrollments
where id = '59000000-0000-4000-8000-000000000001';
insert into public.child_enrollments (
  id, school_id, child_id, classroom_id, starts_on, ends_on, status
)
values (
  '59000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  date '2026-01-14',
  date '2026-01-15',
  'active'
);

select extensions.is(
  private.user_can_access_operational_child_at(
    '51000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    '2026-01-15 18:29:59+00'
  ),
  true,
  'enrollment end date remains inclusive through the final school-local day'
);
select extensions.is(
  private.user_can_access_operational_child_at(
    '51000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    '2026-01-15 18:30:00+00'
  ),
  false,
  'child stops being operationally visible after the enrollment end date locally'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef('private.user_can_access_operational_classroom(uuid,uuid,uuid)'::regprocedure)
    ilike '%statement_timestamp()%'
  and pg_catalog.pg_get_functiondef('private.user_can_access_operational_child(uuid,uuid,uuid)'::regprocedure)
    ilike '%statement_timestamp()%',
  'production access helpers use the database clock and expose no caller clock override'
);
select extensions.is(
  pg_catalog.pg_get_function_identity_arguments('private.school_local_date(uuid)'::regprocedure),
  'target_school_id uuid',
  'production school-date helper accepts only a stored school identifier'
);
select extensions.is(
  (select column_default::text from information_schema.columns where table_schema = 'public' and table_name = 'classroom_staff_assignments' and column_name = 'starts_on'),
  null::text,
  'assignment creation has no implicit database-session-date default'
);
select extensions.is(
  has_function_privilege('authenticated', 'private.school_local_date_at(uuid,timestamptz)', 'execute'),
  false,
  'authenticated users cannot execute the deterministic clock helper'
);
select extensions.is(
  has_function_privilege('anon', 'private.school_local_date(uuid)', 'execute'),
  false,
  'anonymous users cannot execute the production school-date helper'
);
select extensions.is(
  (select prosecdef from pg_catalog.pg_proc where oid = 'private.school_local_date(uuid)'::regprocedure),
  false,
  'production school-date helper remains SECURITY INVOKER'
);
select extensions.is(
  has_function_privilege('authenticated', 'private.user_can_access_operational_classroom_at(uuid,uuid,uuid,timestamptz)', 'execute'),
  false,
  'authenticated users cannot execute timestamp-controlled classroom authorization'
);
select extensions.is(
  has_function_privilege('authenticated', 'private.user_can_access_operational_child_at(uuid,uuid,uuid,timestamptz)', 'execute'),
  false,
  'authenticated users cannot execute timestamp-controlled child authorization'
);

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.ok(
  private.school_local_date('53000000-0000-4000-8000-000000000001') is not null,
  'authenticated school member can resolve their own stored school date'
);
select extensions.is(
  private.school_local_date('53000000-0000-4000-8000-000000000004'),
  null::date,
  'SECURITY INVOKER school-date helper does not expose another tenant timezone'
);
reset role;

select * from extensions.finish();
rollback;
