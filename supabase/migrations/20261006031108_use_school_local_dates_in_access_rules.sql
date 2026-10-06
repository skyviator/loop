-- Use each school's stored IANA timezone for calendar-date authorization.
-- The timestamp-taking helpers are private, deterministic test seams; callers
-- cannot supply a clock or timezone through any exposed application API.

-- A row default cannot derive a timezone from the row's school_id. Require
-- every assignment writer to persist an explicit school-local start date
-- instead of silently storing the database session date.
alter table public.classroom_staff_assignments
  alter column starts_on drop default;

create or replace function private.school_local_date_at(
  target_school_id uuid,
  target_instant timestamptz
)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (target_instant at time zone school.timezone)::date
  from public.schools school
  where school.id = target_school_id;
$$;

create or replace function private.school_local_date(target_school_id uuid)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (statement_timestamp() at time zone school.timezone)::date
  from public.schools school
  where school.id = target_school_id;
$$;

create or replace function private.user_can_access_operational_classroom_at(
  target_user_id uuid,
  target_school_id uuid,
  target_classroom_id uuid,
  target_instant timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classrooms classroom
    join public.branches branch on branch.id = classroom.branch_id and branch.school_id = classroom.school_id
    join public.schools school on school.id = classroom.school_id
    join public.school_memberships membership
      on membership.school_id = classroom.school_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
    cross join lateral (
      select private.school_local_date_at(classroom.school_id, target_instant) as today
    ) school_clock
    where classroom.id = target_classroom_id
      and classroom.school_id = target_school_id
      and classroom.status = 'active'
      and branch.status = 'active'
      and school.status = 'active'
      and (
        membership.role = 'school_admin'
        or membership.role = 'teacher' and exists (
          select 1
          from public.classroom_staff_assignments assignment
          where assignment.school_id = classroom.school_id
            and assignment.classroom_id = classroom.id
            and assignment.membership_id = membership.id
            and assignment.status = 'active'
            and assignment.starts_on <= school_clock.today
            and (assignment.ends_on is null or assignment.ends_on >= school_clock.today)
        )
        or membership.role = 'guardian' and exists (
          select 1
          from public.child_guardians guardian
          join public.children child
            on child.id = guardian.child_id
            and child.school_id = guardian.school_id
            and child.status = 'active'
          join public.child_enrollments enrollment
            on enrollment.child_id = guardian.child_id
            and enrollment.school_id = guardian.school_id
            and enrollment.classroom_id = classroom.id
            and enrollment.status = 'active'
            and enrollment.starts_on <= school_clock.today
            and (enrollment.ends_on is null or enrollment.ends_on >= school_clock.today)
          where guardian.school_id = classroom.school_id
            and guardian.guardian_membership_id = membership.id
            and guardian.status = 'active'
        )
      )
  );
$$;

