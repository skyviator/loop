-- Step 3B: atomic classroom care writes and a database invariant for active sleep.

create unique index care_events_one_active_sleep_per_child
  on public.care_events (child_id)
  where category = 'sleep'
    and status = 'recorded'
    and started_at is not null
    and ended_at is null;

create or replace function private.protect_school_platform_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.plan_id is distinct from old.plan_id or new.status is distinct from old.status)
    and not private.current_user_is_platform_admin() then
    raise exception 'Only a Loop platform administrator may change a school plan or status.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_school_platform_fields() from public, anon, authenticated;

create trigger schools_protect_platform_fields
before update of plan_id, status on public.schools
for each row execute function private.protect_school_platform_fields();

create or replace function public.record_care_batch(
  target_classroom_id uuid,
  target_service_date date,
  event_category public.care_category,
  event_items jsonb,
  event_note text default null,
  linked_timetable_slot_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_school_id uuid;
  recorder_membership_id uuid;
  requested_count integer;
  inserted_count integer;
  feature_key text;
  care_batch_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'You are not authorized to record care.' using errcode = '42501';
  end if;

  if jsonb_typeof(event_items) <> 'array' then
    raise exception 'Care entries must be supplied as a list.' using errcode = '22023';
  end if;

  requested_count := jsonb_array_length(event_items);
  if requested_count < 1 or requested_count > 50 then
    raise exception 'Choose between 1 and 50 children.' using errcode = '22023';
  end if;

  if event_note is not null and char_length(event_note) > 500 then
    raise exception 'Care notes must be 500 characters or fewer.' using errcode = '22023';
  end if;

  if requested_count <> (
    select count(distinct item.child_id)::integer
      from jsonb_to_recordset(event_items) as item(child_id uuid)
  ) then
    raise exception 'Each child may appear only once in a care update.' using errcode = '22023';
  end if;

  select c.school_id
    into target_school_id
    from public.classrooms c
   where c.id = target_classroom_id
     and c.status = 'active';

  if target_school_id is null or not private.current_user_can_access_classroom(target_school_id, target_classroom_id) then
    raise exception 'You are not authorized to record care for this classroom.' using errcode = '42501';
  end if;

  select sm.id
    into recorder_membership_id
    from public.school_memberships sm
   where sm.school_id = target_school_id
     and sm.user_id = current_user_id
     and sm.role in ('school_admin', 'teacher')
     and sm.status = 'active'
   limit 1;

  if recorder_membership_id is null then
    raise exception 'An active staff membership is required.' using errcode = '42501';
  end if;

  feature_key := case event_category
    when 'meal' then 'meals'
    when 'activity' then 'activities'
    when 'note' then 'notes'
    else event_category::text
  end;

  if not private.school_feature_is_enabled(target_school_id, feature_key) then
    raise exception 'This care module is not available for the school.' using errcode = '42501';
  end if;

  if linked_timetable_slot_id is not null and not exists (
    select 1
      from public.timetable_slots ts
     where ts.id = linked_timetable_slot_id
       and ts.school_id = target_school_id
       and ts.classroom_id = target_classroom_id
       and ts.status = 'active'
       and ts.care_feature_key = feature_key
  ) then
    raise exception 'The timetable activity cannot be linked to this care update.' using errcode = '22023';
  end if;

  if event_category = 'sleep' and exists (
    select 1
      from jsonb_to_recordset(event_items) as item(child_id uuid)
      join public.care_events ce
        on ce.child_id = item.child_id
       and ce.category = 'sleep'
       and ce.status = 'recorded'
       and ce.started_at is not null
       and ce.ended_at is null
  ) then
    raise exception 'One or more selected children already have an active sleep.' using errcode = '23505';
  end if;

  insert into public.care_events (
    school_id,
    child_id,
    classroom_id,
    enrollment_id,
    category,
    recorded_at,
    started_at,
    outcome_code,
    meal_outcome,
    quantity,
    unit,
    note,
    recorded_by_membership_id,
    recorded_by_user_id,
    timetable_slot_id,
    timetable_service_date,
    bulk_batch_id
  )
  select
    target_school_id,
    item.child_id,
    target_classroom_id,
    enrollment.id,
    event_category,
    now(),
    case when event_category = 'sleep' then now() else null end,
    case when event_category = 'meal' then null else nullif(trim(item.outcome_code), '') end,
    case when event_category = 'meal' and item.meal_outcome in ('ate_all', 'ate_most', 'ate_some', 'ate_little', 'none_refused') then item.meal_outcome::public.meal_outcome else null end,
    item.quantity,
    nullif(item.unit, ''),
    event_note,
    recorder_membership_id,
    current_user_id,
    linked_timetable_slot_id,
    case when linked_timetable_slot_id is null then null else target_service_date end,
    care_batch_id
  from jsonb_to_recordset(event_items) as item(
    child_id uuid,
    outcome_code text,
    meal_outcome text,
    quantity numeric,
    unit text
  )
  join public.child_enrollments enrollment
    on enrollment.child_id = item.child_id
   and enrollment.school_id = target_school_id
   and enrollment.classroom_id = target_classroom_id
   and enrollment.status = 'active'
  join public.attendance_records attendance
    on attendance.child_id = item.child_id
   and attendance.school_id = target_school_id
   and attendance.classroom_id = target_classroom_id
   and attendance.service_date = target_service_date
   and attendance.status = 'present'
   and attendance.checked_out_at is null
  where
    (event_category <> 'meal' or item.meal_outcome in ('ate_all', 'ate_most', 'ate_some', 'ate_little', 'none_refused'))
    and (event_category <> 'bottle' or (item.quantity > 0 and item.unit in ('ml', 'oz')))
    and (event_category <> 'water' or item.outcome_code in ('sips', 'some', 'drank_well'))
    and (event_category <> 'sleep' or item.outcome_code = 'started')
    and (event_category <> 'toilet' or item.outcome_code in ('pee', 'poop', 'both', 'tried'))
    and (event_category <> 'nappy' or item.outcome_code in ('wet', 'soiled', 'both', 'dry'))
    and (event_category <> 'mood' or item.outcome_code in ('settled', 'happy', 'quiet', 'upset'))
    and (event_category <> 'activity' or char_length(trim(item.outcome_code)) between 1 and 40)
    and (event_category <> 'note' or event_note is not null);

  get diagnostics inserted_count = row_count;
  if inserted_count <> requested_count then
    raise exception 'Care was not saved because every selected child must be present, assigned, and have valid details.' using errcode = 'P0001';
  end if;

  return inserted_count;
end;
$$;

create or replace function public.end_sleep_batch(
  target_classroom_id uuid,
  sleep_event_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_school_id uuid;
  recorder_membership_id uuid;
  requested_count integer := cardinality(sleep_event_ids);
  updated_count integer;
begin
  if current_user_id is null or requested_count is null or requested_count < 1 or requested_count > 50 then
    raise exception 'Choose between 1 and 50 active sleep records.' using errcode = '22023';
  end if;

  if requested_count <> (select count(distinct event_id)::integer from unnest(sleep_event_ids) as event_id) then
    raise exception 'Each sleep record may appear only once.' using errcode = '22023';
  end if;

  select c.school_id
    into target_school_id
    from public.classrooms c
   where c.id = target_classroom_id
     and c.status = 'active';

  if target_school_id is null or not private.current_user_can_access_classroom(target_school_id, target_classroom_id) then
    raise exception 'You are not authorized to update sleep for this classroom.' using errcode = '42501';
  end if;

  if not private.school_feature_is_enabled(target_school_id, 'sleep') then
    raise exception 'Sleep updates are not available for the school.' using errcode = '42501';
  end if;

  select sm.id
    into recorder_membership_id
    from public.school_memberships sm
   where sm.school_id = target_school_id
     and sm.user_id = current_user_id
     and sm.role in ('school_admin', 'teacher')
     and sm.status = 'active'
   limit 1;

  if recorder_membership_id is null then
    raise exception 'An active staff membership is required.' using errcode = '42501';
  end if;

  update public.care_events ce
     set ended_at = now(),
         outcome_code = 'ended',
         recorded_by_membership_id = recorder_membership_id,
         recorded_by_user_id = current_user_id
   where ce.id = any(sleep_event_ids)
     and ce.school_id = target_school_id
     and ce.classroom_id = target_classroom_id
     and ce.category = 'sleep'
     and ce.status = 'recorded'
     and ce.started_at is not null
     and ce.ended_at is null;

  get diagnostics updated_count = row_count;
  if updated_count <> requested_count then
    raise exception 'Sleep was not ended because every selected child must have one active sleep.' using errcode = 'P0001';
  end if;

  return updated_count;
end;
$$;

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
      select 1 from public.classrooms classroom
       where classroom.id = target_classroom_id
         and classroom.school_id = target_school_id
         and classroom.status = 'active'
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

revoke all on function public.record_care_batch(uuid, date, public.care_category, jsonb, text, uuid) from public, anon;
revoke all on function public.end_sleep_batch(uuid, uuid[]) from public, anon;
grant execute on function public.record_care_batch(uuid, date, public.care_category, jsonb, text, uuid) to authenticated;
grant execute on function public.end_sleep_batch(uuid, uuid[]) to authenticated;
revoke all on function public.move_child_enrollment(uuid, uuid, date) from public, anon;
grant execute on function public.move_child_enrollment(uuid, uuid, date) to authenticated;
