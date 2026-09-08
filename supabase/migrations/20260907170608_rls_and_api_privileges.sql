create or replace function private.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_administrators pa
    where pa.user_id = (select auth.uid()) and pa.status = 'active'
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
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = target_school_id
      and m.user_id = (select auth.uid())
      and m.role = any(allowed_roles)
      and m.status = 'active'
  );
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
    select 1 from public.school_memberships m
    where m.id = target_membership_id
      and m.school_id = target_school_id
      and m.user_id = (select auth.uid())
      and m.role = any(allowed_roles)
      and m.status = 'active'
  );
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
  select
    private.current_user_has_school_role(target_school_id, array['school_admin']::public.school_role[])
    or exists (
      select 1
      from public.school_memberships m
      join public.classroom_staff_assignments a
        on a.membership_id = m.id and a.school_id = m.school_id
      where m.user_id = (select auth.uid())
        and m.school_id = target_school_id
        and m.role = 'teacher' and m.status = 'active'
        and a.classroom_id = target_classroom_id and a.status = 'active'
        and a.starts_on <= current_date and (a.ends_on is null or a.ends_on >= current_date)
    )
    or exists (
      select 1
      from public.school_memberships m
      join public.child_guardians g
        on g.guardian_membership_id = m.id and g.school_id = m.school_id and g.status = 'active'
      join public.child_enrollments e
        on e.child_id = g.child_id and e.school_id = g.school_id and e.status = 'active'
      where m.user_id = (select auth.uid())
        and m.school_id = target_school_id
        and m.role = 'guardian' and m.status = 'active'
        and e.classroom_id = target_classroom_id
    );
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
  select
    private.current_user_has_school_role(target_school_id, array['school_admin']::public.school_role[])
    or exists (
      select 1
      from public.child_enrollments e
      where e.school_id = target_school_id and e.child_id = target_child_id and e.status = 'active'
        and private.current_user_can_access_classroom(target_school_id, e.classroom_id)
    )
    or exists (
      select 1
      from public.school_memberships m
      join public.child_guardians g
        on g.guardian_membership_id = m.id and g.school_id = m.school_id
      where m.user_id = (select auth.uid())
        and m.school_id = target_school_id
        and m.role = 'guardian' and m.status = 'active'
        and g.child_id = target_child_id and g.status = 'active'
    );
$$;

create or replace function private.school_plan_allows_feature(
  target_school_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schools s
    join public.plans p on p.id = s.plan_id and p.status = 'active'
    join public.plan_features pf on pf.plan_id = p.id and pf.feature_key = target_feature_key and pf.is_allowed
    join public.feature_catalogue f on f.key = pf.feature_key and f.status = 'active'
    where s.id = target_school_id and s.status = 'active'
  );
$$;