create or replace function private.user_can_access_operational_classroom(
  target_user_id uuid,
  target_school_id uuid,
  target_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_can_access_operational_classroom_at(
    target_user_id,
    target_school_id,
    target_classroom_id,
    statement_timestamp()
  );
$$;

create or replace function private.user_can_access_operational_child_at(
  target_user_id uuid,
  target_school_id uuid,
  target_child_id uuid,
  target_instant timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.children child
    join public.schools school on school.id = child.school_id
    join public.child_enrollments enrollment
      on enrollment.child_id = child.id
      and enrollment.school_id = child.school_id
      and enrollment.status = 'active'
    join public.classrooms classroom
      on classroom.id = enrollment.classroom_id
      and classroom.school_id = enrollment.school_id
      and classroom.status = 'active'
    join public.branches branch
      on branch.id = classroom.branch_id
      and branch.school_id = classroom.school_id
      and branch.status = 'active'
    join public.school_memberships membership
      on membership.school_id = child.school_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
    cross join lateral (
      select private.school_local_date_at(child.school_id, target_instant) as today
    ) school_clock
    where child.id = target_child_id
      and child.school_id = target_school_id
      and child.status = 'active'
      and school.status = 'active'
      and enrollment.starts_on <= school_clock.today
      and (enrollment.ends_on is null or enrollment.ends_on >= school_clock.today)
      and (
        membership.role = 'school_admin'
        or membership.role = 'teacher' and exists (
          select 1
          from public.classroom_staff_assignments assignment
          where assignment.school_id = enrollment.school_id
            and assignment.classroom_id = enrollment.classroom_id
            and assignment.membership_id = membership.id
            and assignment.status = 'active'
            and assignment.starts_on <= school_clock.today
            and (assignment.ends_on is null or assignment.ends_on >= school_clock.today)
        )
        or membership.role = 'guardian' and exists (
          select 1
          from public.child_guardians guardian
          where guardian.school_id = child.school_id
            and guardian.child_id = child.id
            and guardian.guardian_membership_id = membership.id
            and guardian.status = 'active'
        )
      )
  );
$$;

create or replace function private.user_can_access_operational_child(
  target_user_id uuid,
  target_school_id uuid,
  target_child_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_can_access_operational_child_at(
    target_user_id,
    target_school_id,
    target_child_id,
    statement_timestamp()
  );
$$;

create or replace function private.user_can_receive_target(
  target_user_id uuid,
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
  with school_clock as materialized (
    select private.school_local_date(target_school_id) as today
  )
  select
    case target_scope
      when 'school' then exists (
        select 1 from public.schools school
        where school.id = target_school_id and school.status = 'active'
      )
      when 'branch' then exists (
        select 1 from public.branches branch
        join public.schools school on school.id = branch.school_id and school.status = 'active'
        where branch.id = target_branch_id and branch.school_id = target_school_id and branch.status = 'active'
      )
      when 'classroom' then exists (
        select 1 from public.classrooms classroom
        join public.branches branch on branch.id = classroom.branch_id and branch.school_id = classroom.school_id and branch.status = 'active'
        join public.schools school on school.id = classroom.school_id and school.status = 'active'
        where classroom.id = target_classroom_id and classroom.school_id = target_school_id and classroom.status = 'active'
      )
      else false
    end
    and (
      private.user_has_active_school_role(target_user_id, target_school_id, array['school_admin']::public.school_role[])
      or exists (
        select 1
        from public.school_memberships membership
        join public.classroom_staff_assignments assignment
          on assignment.membership_id = membership.id
          and assignment.school_id = membership.school_id
          and assignment.status = 'active'
          and assignment.starts_on <= school_clock.today
          and (assignment.ends_on is null or assignment.ends_on >= school_clock.today)
        join public.classrooms classroom
          on classroom.id = assignment.classroom_id
          and classroom.school_id = assignment.school_id
          and classroom.status = 'active'
        join public.branches branch
          on branch.id = classroom.branch_id
          and branch.school_id = classroom.school_id
          and branch.status = 'active'
        where membership.user_id = target_user_id
          and membership.school_id = target_school_id
          and membership.role = 'teacher'
          and membership.status = 'active'
          and (target_scope = 'school'
            or target_scope = 'branch' and classroom.branch_id = target_branch_id
            or target_scope = 'classroom' and classroom.id = target_classroom_id)
      )
      or exists (
        select 1
        from public.school_memberships membership
        join public.child_guardians guardian
          on guardian.guardian_membership_id = membership.id
          and guardian.school_id = membership.school_id
          and guardian.status = 'active'
        join public.children child
          on child.id = guardian.child_id
          and child.school_id = guardian.school_id
          and child.status = 'active'
        join public.child_enrollments enrollment
          on enrollment.child_id = child.id
          and enrollment.school_id = child.school_id
          and enrollment.status = 'active'
          and enrollment.starts_on <= school_clock.today
          and (enrollment.ends_on is null or enrollment.ends_on >= school_clock.today)
        join public.classrooms classroom
          on classroom.id = enrollment.classroom_id
          and classroom.school_id = enrollment.school_id
          and classroom.status = 'active'
        join public.branches branch
          on branch.id = classroom.branch_id
          and branch.school_id = classroom.school_id
          and branch.status = 'active'
        where membership.user_id = target_user_id
          and membership.school_id = target_school_id
          and membership.role = 'guardian'
          and membership.status = 'active'
          and (target_scope = 'school'
            or target_scope = 'branch' and classroom.branch_id = target_branch_id
            or target_scope = 'classroom' and classroom.id = target_classroom_id)
      )
    )
  from school_clock;
$$;

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
    cross join lateral (
      select private.school_local_date(reservation.school_id) as today
    ) school_clock
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
              and enrollment.starts_on <= school_clock.today
              and (enrollment.ends_on is null or enrollment.ends_on >= school_clock.today)
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

create or replace function public.reserve_photo_upload(
  target_classroom_id uuid,
  target_child_ids uuid[],
  variant_manifest jsonb,
  photo_caption text default null,
  photo_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_school_id uuid;
  school_today date;
begin
  select classroom.school_id into target_school_id
  from public.classrooms classroom
  where classroom.id = target_classroom_id;

  school_today := private.school_local_date(target_school_id);

  if target_school_id is null
    or not private.current_user_can_operate_classroom(target_school_id, target_classroom_id)
    or target_child_ids is null
    or cardinality(target_child_ids) < 1
    or (
      select count(distinct child.id)
      from public.children child
      join public.child_enrollments enrollment
        on enrollment.child_id = child.id
        and enrollment.school_id = child.school_id
        and enrollment.classroom_id = target_classroom_id
        and enrollment.status = 'active'
        and enrollment.starts_on <= school_today
        and (enrollment.ends_on is null or enrollment.ends_on >= school_today)
      where child.school_id = target_school_id
        and child.id = any(target_child_ids)
        and child.status = 'active'
    ) <> cardinality(target_child_ids) then
    raise exception 'Photo upload is not authorized.' using errcode = '42501';
  end if;

  return private.reserve_photo_upload(
    target_classroom_id,
    target_child_ids,
    variant_manifest,
    photo_caption,
    photo_captured_at
  );
end;
$$;

create or replace function private.guard_media_asset_child_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  school_today date;
begin
  school_today := private.school_local_date(new.school_id);

  if not exists (
    select 1
    from public.media_assets asset
    join public.children child
      on child.id = new.child_id
      and child.school_id = new.school_id
      and child.status = 'active'
    join public.child_enrollments enrollment
      on enrollment.child_id = child.id
      and enrollment.school_id = child.school_id
      and enrollment.classroom_id = asset.classroom_id
      and enrollment.status = 'active'
      and enrollment.starts_on <= school_today
      and (enrollment.ends_on is null or enrollment.ends_on >= school_today)
    join public.classrooms classroom
      on classroom.id = enrollment.classroom_id
      and classroom.school_id = enrollment.school_id
      and classroom.status = 'active'
    join public.branches branch
      on branch.id = classroom.branch_id
      and branch.school_id = classroom.school_id
      and branch.status = 'active'
    join public.schools school on school.id = child.school_id and school.status = 'active'
    where asset.id = new.asset_id and asset.school_id = new.school_id
  ) then
    raise exception 'Photo tags require a current active child enrollment.' using errcode = '42501';
  end if;
  return new;
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
  school_today date;
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

  school_today := private.school_local_date(reservation.school_id);

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
            and enrollment.starts_on <= school_today
            and (enrollment.ends_on is null or enrollment.ends_on >= school_today)
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

-- Internal timestamp-taking helpers are testable by the migration owner only.
-- The production date helper remains callable only inside the existing
-- authenticated database paths; it is not in an exposed API schema and obeys
-- schools RLS because it is SECURITY INVOKER.
revoke all on function private.school_local_date_at(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.school_local_date(uuid) from public, anon, authenticated, service_role;
grant execute on function private.school_local_date(uuid) to authenticated;

revoke all on function private.user_can_access_operational_classroom_at(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.user_can_access_operational_child_at(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.user_can_access_operational_classroom(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.user_can_access_operational_child(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.user_can_receive_target(uuid, uuid, public.communication_target_scope, uuid, uuid) from public, anon, authenticated;
revoke all on function private.guard_media_asset_child_lifecycle() from public, anon, authenticated;

-- Preserve the existing narrow authenticated call used by RLS/media paths.
revoke all on function private.current_user_can_finalize_media_reservation(uuid) from public, anon, authenticated;
grant execute on function private.current_user_can_finalize_media_reservation(uuid) to authenticated;
