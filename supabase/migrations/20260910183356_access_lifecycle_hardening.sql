-- School Admin access-lifecycle hardening.
-- Operational access is derived from current active relationships. School
-- administrators retain same-school history access while their school and
-- membership remain active.

create or replace function private.user_has_active_school_role(
  target_user_id uuid,
  target_school_id uuid,
  allowed_roles public.school_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_memberships membership
    join public.schools school on school.id = membership.school_id and school.status = 'active'
    where membership.user_id = target_user_id
      and membership.school_id = target_school_id
      and membership.role = any(allowed_roles)
      and membership.status = 'active'
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
  select exists (
    select 1
    from public.classrooms classroom
    join public.branches branch on branch.id = classroom.branch_id and branch.school_id = classroom.school_id
    join public.schools school on school.id = classroom.school_id
    join public.school_memberships membership
      on membership.school_id = classroom.school_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
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
            and assignment.starts_on <= current_date
            and (assignment.ends_on is null or assignment.ends_on >= current_date)
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
            and enrollment.starts_on <= current_date
            and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
          where guardian.school_id = classroom.school_id
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
  select exists (
    select 1
    from public.children child
    join public.schools school on school.id = child.school_id
    join public.child_enrollments enrollment
      on enrollment.child_id = child.id
      and enrollment.school_id = child.school_id
      and enrollment.status = 'active'
      and enrollment.starts_on <= current_date
      and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
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
    where child.id = target_child_id
      and child.school_id = target_school_id
      and child.status = 'active'
      and school.status = 'active'
      and (
        membership.role = 'school_admin'
        or membership.role = 'teacher' and exists (
          select 1
          from public.classroom_staff_assignments assignment
          where assignment.school_id = enrollment.school_id
            and assignment.classroom_id = enrollment.classroom_id
            and assignment.membership_id = membership.id
            and assignment.status = 'active'
            and assignment.starts_on <= current_date
            and (assignment.ends_on is null or assignment.ends_on >= current_date)
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

create or replace function private.current_user_has_school_role(
  target_school_id uuid,
  allowed_roles public.school_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_active_school_role((select auth.uid()), target_school_id, allowed_roles);
$$;

create or replace function private.current_user_membership_matches(
  target_school_id uuid,
  target_membership_id uuid,
  allowed_roles public.school_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_memberships membership
    join public.schools school on school.id = membership.school_id and school.status = 'active'
    where membership.id = target_membership_id
      and membership.school_id = target_school_id
      and membership.user_id = (select auth.uid())
      and membership.role = any(allowed_roles)
      and membership.status = 'active'
  );
$$;

create or replace function private.current_user_can_operate_classroom(
  target_school_id uuid,
  target_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_can_access_operational_classroom((select auth.uid()), target_school_id, target_classroom_id)
    and private.current_user_has_school_role(target_school_id, array['school_admin', 'teacher']::public.school_role[]);
$$;

create or replace function private.current_user_can_access_classroom(
  target_school_id uuid,
  target_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_has_school_role(target_school_id, array['school_admin']::public.school_role[])
    or private.user_can_access_operational_classroom((select auth.uid()), target_school_id, target_classroom_id);
$$;

create or replace function private.current_user_can_access_child(
  target_school_id uuid,
  target_child_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_has_school_role(target_school_id, array['school_admin']::public.school_role[])
    or private.user_can_access_operational_child((select auth.uid()), target_school_id, target_child_id);
$$;

-- The shared plan-limit trigger must not dereference membership-only fields on
-- an inactive child update. JSON extraction keeps the polymorphic trigger safe.
create or replace function private.enforce_school_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school_id uuid := (to_jsonb(new) ->> 'school_id')::uuid;
  target_id uuid := (to_jsonb(new) ->> 'id')::uuid;
  new_status text := to_jsonb(new) ->> 'status';
  new_role text := to_jsonb(new) ->> 'role';
  allowed_count integer;
  current_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_school_id::text, 0));

  if tg_table_name = 'children' and new_status = 'active' then
    select plan.max_active_children into allowed_count
    from public.schools school
    join public.plans plan on plan.id = school.plan_id
    where school.id = target_school_id;

    select count(*)::integer into current_count
    from public.children child
    where child.school_id = target_school_id
      and child.status = 'active'
      and (tg_op = 'INSERT' or child.id <> target_id);

    if current_count + 1 > allowed_count then
      raise exception 'The active child limit for this school plan has been reached.' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'school_memberships' and new_status = 'active' and new_role in ('school_admin', 'teacher') then
    select plan.max_staff into allowed_count
    from public.schools school
    join public.plans plan on plan.id = school.plan_id
    where school.id = target_school_id;

    select count(*)::integer into current_count
    from public.school_memberships membership
    where membership.school_id = target_school_id
      and membership.status = 'active'
      and membership.role in ('school_admin', 'teacher')
      and (tg_op = 'INSERT' or membership.id <> target_id);

    if current_count + 1 > allowed_count then
      raise exception 'The active staff limit for this school plan has been reached.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
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
          and assignment.starts_on <= current_date
          and (assignment.ends_on is null or assignment.ends_on >= current_date)
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
          and enrollment.starts_on <= current_date
          and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
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
    );
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
  select private.user_can_receive_target((select auth.uid()), target_school_id, target_scope, target_branch_id, target_classroom_id);
$$;

create or replace function private.current_user_can_access_message_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_threads thread
    where thread.id = target_thread_id
      and thread.status = 'active'
      and private.school_feature_is_enabled(thread.school_id, 'messaging')
      and private.current_user_can_access_child(thread.school_id, thread.child_id)
      and (
        private.current_user_has_school_role(thread.school_id, array['school_admin', 'teacher']::public.school_role[])
        or private.current_user_membership_matches(
          thread.school_id,
          thread.guardian_membership_id,
          array['guardian']::public.school_role[]
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
    select 1
    from public.media_assets asset
    where asset.id = target_asset_id
      and asset.status = 'ready'
      and private.school_feature_is_enabled(asset.school_id, 'photos')
      and (
        private.current_user_has_school_role(asset.school_id, array['school_admin']::public.school_role[])
        or private.current_user_has_school_role(asset.school_id, array['teacher']::public.school_role[])
          and private.current_user_can_operate_classroom(asset.school_id, asset.classroom_id)
          and exists (
            select 1 from public.media_asset_children tagged
            where tagged.asset_id = asset.id
              and private.current_user_can_access_child(asset.school_id, tagged.child_id)
          )
        or exists (
          select 1
          from public.media_asset_children tagged
          join public.child_guardians guardian
            on guardian.child_id = tagged.child_id
            and guardian.school_id = tagged.school_id
            and guardian.status = 'active'
          where tagged.asset_id = asset.id
            and private.current_user_membership_matches(
              asset.school_id,
              guardian.guardian_membership_id,
              array['guardian']::public.school_role[]
            )
            and private.current_user_can_access_child(asset.school_id, tagged.child_id)
        )
      )
  );
$$;

-- Serialize administrator-removal decisions per school. This trigger protects
-- every database write path, including privileged maintenance paths.
create or replace function private.protect_last_active_school_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_school_id uuid := old.school_id;
  removes_active_admin boolean;
begin
  removes_active_admin := old.role = 'school_admin' and old.status = 'active'
    and (tg_op = 'DELETE'
      or new.school_id is distinct from old.school_id
      or new.role is distinct from 'school_admin'::public.school_role
      or new.status is distinct from 'active'::public.record_status);

  if removes_active_admin and exists (
    select 1 from public.schools school
    where school.id = protected_school_id and school.status = 'active'
  ) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(protected_school_id::text, 0));
    if not exists (
      select 1
      from public.school_memberships membership
      where membership.school_id = protected_school_id
        and membership.role = 'school_admin'
        and membership.status = 'active'
        and membership.id <> old.id
    ) then
      raise exception 'An active school must keep at least one active School Admin.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger school_memberships_protect_last_admin_update
  before update of school_id, role, status on public.school_memberships
  for each row execute function private.protect_last_active_school_admin();
create trigger school_memberships_protect_last_admin_delete
  before delete on public.school_memberships
  for each row execute function private.protect_last_active_school_admin();

create or replace function private.set_school_membership_status(
  target_membership_id uuid,
  target_status public.record_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership public.school_memberships%rowtype;
begin
  if (select auth.uid()) is null or target_membership_id is null or target_status is null then
    raise exception 'Membership status change is not authorized.' using errcode = '42501';
  end if;

  select * into target_membership
  from public.school_memberships membership
  where membership.id = target_membership_id;

  if not found then
    raise exception 'Membership status change is not authorized.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_membership.school_id::text, 0));

  select * into target_membership
  from public.school_memberships membership
  where membership.id = target_membership_id
  for update;

  if not private.user_has_active_school_role(
    (select auth.uid()),
    target_membership.school_id,
    array['school_admin']::public.school_role[]
  ) then
    raise exception 'Membership status change is not authorized.' using errcode = '42501';
  end if;

  update public.school_memberships
  set status = target_status
  where id = target_membership.id;
end;
$$;

create or replace function public.set_school_membership_status(
  target_membership_id uuid,
  target_status public.record_status
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_school_membership_status(target_membership_id, target_status);
$$;

-- Authenticated users retain read access to membership records through RLS,
-- but all direct mutations are removed. Invitation redemption and the narrow
-- status RPC are the only application membership-write paths.
revoke insert, update, delete on public.school_memberships from authenticated;
drop policy if exists memberships_insert_school_admin on public.school_memberships;
drop policy if exists memberships_update_school_admin on public.school_memberships;
drop policy if exists memberships_delete_school_admin on public.school_memberships;

revoke all on function private.user_has_active_school_role(uuid, uuid, public.school_role[]) from public, anon, authenticated;
revoke all on function private.user_can_access_operational_classroom(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.user_can_access_operational_child(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.user_can_receive_target(uuid, uuid, public.communication_target_scope, uuid, uuid) from public, anon, authenticated;
revoke all on function private.current_user_can_operate_classroom(uuid, uuid) from public, anon, authenticated;
revoke all on function private.protect_last_active_school_admin() from public, anon, authenticated;
revoke all on function private.set_school_membership_status(uuid, public.record_status) from public, anon, authenticated;
grant execute on function private.set_school_membership_status(uuid, public.record_status) to authenticated;
revoke all on function public.set_school_membership_status(uuid, public.record_status) from public, anon;
grant execute on function public.set_school_membership_status(uuid, public.record_status) to authenticated;
grant execute on function private.current_user_can_operate_classroom(uuid, uuid) to authenticated;

-- Media reservation ownership is not sufficient after staff access changes.
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
    join public.media_assets asset on asset.reservation_id = reservation.id and asset.school_id = reservation.school_id
    where reservation.id = target_reservation_id
      and reservation.uploader_user_id = (select auth.uid())
      and private.current_user_membership_matches(
        reservation.school_id,
        reservation.uploader_membership_id,
        array['school_admin', 'teacher']::public.school_role[]
      )
      and private.current_user_can_operate_classroom(reservation.school_id, reservation.classroom_id)
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
            where child.id = tagged.child_id
              and child.school_id = reservation.school_id
              and child.status = 'active'
          )
      )
  );
$$;

revoke all on function private.current_user_can_finalize_media_reservation(uuid) from public, anon, authenticated;
grant execute on function private.current_user_can_finalize_media_reservation(uuid) to authenticated;

drop policy if exists media_reservations_select_uploader on public.media_upload_reservations;
create policy media_reservations_select_current_uploader
on public.media_upload_reservations for select to authenticated
using (
  private.current_user_can_finalize_media_reservation(id)
);

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
begin
  select classroom.school_id into target_school_id
  from public.classrooms classroom
  where classroom.id = target_classroom_id;

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
        and enrollment.starts_on <= current_date
        and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
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
begin
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
      and enrollment.starts_on <= current_date
      and (enrollment.ends_on is null or enrollment.ends_on >= current_date)
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

create trigger media_asset_children_guard_lifecycle
  before insert on public.media_asset_children
  for each row execute function private.guard_media_asset_child_lifecycle();

revoke all on function private.guard_media_asset_child_lifecycle() from public, anon, authenticated;

-- Broadcast only a constant invalidation signal. Clients must fetch messages
-- through the normal RLS-protected Data API before rendering any new content.
create or replace function private.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_thread_id uuid := case when tg_op = 'DELETE' then old.thread_id else new.thread_id end;
begin
  if tg_op = 'INSERT' then
    update public.message_threads set updated_at = new.created_at where id = new.thread_id;
  end if;
  perform realtime.send(
    jsonb_build_object('kind', 'message_changed'),
    'message_changed',
    'message-thread:' || target_thread_id::text,
    true
  );
  return null;
end;
$$;

-- Extend the existing reduced audit allow-list without recording names,
-- messages, media URLs, tokens, or other child-private content.
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
    when 'branches' then array['status']
    when 'classrooms' then array['branch_id', 'status']
    when 'classroom_staff_assignments' then array['classroom_id', 'membership_id', 'status', 'starts_on', 'ends_on']
    when 'children' then array['status']
    when 'child_enrollments' then array['child_id', 'classroom_id', 'status', 'starts_on', 'ends_on']
    when 'child_guardians' then array['child_id', 'guardian_membership_id', 'is_primary', 'status']
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

create trigger audit_branches after insert or update or delete on public.branches
  for each row execute function private.write_audit_event();
create trigger audit_classrooms after insert or update or delete on public.classrooms
  for each row execute function private.write_audit_event();
create trigger audit_children after insert or update or delete on public.children
  for each row execute function private.write_audit_event();
create trigger audit_child_enrollments after insert or update or delete on public.child_enrollments
  for each row execute function private.write_audit_event();
create trigger audit_child_guardians after insert or update or delete on public.child_guardians
  for each row execute function private.write_audit_event();

-- Push registration and delivery always re-check the active school and current
-- relationship graph. Historical rows alone never make a recipient eligible.
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
    select 1
    from public.school_memberships membership
    join public.schools school on school.id = membership.school_id and school.status = 'active'
    where membership.user_id = current_user_id and membership.status = 'active'
  ) or exists (
    select 1 from public.platform_administrators administrator
    where administrator.user_id = current_user_id and administrator.status = 'active'
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

create or replace function private.user_can_receive_push_event(target_user_id uuid, target_outbox_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.notification_outbox outbox
    join public.schools school on school.id = outbox.school_id and school.status = 'active'
    where outbox.id = target_outbox_id
      and outbox.status = 'pending'
      and target_user_id is distinct from outbox.source_user_id
      and exists (
        select 1 from public.school_memberships membership
        where membership.school_id = outbox.school_id
          and membership.user_id = target_user_id
          and membership.status = 'active'
      )
      and not exists (
        select 1 from public.platform_administrators administrator
        where administrator.user_id = target_user_id and administrator.status = 'active'
      )
      and case outbox.event_type
        when 'attendance_check_in' then
          coalesce((select preference.attendance_enabled from public.notification_preferences preference where preference.user_id = target_user_id), true)
          and private.school_feature_is_enabled(outbox.school_id, 'attendance')
          and exists (
            select 1
            from public.attendance_records attendance
            join public.school_memberships membership
              on membership.school_id = attendance.school_id
              and membership.user_id = target_user_id
              and membership.role = 'guardian'
              and membership.status = 'active'
            join public.child_guardians guardian
              on guardian.school_id = attendance.school_id
              and guardian.child_id = attendance.child_id
              and guardian.guardian_membership_id = membership.id
              and guardian.status = 'active'
            where attendance.id = outbox.source_id
              and attendance.school_id = outbox.school_id
              and private.user_can_access_operational_child(target_user_id, attendance.school_id, attendance.child_id)
          )
        when 'attendance_check_out' then
          coalesce((select preference.attendance_enabled from public.notification_preferences preference where preference.user_id = target_user_id), true)
          and private.school_feature_is_enabled(outbox.school_id, 'attendance')
          and exists (
            select 1
            from public.attendance_records attendance
            join public.school_memberships membership
              on membership.school_id = attendance.school_id
              and membership.user_id = target_user_id
              and membership.role = 'guardian'
              and membership.status = 'active'
            join public.child_guardians guardian
              on guardian.school_id = attendance.school_id
              and guardian.child_id = attendance.child_id
              and guardian.guardian_membership_id = membership.id
              and guardian.status = 'active'
            where attendance.id = outbox.source_id
              and attendance.school_id = outbox.school_id
              and private.user_can_access_operational_child(target_user_id, attendance.school_id, attendance.child_id)
          )
        when 'message' then
          coalesce((select preference.messages_enabled from public.notification_preferences preference where preference.user_id = target_user_id), true)
          and private.school_feature_is_enabled(outbox.school_id, 'messaging')
          and exists (
            select 1
            from public.messages message
            join public.message_threads thread
              on thread.id = message.thread_id
              and thread.school_id = message.school_id
              and thread.status = 'active'
            join public.school_memberships membership
              on membership.school_id = thread.school_id
              and membership.user_id = target_user_id
              and membership.status = 'active'
            where message.id = outbox.source_id
              and message.school_id = outbox.school_id
              and private.user_can_access_operational_child(target_user_id, thread.school_id, thread.child_id)
              and (membership.role in ('school_admin', 'teacher')
                or membership.role = 'guardian' and membership.id = thread.guardian_membership_id)
          )
        when 'important_announcement' then
          coalesce((select preference.important_announcements_enabled from public.notification_preferences preference where preference.user_id = target_user_id), true)
          and private.school_feature_is_enabled(outbox.school_id, 'announcements')
          and exists (
            select 1
            from public.announcements announcement
            where announcement.id = outbox.source_id
              and announcement.school_id = outbox.school_id
              and announcement.priority = 'important'
              and announcement.status = 'published'
              and announcement.publish_at <= now()
              and (announcement.expires_at is null or announcement.expires_at > now())
              and private.user_can_receive_target(
                target_user_id,
                announcement.school_id,
                announcement.target_scope,
                announcement.branch_id,
                announcement.classroom_id
              )
          )
        when 'photo' then
          coalesce((select preference.photos_enabled from public.notification_preferences preference where preference.user_id = target_user_id), false)
          and private.school_feature_is_enabled(outbox.school_id, 'photos')
          and exists (
            select 1
            from public.media_assets asset
            join public.media_asset_children tagged
              on tagged.asset_id = asset.id and tagged.school_id = asset.school_id
            join public.school_memberships membership
              on membership.school_id = asset.school_id
              and membership.user_id = target_user_id
              and membership.role = 'guardian'
              and membership.status = 'active'
            join public.child_guardians guardian
              on guardian.child_id = tagged.child_id
              and guardian.school_id = tagged.school_id
              and guardian.guardian_membership_id = membership.id
              and guardian.status = 'active'
            where asset.id = outbox.source_id
              and asset.school_id = outbox.school_id
              and asset.status = 'ready'
              and private.user_can_access_operational_child(target_user_id, asset.school_id, tagged.child_id)
          )
      end
  );
$$;

drop policy if exists notification_preferences_select_self on public.notification_preferences;
drop policy if exists notification_preferences_insert_self on public.notification_preferences;
drop policy if exists notification_preferences_update_self on public.notification_preferences;
create policy notification_preferences_select_self on public.notification_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.school_memberships membership
    join public.schools school on school.id = membership.school_id and school.status = 'active'
    where membership.user_id = (select auth.uid()) and membership.status = 'active'
  )
);
create policy notification_preferences_insert_self on public.notification_preferences for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.school_memberships membership
    join public.schools school on school.id = membership.school_id and school.status = 'active'
    where membership.user_id = (select auth.uid()) and membership.status = 'active'
  )
);
create policy notification_preferences_update_self on public.notification_preferences for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.school_memberships membership
    join public.schools school on school.id = membership.school_id and school.status = 'active'
    where membership.user_id = (select auth.uid()) and membership.status = 'active'
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.school_memberships membership
    join public.schools school on school.id = membership.school_id and school.status = 'active'
    where membership.user_id = (select auth.uid()) and membership.status = 'active'
  )
);
