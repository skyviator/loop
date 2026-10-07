-- Return only the conversation labels the current authenticated user may see.
-- Guardian profile names remain hidden from broad profile/membership SELECTs;
-- this narrow function discloses them only alongside an already-authorized
-- guardian-specific message thread.
create or replace function private.list_accessible_message_thread_summaries()
returns table (
  id uuid,
  child_id uuid,
  guardian_membership_id uuid,
  updated_at timestamptz,
  child_name text,
  guardian_name text,
  relationship_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    thread.id,
    thread.child_id,
    thread.guardian_membership_id,
    thread.updated_at,
    child.preferred_name,
    profile.full_name,
    guardian.relationship_label
  from public.message_threads thread
  join public.children child
    on child.id = thread.child_id
    and child.school_id = thread.school_id
  join public.child_guardians guardian
    on guardian.school_id = thread.school_id
    and guardian.child_id = thread.child_id
    and guardian.guardian_membership_id = thread.guardian_membership_id
    and guardian.status = 'active'
  join public.school_memberships membership
    on membership.id = thread.guardian_membership_id
    and membership.school_id = thread.school_id
    and membership.role = 'guardian'
    and membership.status = 'active'
  join public.user_profiles profile
    on profile.id = membership.user_id
  where thread.status = 'active'
    and private.current_user_can_access_message_thread(thread.id)
  order by thread.updated_at desc, thread.id
  limit 50;
$$;

create or replace function public.list_accessible_message_thread_summaries()
returns table (
  id uuid,
  child_id uuid,
  guardian_membership_id uuid,
  updated_at timestamptz,
  child_name text,
  guardian_name text,
  relationship_label text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_accessible_message_thread_summaries();
$$;

revoke all on function private.list_accessible_message_thread_summaries() from public, anon, authenticated;
grant execute on function private.list_accessible_message_thread_summaries() to authenticated;

revoke all on function public.list_accessible_message_thread_summaries() from public, anon;
grant execute on function public.list_accessible_message_thread_summaries() to authenticated;
