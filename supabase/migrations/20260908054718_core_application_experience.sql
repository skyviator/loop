-- Step 3 adds only the configuration and enforcement required by the core
-- application experience. Child and care data remain outside platform-admin
-- access, and all application writes continue to pass through RLS.

alter table public.schools
  add column teachers_can_manage_timetable boolean not null default false;

-- auto_expose_new_tables=false intentionally removes API defaults. The
-- server-only service role still needs explicit privileges for the narrowly
-- scoped local Auth seeder and invitation activator; it is never a browser key.
grant select, insert, update, delete on
  public.user_profiles,
  public.platform_administrators,
  public.plans,
  public.feature_catalogue,
  public.plan_features,
  public.schools,
  public.school_memberships,
  public.branches,
  public.classrooms,
  public.classroom_staff_assignments,
  public.children,
  public.child_enrollments,
  public.child_guardians,
  public.school_feature_settings,
  public.timetable_slots,
  public.timetable_exceptions,
  public.care_events,
  public.attendance_records,
  public.invitations,
  public.audit_log
to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function private.enforce_school_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school_id uuid := new.school_id;
  allowed_count integer;
  current_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_school_id::text, 0));

  if tg_table_name = 'children' and new.status = 'active' then
    select p.max_active_children
      into allowed_count
      from public.schools s
      join public.plans p on p.id = s.plan_id
     where s.id = target_school_id;

    select count(*)::integer
      into current_count
      from public.children c
     where c.school_id = target_school_id
       and c.status = 'active'
       and (tg_op = 'INSERT' or c.id <> new.id);

    if current_count + 1 > allowed_count then
      raise exception 'The active child limit for this school plan has been reached.'
        using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'school_memberships'
    and new.status = 'active'
    and new.role in ('school_admin', 'teacher') then
    select p.max_staff
      into allowed_count
      from public.schools s
      join public.plans p on p.id = s.plan_id
     where s.id = target_school_id;

    select count(*)::integer
      into current_count
      from public.school_memberships sm
     where sm.school_id = target_school_id
       and sm.status = 'active'
       and sm.role in ('school_admin', 'teacher')
       and (tg_op = 'INSERT' or sm.id <> new.id);

    if current_count + 1 > allowed_count then
      raise exception 'The active staff limit for this school plan has been reached.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_school_plan_limits() from public, anon, authenticated;

create trigger children_enforce_plan_limit
before insert or update of school_id, status on public.children
for each row execute function private.enforce_school_plan_limits();

create trigger memberships_enforce_plan_limit
before insert or update of school_id, role, status on public.school_memberships
for each row execute function private.enforce_school_plan_limits();

create or replace function private.teacher_can_manage_classroom_timetable(target_school_id uuid, target_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.schools s
     where s.id = target_school_id
       and s.status = 'active'
       and s.teachers_can_manage_timetable
       and private.current_user_has_school_role(target_school_id, array['teacher']::public.school_role[])
       and private.current_user_can_access_classroom(target_school_id, target_classroom_id)
       and private.school_feature_is_enabled(target_school_id, 'timetable')
  );
$$;

revoke all on function private.teacher_can_manage_classroom_timetable(uuid, uuid) from public, anon;
grant execute on function private.teacher_can_manage_classroom_timetable(uuid, uuid) to authenticated;

-- Platform operators may build the non-child starter structure and configure
-- plan-permitted features, while existing child/care policies stay unchanged.
create policy branches_platform_manage
on public.branches for all to authenticated
using (private.current_user_is_platform_admin())
with check (private.current_user_is_platform_admin());

create policy classrooms_platform_manage
on public.classrooms for all to authenticated
using (private.current_user_is_platform_admin())
with check (private.current_user_is_platform_admin());

create policy school_features_platform_manage
on public.school_feature_settings for all to authenticated
using (private.current_user_is_platform_admin())
with check (
  private.current_user_is_platform_admin()
  and private.school_plan_allows_feature(school_id, feature_key)
  and configured_by_user_id = (select auth.uid())
);

create policy invitations_platform_select
on public.invitations for select to authenticated
using (private.current_user_is_platform_admin());

create policy invitations_platform_insert
on public.invitations for insert to authenticated
with check (
  private.current_user_is_platform_admin()
  and invited_by_user_id = (select auth.uid())
  and invited_role = 'school_admin'
  and status = 'pending'
);

create policy timetable_slots_teacher_insert
on public.timetable_slots for insert to authenticated
with check (
  private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
  and created_by_user_id = (select auth.uid())
);