create or replace function private.school_feature_is_enabled(
  target_school_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.school_plan_allows_feature(target_school_id, target_feature_key)
    and exists (
      select 1 from public.school_feature_settings fs
      where fs.school_id = target_school_id and fs.feature_key = target_feature_key and fs.is_enabled
    );
$$;

create or replace function private.care_feature_key(category public.care_category)
returns text
language sql
immutable
set search_path = ''
as $$
  select case category
    when 'meal' then 'meals'
    when 'activity' then 'activities'
    when 'note' then 'notes'
    else category::text
  end;
$$;

create or replace function private.guard_school_plan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_id is distinct from old.plan_id and not private.current_user_is_platform_admin() then
    raise exception 'Only an active platform administrator can change a school plan';
  end if;
  return new;
end;
$$;

create trigger schools_guard_plan_change
  before update of plan_id on public.schools
  for each row execute function private.guard_school_plan_change();

revoke all on function private.current_user_is_platform_admin() from public, anon, authenticated;
revoke all on function private.current_user_has_school_role(uuid, public.school_role[]) from public, anon, authenticated;
revoke all on function private.current_user_membership_matches(uuid, uuid, public.school_role[]) from public, anon, authenticated;
revoke all on function private.current_user_can_access_classroom(uuid, uuid) from public, anon, authenticated;
revoke all on function private.current_user_can_access_child(uuid, uuid) from public, anon, authenticated;
revoke all on function private.school_plan_allows_feature(uuid, text) from public, anon, authenticated;
revoke all on function private.school_feature_is_enabled(uuid, text) from public, anon, authenticated;
revoke all on function private.care_feature_key(public.care_category) from public, anon, authenticated;
revoke all on function private.guard_school_plan_change() from public, anon, authenticated;

-- RLS policies execute these helpers by OID. Authenticated may execute them only
-- through policy evaluation because the private schema itself has no USAGE grant.
grant execute on function private.current_user_is_platform_admin() to authenticated;
grant execute on function private.current_user_has_school_role(uuid, public.school_role[]) to authenticated;
grant execute on function private.current_user_membership_matches(uuid, uuid, public.school_role[]) to authenticated;
grant execute on function private.current_user_can_access_classroom(uuid, uuid) to authenticated;
grant execute on function private.current_user_can_access_child(uuid, uuid) to authenticated;
grant execute on function private.school_plan_allows_feature(uuid, text) to authenticated;
grant execute on function private.school_feature_is_enabled(uuid, text) to authenticated;
grant execute on function private.care_feature_key(public.care_category) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.platform_administrators enable row level security;
alter table public.plans enable row level security;
alter table public.feature_catalogue enable row level security;
alter table public.plan_features enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.branches enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_staff_assignments enable row level security;
alter table public.children enable row level security;
alter table public.child_enrollments enable row level security;
alter table public.child_guardians enable row level security;
alter table public.school_feature_settings enable row level security;
alter table public.timetable_slots enable row level security;
alter table public.timetable_exceptions enable row level security;
alter table public.care_events enable row level security;
alter table public.attendance_records enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.user_profiles to authenticated;
grant update (full_name, preferred_locale) on public.user_profiles to authenticated;
grant select on public.platform_administrators to authenticated;
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.feature_catalogue to authenticated;
grant select, insert, update, delete on public.plan_features to authenticated;
grant select, insert, update, delete on public.schools to authenticated;
grant select, insert, update, delete on public.school_memberships to authenticated;
grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.classrooms to authenticated;
grant select, insert, update, delete on public.classroom_staff_assignments to authenticated;
grant select, insert, update on public.children to authenticated;
grant select, insert, update on public.child_enrollments to authenticated;
grant select, insert, update, delete on public.child_guardians to authenticated;
grant select, insert, update, delete on public.school_feature_settings to authenticated;
grant select, insert, update, delete on public.timetable_slots to authenticated;
grant select, insert, update, delete on public.timetable_exceptions to authenticated;
grant select, insert, update on public.care_events to authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant select (id, school_id, invited_email, invited_role, status, expires_at, revoked_at, accepted_at, accepted_by_user_id, invited_by_user_id, created_at, updated_at) on public.invitations to authenticated;
grant insert (school_id, invited_email, invited_role, token_hash, status, expires_at, invited_by_user_id) on public.invitations to authenticated;
grant update (status, revoked_at) on public.invitations to authenticated;
grant select on public.audit_log to authenticated;

create policy profiles_select_self_or_school_admin
on public.user_profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.school_memberships target
    where target.user_id = user_profiles.id
      and private.current_user_has_school_role(target.school_id, array['school_admin']::public.school_role[])
  )
);

create policy profiles_update_self
on public.user_profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy platform_administrators_select_self
on public.platform_administrators for select to authenticated
using (user_id = (select auth.uid()));

create policy plans_select_authenticated
on public.plans for select to authenticated
using (true);
create policy plans_manage_platform_admin
on public.plans for all to authenticated
using (private.current_user_is_platform_admin())
with check (private.current_user_is_platform_admin());

create policy features_select_authenticated
on public.feature_catalogue for select to authenticated
using (true);
create policy features_manage_platform_admin
on public.feature_catalogue for all to authenticated
using (private.current_user_is_platform_admin())
with check (private.current_user_is_platform_admin());

