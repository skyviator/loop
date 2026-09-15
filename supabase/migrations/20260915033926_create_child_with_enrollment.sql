-- Create the child and initial current enrollment as one authenticated,
-- RLS-protected transaction. Any failure rolls back the child, enrollment,
-- default media-consent row, and their audit records together.
create or replace function public.create_child_with_enrollment(
  expected_school_id uuid,
  target_preferred_name text,
  target_classroom_id uuid,
  enrollment_start date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_school_id uuid;
  new_child_id uuid;
begin
  if expected_school_id is null
    or target_preferred_name is null
    or char_length(pg_catalog.btrim(target_preferred_name)) not between 1 and 80
    or target_classroom_id is null
    or enrollment_start is null then
    raise exception 'A valid child name, classroom, and enrollment date are required.' using errcode = '22023';
  end if;

  select classroom.school_id
    into target_school_id
    from public.classrooms classroom
    join public.branches branch
      on branch.id = classroom.branch_id
     and branch.school_id = classroom.school_id
    join public.schools school
      on school.id = classroom.school_id
   where classroom.id = target_classroom_id
     and classroom.status = 'active'
     and branch.status = 'active'
     and school.status = 'active'
   for share of classroom, branch, school;

  if target_school_id is null
    or target_school_id <> expected_school_id
    or not private.current_user_has_school_role(
      target_school_id,
      array['school_admin']::public.school_role[]
    ) then
    raise exception 'Child creation is not authorized for this classroom.' using errcode = '42501';
  end if;

  insert into public.children (school_id, preferred_name)
  values (target_school_id, pg_catalog.btrim(target_preferred_name))
  returning id into new_child_id;

  insert into public.child_enrollments (
    school_id,
    child_id,
    classroom_id,
    starts_on,
    status
  ) values (
    target_school_id,
    new_child_id,
    target_classroom_id,
    enrollment_start,
    'active'
  );

  return new_child_id;
end;
$$;

revoke all on function public.create_child_with_enrollment(uuid, text, uuid, date) from public, anon;
grant execute on function public.create_child_with_enrollment(uuid, text, uuid, date) to authenticated;

comment on function public.create_child_with_enrollment(uuid, text, uuid, date) is
  'Atomically creates a child and initial active enrollment for an authenticated same-school School Admin.';

-- Keep the existing atomic move RPC, but reject a destination beneath an
-- inactive branch as well as an inactive classroom. Historical enrollments
-- remain untouched by branch/classroom status changes.
create or replace function public.move_child_enrollment(
  target_child_id uuid,
  target_classroom_id uuid,
  move_date date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_school_id uuid;
  current_enrollment public.child_enrollments%rowtype;
  new_enrollment_id uuid;
begin
  select child.school_id
    into target_school_id
    from public.children child
   where child.id = target_child_id
     and child.status = 'active';

  if target_school_id is null
    or not private.current_user_has_school_role(target_school_id, array['school_admin']::public.school_role[])
    or not exists (
      select 1
        from public.classrooms classroom
        join public.branches branch
          on branch.id = classroom.branch_id and branch.school_id = classroom.school_id
       where classroom.id = target_classroom_id
         and classroom.school_id = target_school_id
         and classroom.status = 'active'
         and branch.status = 'active'
    ) then
    raise exception 'The enrollment change is not authorized.' using errcode = '42501';
  end if;

  select enrollment.*
    into current_enrollment
    from public.child_enrollments enrollment
   where enrollment.child_id = target_child_id
     and enrollment.school_id = target_school_id
     and enrollment.status = 'active'
   for update;

  if current_enrollment.id is not null and current_enrollment.classroom_id = target_classroom_id then
    return current_enrollment.id;
  end if;

  if current_enrollment.id is not null then
    update public.child_enrollments
       set status = 'completed',
           ends_on = greatest(current_enrollment.starts_on, move_date - 1)
     where id = current_enrollment.id;
  end if;

  insert into public.child_enrollments (school_id, child_id, classroom_id, starts_on, status)
  values (target_school_id, target_child_id, target_classroom_id, move_date, 'active')
  returning id into new_enrollment_id;

  return new_enrollment_id;
end;
$$;