create policy timetable_slots_teacher_update
on public.timetable_slots for update to authenticated
using (private.teacher_can_manage_classroom_timetable(school_id, classroom_id))
with check (private.teacher_can_manage_classroom_timetable(school_id, classroom_id));

create policy timetable_slots_teacher_delete
on public.timetable_slots for delete to authenticated
using (private.teacher_can_manage_classroom_timetable(school_id, classroom_id));

create policy timetable_exceptions_teacher_insert
on public.timetable_exceptions for insert to authenticated
with check (
  private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
  and created_by_user_id = (select auth.uid())
);

create policy timetable_exceptions_teacher_update
on public.timetable_exceptions for update to authenticated
using (private.teacher_can_manage_classroom_timetable(school_id, classroom_id))
with check (private.teacher_can_manage_classroom_timetable(school_id, classroom_id));

create policy timetable_exceptions_teacher_delete
on public.timetable_exceptions for delete to authenticated
using (private.teacher_can_manage_classroom_timetable(school_id, classroom_id));

create index invitations_token_status_idx
  on public.invitations (token_hash, status, expires_at);

create or replace function private.redeem_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email extensions.citext;
  selected_invitation public.invitations%rowtype;
  existing_role public.school_role;
begin
  if current_user_id is null or invitation_token is null or length(invitation_token) < 24 then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  select u.email::extensions.citext into current_email
    from auth.users u
   where u.id = current_user_id;

  select i.* into selected_invitation
    from public.invitations i
   where i.token_hash = extensions.digest(invitation_token, 'sha256')
     and i.status = 'pending'
     and i.revoked_at is null
     and i.expires_at > now()
   for update;

  if selected_invitation.id is null or current_email is null or current_email <> selected_invitation.invited_email then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  select sm.role into existing_role
    from public.school_memberships sm
   where sm.school_id = selected_invitation.school_id
     and sm.user_id = current_user_id;

  if existing_role is not null and existing_role <> selected_invitation.invited_role then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  insert into public.school_memberships (school_id, user_id, role, status)
  values (selected_invitation.school_id, current_user_id, selected_invitation.invited_role, 'active')
  on conflict (school_id, user_id) do update set
    status = 'active',
    updated_at = now();

  update public.invitations
     set status = 'accepted',
         accepted_at = now(),
         accepted_by_user_id = current_user_id,
         updated_at = now()
   where id = selected_invitation.id;

  return selected_invitation.school_id;
end;
$$;

revoke all on function private.redeem_invitation(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.redeem_invitation(text) to authenticated;

create or replace function public.redeem_invitation(invitation_token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.redeem_invitation(invitation_token);
$$;

revoke all on function public.redeem_invitation(text) from public, anon;
grant execute on function public.redeem_invitation(text) to authenticated;

-- Consolidate role alternatives into one policy per operation so each query
-- evaluates one permissive expression rather than multiple policies.
drop policy branches_platform_manage on public.branches;
drop policy branches_select_accessible on public.branches;
drop policy branches_insert_admin on public.branches;
drop policy branches_update_admin on public.branches;
drop policy branches_delete_admin on public.branches;
create policy branches_select_accessible on public.branches for select to authenticated using (
  private.current_user_is_platform_admin()
  or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or exists (select 1 from public.classrooms c where c.branch_id = branches.id and private.current_user_can_access_classroom(school_id, c.id))
);
create policy branches_insert_authorized on public.branches for insert to authenticated with check (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);
create policy branches_update_authorized on public.branches for update to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
) with check (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);
create policy branches_delete_authorized on public.branches for delete to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);

drop policy classrooms_platform_manage on public.classrooms;
drop policy classrooms_select_accessible on public.classrooms;
drop policy classrooms_insert_admin on public.classrooms;
drop policy classrooms_update_admin on public.classrooms;
drop policy classrooms_delete_admin on public.classrooms;
create policy classrooms_select_accessible on public.classrooms for select to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_can_access_classroom(school_id, id)
);
create policy classrooms_insert_authorized on public.classrooms for insert to authenticated with check (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);
create policy classrooms_update_authorized on public.classrooms for update to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
) with check (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);
create policy classrooms_delete_authorized on public.classrooms for delete to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);

drop policy school_features_platform_manage on public.school_feature_settings;
drop policy school_features_select_member on public.school_feature_settings;
drop policy school_features_insert_admin on public.school_feature_settings;
drop policy school_features_update_admin on public.school_feature_settings;
drop policy school_features_delete_admin on public.school_feature_settings;
create policy school_features_select_authorized on public.school_feature_settings for select to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin', 'teacher', 'guardian']::public.school_role[])
);
create policy school_features_insert_authorized on public.school_feature_settings for insert to authenticated with check (
  (private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
  and private.school_plan_allows_feature(school_id, feature_key)
  and configured_by_user_id = (select auth.uid())
);
create policy school_features_update_authorized on public.school_feature_settings for update to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
) with check (
  (private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
  and private.school_plan_allows_feature(school_id, feature_key)
  and configured_by_user_id = (select auth.uid())
);
create policy school_features_delete_authorized on public.school_feature_settings for delete to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);