create policy plan_features_select_authenticated
on public.plan_features for select to authenticated
using (true);
create policy plan_features_manage_platform_admin
on public.plan_features for all to authenticated
using (private.current_user_is_platform_admin())
with check (private.current_user_is_platform_admin());

create policy schools_select_member_or_platform
on public.schools for select to authenticated
using (
  private.current_user_is_platform_admin()
  or private.current_user_has_school_role(id, array['school_admin', 'teacher', 'guardian']::public.school_role[])
);
create policy schools_insert_platform
on public.schools for insert to authenticated
with check (private.current_user_is_platform_admin());
create policy schools_update_admin_or_platform
on public.schools for update to authenticated
using (private.current_user_is_platform_admin() or private.current_user_has_school_role(id, array['school_admin']::public.school_role[]))
with check (private.current_user_is_platform_admin() or private.current_user_has_school_role(id, array['school_admin']::public.school_role[]));
create policy schools_delete_platform
on public.schools for delete to authenticated
using (private.current_user_is_platform_admin());

create policy memberships_select_own_or_school_admin
on public.school_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
);
create policy memberships_insert_school_admin
on public.school_memberships for insert to authenticated
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy memberships_update_school_admin
on public.school_memberships for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy memberships_delete_school_admin
on public.school_memberships for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy branches_select_accessible
on public.branches for select to authenticated
using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or exists (
    select 1 from public.classrooms c
    where c.branch_id = branches.id and private.current_user_can_access_classroom(school_id, c.id)
  )
);
create policy branches_insert_admin on public.branches for insert to authenticated
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy branches_update_admin on public.branches for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy branches_delete_admin on public.branches for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy classrooms_select_accessible on public.classrooms for select to authenticated
using (private.current_user_can_access_classroom(school_id, id));
create policy classrooms_insert_admin on public.classrooms for insert to authenticated
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy classrooms_update_admin on public.classrooms for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy classrooms_delete_admin on public.classrooms for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy assignments_select_admin_or_self on public.classroom_staff_assignments for select to authenticated
using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or private.current_user_membership_matches(school_id, membership_id, array['teacher']::public.school_role[])
);
create policy assignments_insert_admin on public.classroom_staff_assignments for insert to authenticated
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy assignments_update_admin on public.classroom_staff_assignments for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy assignments_delete_admin on public.classroom_staff_assignments for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy children_select_accessible on public.children for select to authenticated
using (private.current_user_can_access_child(school_id, id));
create policy children_insert_admin on public.children for insert to authenticated
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy children_update_admin on public.children for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy enrollments_select_accessible on public.child_enrollments for select to authenticated
using (private.current_user_can_access_child(school_id, child_id));
create policy enrollments_insert_admin on public.child_enrollments for insert to authenticated
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy enrollments_update_admin on public.child_enrollments for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy guardians_select_accessible on public.child_guardians for select to authenticated
using (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  or private.current_user_membership_matches(school_id, guardian_membership_id, array['guardian']::public.school_role[])
  or private.current_user_can_access_child(school_id, child_id)
);
create policy guardians_insert_admin on public.child_guardians for insert to authenticated
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy guardians_update_admin on public.child_guardians for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy guardians_delete_admin on public.child_guardians for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy school_features_select_member on public.school_feature_settings for select to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin', 'teacher', 'guardian']::public.school_role[]));
create policy school_features_insert_admin on public.school_feature_settings for insert to authenticated
with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  and private.school_plan_allows_feature(school_id, feature_key)
  and configured_by_user_id = (select auth.uid())
);
create policy school_features_update_admin on public.school_feature_settings for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  and private.school_plan_allows_feature(school_id, feature_key)
  and configured_by_user_id = (select auth.uid())
);
create policy school_features_delete_admin on public.school_feature_settings for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy timetable_slots_select_accessible on public.timetable_slots for select to authenticated
using (private.current_user_can_access_classroom(school_id, classroom_id));
create policy timetable_slots_insert_admin on public.timetable_slots for insert to authenticated
with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  and private.school_feature_is_enabled(school_id, 'timetable')
  and created_by_user_id = (select auth.uid())
);
create policy timetable_slots_update_admin on public.timetable_slots for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  and private.school_feature_is_enabled(school_id, 'timetable')
);
create policy timetable_slots_delete_admin on public.timetable_slots for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy timetable_exceptions_select_accessible on public.timetable_exceptions for select to authenticated
using (private.current_user_can_access_classroom(school_id, classroom_id));
create policy timetable_exceptions_insert_admin on public.timetable_exceptions for insert to authenticated
with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  and private.school_feature_is_enabled(school_id, 'timetable')
  and created_by_user_id = (select auth.uid())
);
create policy timetable_exceptions_update_admin on public.timetable_exceptions for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  and private.school_feature_is_enabled(school_id, 'timetable')
);
create policy timetable_exceptions_delete_admin on public.timetable_exceptions for delete to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy care_events_select_accessible on public.care_events for select to authenticated
using (
  private.current_user_can_access_child(school_id, child_id)
  and private.current_user_can_access_classroom(school_id, classroom_id)
);
create policy care_events_insert_staff on public.care_events for insert to authenticated
with check (
  private.current_user_can_access_classroom(school_id, classroom_id)
  and private.current_user_has_school_role(school_id, array['school_admin', 'teacher']::public.school_role[])
  and private.current_user_membership_matches(school_id, recorded_by_membership_id, array['school_admin', 'teacher']::public.school_role[])
  and recorded_by_user_id = (select auth.uid())
  and private.school_feature_is_enabled(school_id, private.care_feature_key(category))
);
create policy care_events_update_staff on public.care_events for update to authenticated
using (
  private.current_user_can_access_classroom(school_id, classroom_id)
  and private.current_user_has_school_role(school_id, array['school_admin', 'teacher']::public.school_role[])
)
with check (
  private.current_user_can_access_classroom(school_id, classroom_id)
  and private.current_user_has_school_role(school_id, array['school_admin', 'teacher']::public.school_role[])
  and private.school_feature_is_enabled(school_id, private.care_feature_key(category))
);

