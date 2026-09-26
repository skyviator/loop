create type public.invitation_delivery_status as enum ('not_sent', 'sent', 'failed');

alter table public.invitations
  add column invited_child_id uuid,
  add column guardian_relationship_label text,
  add column guardian_is_primary boolean not null default false,
  add column delivery_status public.invitation_delivery_status not null default 'not_sent',
  add column delivery_attempt_count integer not null default 0 check (delivery_attempt_count >= 0),
  add column delivery_last_attempted_at timestamptz,
  add column delivery_sent_at timestamptz,
  add column delivery_failure_category text check (
    delivery_failure_category is null
    or delivery_failure_category in ('configuration', 'provider_rejected', 'rate_limited', 'network', 'unknown')
  ),
  add column reissued_from_id uuid references public.invitations(id) on delete set null,
  add constraint invitations_child_school_fkey
    foreign key (invited_child_id, school_id) references public.children(id, school_id) on delete restrict,
  add constraint invitations_non_guardian_has_no_child check (
    invited_role = 'guardian' or (
      invited_child_id is null
      and guardian_relationship_label is null
      and guardian_is_primary = false
    )
  ),
  add constraint invitations_guardian_context_present check (
    invited_role <> 'guardian' or (
      invited_child_id is not null
      and char_length(trim(guardian_relationship_label)) between 1 and 50
    )
  ) not valid,
  add constraint invitations_delivery_state_consistent check (
    (delivery_status = 'sent' and delivery_sent_at is not null and delivery_failure_category is null)
    or (delivery_status = 'failed' and delivery_sent_at is null and delivery_failure_category is not null)
    or (delivery_status = 'not_sent' and delivery_sent_at is null and delivery_failure_category is null)
  );

create index invitations_invited_child_idx
  on public.invitations (invited_child_id, status)
  where invited_child_id is not null;

grant select (
  invited_child_id,
  guardian_relationship_label,
  guardian_is_primary,
  delivery_status,
  delivery_attempt_count,
  delivery_last_attempted_at,
  delivery_sent_at,
  delivery_failure_category,
  reissued_from_id
) on public.invitations to authenticated;

create or replace function private.create_invitation(
  invitation_school_id uuid,
  invitation_email text,
  invitation_role public.school_role,
  invitation_token_hash bytea,
  invitation_expires_at timestamptz,
  invitation_child_id uuid default null,
  invitation_relationship_label text default null,
  invitation_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  created_id uuid;
  normalized_email extensions.citext := lower(trim(invitation_email))::extensions.citext;
begin
  if current_user_id is null
    or invitation_school_id is null
    or invitation_token_hash is null
    or octet_length(invitation_token_hash) <> 32
    or invitation_expires_at <= now() + interval '1 hour'
    or invitation_expires_at > now() + interval '8 days'
    or char_length(normalized_email::text) not between 3 and 320 then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.schools school
    where school.id = invitation_school_id and school.status = 'active'
  ) then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  if private.current_user_is_platform_admin() then
    if invitation_role <> 'school_admin' or invitation_child_id is not null then
      raise exception 'Invitation is invalid or unavailable.' using errcode = '42501';
    end if;
  elsif not private.current_user_has_school_role(
    invitation_school_id,
    array['school_admin']::public.school_role[]
  ) then
    raise exception 'Invitation is invalid or unavailable.' using errcode = '42501';
  end if;

  if invitation_role = 'guardian' then
    if invitation_child_id is null
      or char_length(trim(coalesce(invitation_relationship_label, ''))) not between 1 and 50
      or not exists (
        select 1 from public.children child
        where child.id = invitation_child_id
          and child.school_id = invitation_school_id
          and child.status = 'active'
      ) then
      raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
    end if;
  elsif invitation_child_id is not null or invitation_relationship_label is not null or invitation_is_primary then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  update public.invitations invitation
     set status = 'expired', updated_at = now()
   where invitation.school_id = invitation_school_id
     and invitation.invited_email = normalized_email
     and invitation.status = 'pending'
     and invitation.expires_at <= now()
     and (
       invitation.invited_role = invitation_role
       or (
         invitation.invited_role in ('teacher', 'school_admin')
         and invitation_role in ('teacher', 'school_admin')
       )
     );

  insert into public.invitations (
    school_id,
    invited_email,
    invited_role,
    token_hash,
    expires_at,
    invited_by_user_id,
    invited_child_id,
    guardian_relationship_label,
    guardian_is_primary
  ) values (
    invitation_school_id,
    normalized_email,
    invitation_role,
    invitation_token_hash,
    invitation_expires_at,
    current_user_id,
    invitation_child_id,
    case when invitation_role = 'guardian' then trim(invitation_relationship_label) else null end,
    case when invitation_role = 'guardian' then invitation_is_primary else false end
  ) returning id into created_id;

  return created_id;
