-- An existing assignment can be revoked after its Teacher membership has been
-- deactivated. Creation and reactivation still require an active Teacher.
create or replace function private.validate_classroom_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status = 'inactive' then
    if new.id is distinct from old.id
      or new.school_id is distinct from old.school_id
      or new.classroom_id is distinct from old.classroom_id
      or new.membership_id is distinct from old.membership_id
      or new.starts_on is distinct from old.starts_on
      or new.created_at is distinct from old.created_at then
      raise exception 'Assignment identity cannot change during deactivation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.school_memberships membership
    where membership.id = new.membership_id
      and membership.school_id = new.school_id
      and membership.role = 'teacher'
      and membership.status = 'active'
  ) then
    raise exception 'Classroom assignments require an active teacher membership'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- citext already normalizes email equality. A unique index serializes competing
-- inserts for either staff role; Guardian's existing role-scoped rule is kept.
-- As before, passing expires_at alone does not change a pending row's status;
-- explicit status change (such as revocation or expiry) releases the slot.
create unique index invitations_one_pending_staff_per_school_email
  on public.invitations (school_id, invited_email)
  where status = 'pending'
    and invited_role in ('teacher'::public.school_role, 'school_admin'::public.school_role);