create policy attendance_select_accessible on public.attendance_records for select to authenticated
using (
  private.current_user_can_access_child(school_id, child_id)
  and private.current_user_can_access_classroom(school_id, classroom_id)
);
create policy attendance_insert_staff on public.attendance_records for insert to authenticated
with check (
  private.current_user_can_access_classroom(school_id, classroom_id)
  and private.current_user_has_school_role(school_id, array['school_admin', 'teacher']::public.school_role[])
  and private.current_user_membership_matches(school_id, recorded_by_membership_id, array['school_admin', 'teacher']::public.school_role[])
  and recorded_by_user_id = (select auth.uid())
  and private.school_feature_is_enabled(school_id, 'attendance')
);
create policy attendance_update_staff on public.attendance_records for update to authenticated
using (
  private.current_user_can_access_classroom(school_id, classroom_id)
  and private.current_user_has_school_role(school_id, array['school_admin', 'teacher']::public.school_role[])
)
with check (
  private.current_user_can_access_classroom(school_id, classroom_id)
  and private.current_user_has_school_role(school_id, array['school_admin', 'teacher']::public.school_role[])
  and private.school_feature_is_enabled(school_id, 'attendance')
);

create policy invitations_select_admin on public.invitations for select to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));
create policy invitations_insert_admin on public.invitations for insert to authenticated
with check (
  private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[])
  and invited_by_user_id = (select auth.uid())
  and status = 'pending'
);
create policy invitations_update_admin on public.invitations for update to authenticated
using (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
with check (private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]));

create policy audit_select_school_admin_or_platform on public.audit_log for select to authenticated
using (
  private.current_user_is_platform_admin()
  or (school_id is not null and private.current_user_has_school_role(school_id, array['school_admin']::public.school_role[]))
);