drop policy invitations_platform_select on public.invitations;
drop policy invitations_platform_insert on public.invitations;
drop policy invitations_select_admin on public.invitations;
drop policy invitations_insert_admin on public.invitations;
create policy invitations_select_authorized on public.invitations for select to authenticated using (
  private.current_user_is_platform_admin() or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);
create policy invitations_insert_authorized on public.invitations for insert to authenticated with check (
  invited_by_user_id = (select auth.uid())
  and status = 'pending'
  and (
    private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
    or (private.current_user_is_platform_admin() and invited_role = 'school_admin')
  )
);

drop policy timetable_slots_teacher_insert on public.timetable_slots;
drop policy timetable_slots_teacher_update on public.timetable_slots;
drop policy timetable_slots_teacher_delete on public.timetable_slots;
drop policy timetable_slots_insert_admin on public.timetable_slots;
drop policy timetable_slots_update_admin on public.timetable_slots;
drop policy timetable_slots_delete_admin on public.timetable_slots;
create policy timetable_slots_insert_authorized on public.timetable_slots for insert to authenticated with check (
  created_by_user_id = (select auth.uid())
  and (
    (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]) and private.school_feature_is_enabled(school_id, 'timetable'))
    or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
  )
);
create policy timetable_slots_update_authorized on public.timetable_slots for update to authenticated using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
) with check (
  (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]) and private.school_feature_is_enabled(school_id, 'timetable'))
  or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
);
create policy timetable_slots_delete_authorized on public.timetable_slots for delete to authenticated using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
);

drop policy timetable_exceptions_teacher_insert on public.timetable_exceptions;
drop policy timetable_exceptions_teacher_update on public.timetable_exceptions;
drop policy timetable_exceptions_teacher_delete on public.timetable_exceptions;
drop policy timetable_exceptions_insert_admin on public.timetable_exceptions;
drop policy timetable_exceptions_update_admin on public.timetable_exceptions;
drop policy timetable_exceptions_delete_admin on public.timetable_exceptions;
create policy timetable_exceptions_insert_authorized on public.timetable_exceptions for insert to authenticated with check (
  created_by_user_id = (select auth.uid())
  and (
    (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]) and private.school_feature_is_enabled(school_id, 'timetable'))
    or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
  )
);
create policy timetable_exceptions_update_authorized on public.timetable_exceptions for update to authenticated using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
) with check (
  (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]) and private.school_feature_is_enabled(school_id, 'timetable'))
  or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
);
create policy timetable_exceptions_delete_authorized on public.timetable_exceptions for delete to authenticated using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or private.teacher_can_manage_classroom_timetable(school_id, classroom_id)
);

-- Step 2 used FOR ALL beside a universal read policy on these public
-- catalogues. Split the platform writes so SELECT has only one policy.
drop policy plans_manage_platform_admin on public.plans;
create policy plans_insert_platform_admin on public.plans for insert to authenticated with check (private.current_user_is_platform_admin());
create policy plans_update_platform_admin on public.plans for update to authenticated using (private.current_user_is_platform_admin()) with check (private.current_user_is_platform_admin());
create policy plans_delete_platform_admin on public.plans for delete to authenticated using (private.current_user_is_platform_admin());

drop policy features_manage_platform_admin on public.feature_catalogue;
create policy features_insert_platform_admin on public.feature_catalogue for insert to authenticated with check (private.current_user_is_platform_admin());
create policy features_update_platform_admin on public.feature_catalogue for update to authenticated using (private.current_user_is_platform_admin()) with check (private.current_user_is_platform_admin());
create policy features_delete_platform_admin on public.feature_catalogue for delete to authenticated using (private.current_user_is_platform_admin());

drop policy plan_features_manage_platform_admin on public.plan_features;
create policy plan_features_insert_platform_admin on public.plan_features for insert to authenticated with check (private.current_user_is_platform_admin());
create policy plan_features_update_platform_admin on public.plan_features for update to authenticated using (private.current_user_is_platform_admin()) with check (private.current_user_is_platform_admin());
create policy plan_features_delete_platform_admin on public.plan_features for delete to authenticated using (private.current_user_is_platform_admin());