end;
$$;

revoke all on function private.create_invitation(uuid, text, public.school_role, bytea, timestamptz, uuid, text, boolean) from public, anon;
grant execute on function private.create_invitation(uuid, text, public.school_role, bytea, timestamptz, uuid, text, boolean) to authenticated;

create or replace function public.create_invitation(
  invitation_school_id uuid,
  invitation_email text,
  invitation_role public.school_role,
  invitation_token_hash bytea,
  invitation_expires_at timestamptz,
  invitation_child_id uuid default null,
  invitation_relationship_label text default null,
  invitation_is_primary boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_invitation(
    invitation_school_id,
    invitation_email,
    invitation_role,
    invitation_token_hash,
    invitation_expires_at,
    invitation_child_id,
    invitation_relationship_label,
    invitation_is_primary
  );
$$;

revoke all on function public.create_invitation(uuid, text, public.school_role, bytea, timestamptz, uuid, text, boolean) from public, anon;
grant execute on function public.create_invitation(uuid, text, public.school_role, bytea, timestamptz, uuid, text, boolean) to authenticated;

create or replace function private.reissue_invitation(
  target_invitation_id uuid,
  replacement_token_hash bytea,
  replacement_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_invitation public.invitations%rowtype;
  replacement_id uuid;
begin
  if current_user_id is null
    or replacement_token_hash is null
    or octet_length(replacement_token_hash) <> 32
    or replacement_expires_at <= now() + interval '1 hour'
    or replacement_expires_at > now() + interval '8 days' then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  select invitation.* into selected_invitation
    from public.invitations invitation
   where invitation.id = target_invitation_id
   for update;

  if selected_invitation.id is null
    or selected_invitation.status = 'accepted'
    or selected_invitation.status = 'revoked'
    or coalesce(selected_invitation.delivery_last_attempted_at, selected_invitation.created_at) > now() - interval '60 seconds'
    or not (
      private.current_user_has_school_role(
        selected_invitation.school_id,
        array['school_admin']::public.school_role[]
      )
      or (
        private.current_user_is_platform_admin()
        and selected_invitation.invited_role = 'school_admin'
      )
    ) then
    raise exception 'Invitation cannot be reissued yet.' using errcode = 'P0001';
  end if;

  if selected_invitation.status = 'pending' then
    update public.invitations
       set status = case when expires_at <= now() then 'expired'::public.invitation_status else 'revoked'::public.invitation_status end,
           revoked_at = case when expires_at > now() then now() else null end,
           updated_at = now()
     where id = selected_invitation.id;
  end if;

  insert into public.invitations (
    school_id,
    invited_email,
    invited_role,
    token_hash,
    expires_at,
    invited_by_user_id,
    invited_child_id,
    guardian_relationship_label,
    guardian_is_primary,
    reissued_from_id
  ) values (
    selected_invitation.school_id,
    selected_invitation.invited_email,
    selected_invitation.invited_role,
    replacement_token_hash,
    replacement_expires_at,
    current_user_id,
    selected_invitation.invited_child_id,
    selected_invitation.guardian_relationship_label,
    selected_invitation.guardian_is_primary,
    selected_invitation.id
  ) returning id into replacement_id;

  return replacement_id;
end;
$$;

revoke all on function private.reissue_invitation(uuid, bytea, timestamptz) from public, anon;
grant execute on function private.reissue_invitation(uuid, bytea, timestamptz) to authenticated;

create or replace function public.reissue_invitation(
  target_invitation_id uuid,
  replacement_token_hash bytea,
  replacement_expires_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.reissue_invitation(target_invitation_id, replacement_token_hash, replacement_expires_at);
$$;

revoke all on function public.reissue_invitation(uuid, bytea, timestamptz) from public, anon;
grant execute on function public.reissue_invitation(uuid, bytea, timestamptz) to authenticated;

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
  membership_id uuid;
begin
  if current_user_id is null or invitation_token is null or length(invitation_token) < 24 then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  select user_record.email::extensions.citext into current_email
    from auth.users user_record
   where user_record.id = current_user_id;

  select invitation.* into selected_invitation
    from public.invitations invitation
   where invitation.token_hash = extensions.digest(invitation_token, 'sha256')
   for update;

  if selected_invitation.id is null
    or selected_invitation.status <> 'pending'
    or selected_invitation.revoked_at is not null
    or selected_invitation.expires_at <= now()
    or current_email is null
    or current_email <> selected_invitation.invited_email then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  if selected_invitation.invited_role = 'guardian' and (
    selected_invitation.invited_child_id is null
    or not exists (
      select 1 from public.children child
      where child.id = selected_invitation.invited_child_id
        and child.school_id = selected_invitation.school_id
        and child.status = 'active'
    )
  ) then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  select school_membership.role into existing_role
    from public.school_memberships school_membership
   where school_membership.school_id = selected_invitation.school_id
     and school_membership.user_id = current_user_id;

  if existing_role is not null and existing_role <> selected_invitation.invited_role then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  insert into public.school_memberships (school_id, user_id, role, status)
  values (selected_invitation.school_id, current_user_id, selected_invitation.invited_role, 'active')
  on conflict (school_id, user_id) do update set
    status = 'active',
    updated_at = now()
  returning id into membership_id;

  if selected_invitation.invited_role = 'guardian' then
    insert into public.child_guardians (
      school_id,
      child_id,
      guardian_membership_id,
      relationship_label,
      is_primary,
      status
    ) values (
      selected_invitation.school_id,
      selected_invitation.invited_child_id,
      membership_id,
      selected_invitation.guardian_relationship_label,
      selected_invitation.guardian_is_primary,
      'active'
    )
    on conflict (child_id, guardian_membership_id) do update set
      relationship_label = excluded.relationship_label,
      is_primary = excluded.is_primary,
      status = 'active',
      updated_at = now();
  end if;

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
grant execute on function private.redeem_invitation(text) to authenticated;

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
    when 'invitations' then array[
      'invited_role', 'invited_child_id', 'status', 'expires_at', 'revoked_at',
      'accepted_at', 'accepted_by_user_id', 'delivery_status',
      'delivery_attempt_count', 'delivery_last_attempted_at', 'delivery_sent_at',
      'delivery_failure_category', 'reissued_from_id'
    ]
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

create or replace function private.get_invitation_context(invitation_token_hash bytea)
returns table (
  invitation_id uuid,
  invited_email extensions.citext,
  invited_role public.school_role,
  school_name text,
  expires_at timestamptz,
  status public.invitation_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) <> 'service_role'
    or invitation_token_hash is null
    or octet_length(invitation_token_hash) <> 32 then
    raise exception 'Invitation context is unavailable.' using errcode = '42501';
  end if;
  return query
    select invitation.id, invitation.invited_email, invitation.invited_role,
      school.name, invitation.expires_at, invitation.status
    from public.invitations invitation
    join public.schools school on school.id = invitation.school_id
    where invitation.token_hash = invitation_token_hash;
end;
$$;

revoke all on function private.get_invitation_context(bytea) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.get_invitation_context(bytea) to service_role;

create or replace function public.get_invitation_context(invitation_token_hash bytea)
returns table (
  invitation_id uuid,
  invited_email extensions.citext,
  invited_role public.school_role,
  school_name text,
  expires_at timestamptz,
  status public.invitation_status
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.get_invitation_context(invitation_token_hash);
$$;

revoke all on function public.get_invitation_context(bytea) from public, anon, authenticated;
grant execute on function public.get_invitation_context(bytea) to service_role;

create or replace function private.record_invitation_delivery(
  target_invitation_id uuid,
  delivery_succeeded boolean,
  failure_category text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) <> 'service_role'
    or (delivery_succeeded and failure_category is not null)
    or (not delivery_succeeded and (failure_category is null or failure_category not in ('configuration', 'provider_rejected', 'rate_limited', 'network', 'unknown'))) then
    raise exception 'Invitation delivery update is unavailable.' using errcode = '42501';
  end if;
  update public.invitations
     set delivery_status = case when delivery_succeeded then 'sent'::public.invitation_delivery_status else 'failed'::public.invitation_delivery_status end,
         delivery_attempt_count = delivery_attempt_count + 1,
         delivery_last_attempted_at = now(),
         delivery_sent_at = case when delivery_succeeded then now() else null end,
         delivery_failure_category = case when delivery_succeeded then null else failure_category end,
         updated_at = now()
   where id = target_invitation_id;
  if not found then
    raise exception 'Invitation delivery update is unavailable.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.record_invitation_delivery(uuid, boolean, text) from public, anon, authenticated;
grant execute on function private.record_invitation_delivery(uuid, boolean, text) to service_role;

create or replace function public.record_invitation_delivery(
  target_invitation_id uuid,
  delivery_succeeded boolean,
  failure_category text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.record_invitation_delivery(target_invitation_id, delivery_succeeded, failure_category);
$$;

revoke all on function public.record_invitation_delivery(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_invitation_delivery(uuid, boolean, text) to service_role;
