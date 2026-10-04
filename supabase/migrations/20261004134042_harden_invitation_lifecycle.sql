-- Invitation lifecycle hardening.
-- Raw tokens are generated only inside service-only database functions, returned
-- once to the server-side email flow, and never stored in a table or audit row.

revoke insert, update, delete on public.invitations from authenticated;
drop policy if exists invitations_insert_authorized on public.invitations;
drop policy if exists invitations_update_admin on public.invitations;

drop function if exists public.create_invitation(uuid, text, public.school_role, bytea, timestamptz, uuid, text, boolean);
drop function if exists private.create_invitation(uuid, text, public.school_role, bytea, timestamptz, uuid, text, boolean);
drop function if exists public.reissue_invitation(uuid, bytea, timestamptz);
drop function if exists private.reissue_invitation(uuid, bytea, timestamptz);

create function private.create_invitation(
  actor_user_id uuid,
  invitation_school_id uuid,
  invitation_email text,
  invitation_role public.school_role,
  invitation_child_id uuid default null,
  invitation_relationship_label text default null,
  invitation_is_primary boolean default false
)
returns table (
  invitation_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email extensions.citext := lower(trim(invitation_email))::extensions.citext;
  raw_token text := translate(pg_catalog.encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  expires_at_value timestamptz := now() + interval '7 days';
  created_id uuid;
begin
  if current_setting('role', true) <> 'service_role'
    or actor_user_id is null
    or invitation_school_id is null
    or char_length(normalized_email::text) not between 3 and 320
    or raw_token !~ '^[A-Za-z0-9_-]{32}$' then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.schools school
    where school.id = invitation_school_id and school.status = 'active'
  ) then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.platform_administrators administrator
    where administrator.user_id = actor_user_id and administrator.status = 'active'
  ) then
    if invitation_role <> 'school_admin' or invitation_child_id is not null then
      raise exception 'Invitation is invalid or unavailable.' using errcode = '42501';
    end if;
  elsif not private.user_has_active_school_role(
    actor_user_id,
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

  -- Preserve the validated human actor in trigger-generated audit records even
  -- though this narrow operation is executed with the server-only role.
  perform pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);

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
    extensions.digest(raw_token, 'sha256'),
    expires_at_value,
    actor_user_id,
    invitation_child_id,
    case when invitation_role = 'guardian' then trim(invitation_relationship_label) else null end,
    case when invitation_role = 'guardian' then invitation_is_primary else false end
  ) returning id into created_id;

  invitation_id := created_id;
  invitation_token := raw_token;
  invitation_expires_at := expires_at_value;
  return next;
end;
$$;

revoke all on function private.create_invitation(uuid, uuid, text, public.school_role, uuid, text, boolean) from public, anon, authenticated;
grant execute on function private.create_invitation(uuid, uuid, text, public.school_role, uuid, text, boolean) to service_role;

create function public.create_invitation(
  actor_user_id uuid,
  invitation_school_id uuid,
  invitation_email text,
  invitation_role public.school_role,
  invitation_child_id uuid default null,
  invitation_relationship_label text default null,
  invitation_is_primary boolean default false
)
returns table (
  invitation_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_invitation(
    actor_user_id,
    invitation_school_id,
    invitation_email,
    invitation_role,
    invitation_child_id,
    invitation_relationship_label,
    invitation_is_primary
  );
$$;

revoke all on function public.create_invitation(uuid, uuid, text, public.school_role, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_invitation(uuid, uuid, text, public.school_role, uuid, text, boolean) to service_role;

create function private.reissue_invitation(
  actor_user_id uuid,
  target_invitation_id uuid
)
returns table (
  invitation_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_invitation public.invitations%rowtype;
  raw_token text := translate(pg_catalog.encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  expires_at_value timestamptz := now() + interval '7 days';
  replacement_id uuid;
begin
  if current_setting('role', true) <> 'service_role'
    or actor_user_id is null
    or raw_token !~ '^[A-Za-z0-9_-]{32}$' then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

  select invitation.* into selected_invitation
    from public.invitations invitation
   where invitation.id = target_invitation_id
   for update;

  if selected_invitation.id is null
    or selected_invitation.status in ('accepted', 'revoked')
    or coalesce(selected_invitation.delivery_last_attempted_at, selected_invitation.created_at) > now() - interval '60 seconds'
    or not (
      private.user_has_active_school_role(
        actor_user_id,
        selected_invitation.school_id,
        array['school_admin']::public.school_role[]
      )
      or exists (
        select 1 from public.platform_administrators administrator
        where administrator.user_id = actor_user_id
          and administrator.status = 'active'
          and selected_invitation.invited_role = 'school_admin'
      )
    ) then
    raise exception 'Invitation cannot be reissued yet.' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);

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
    extensions.digest(raw_token, 'sha256'),
    expires_at_value,
    actor_user_id,
    selected_invitation.invited_child_id,
    selected_invitation.guardian_relationship_label,
    selected_invitation.guardian_is_primary,
    selected_invitation.id
  ) returning id into replacement_id;

  invitation_id := replacement_id;
  invitation_token := raw_token;
  invitation_expires_at := expires_at_value;
  return next;
end;
$$;

revoke all on function private.reissue_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function private.reissue_invitation(uuid, uuid) to service_role;

create function public.reissue_invitation(
  actor_user_id uuid,
  target_invitation_id uuid
)
returns table (
  invitation_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.reissue_invitation(actor_user_id, target_invitation_id);
$$;

revoke all on function public.reissue_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reissue_invitation(uuid, uuid) to service_role;

create function private.revoke_invitation(
  actor_user_id uuid,
  target_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_invitation public.invitations%rowtype;
  affected_rows integer;
begin
  if current_setting('role', true) <> 'service_role' or actor_user_id is null then
    raise exception 'Invitation revocation is unavailable.' using errcode = '42501';
  end if;

  select invitation.* into selected_invitation
    from public.invitations invitation
   where invitation.id = target_invitation_id
   for update;

  if selected_invitation.id is null
    or selected_invitation.status <> 'pending'
    or not (
      private.user_has_active_school_role(
        actor_user_id,
        selected_invitation.school_id,
        array['school_admin']::public.school_role[]
      )
      or exists (
        select 1 from public.platform_administrators administrator
        where administrator.user_id = actor_user_id
          and administrator.status = 'active'
          and selected_invitation.invited_role = 'school_admin'
      )
    ) then
    raise exception 'Invitation revocation is unavailable.' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);

  update public.invitations
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where id = selected_invitation.id and status = 'pending';
  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    raise exception 'Invitation revocation is unavailable.' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

revoke all on function private.revoke_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function private.revoke_invitation(uuid, uuid) to service_role;

create function public.revoke_invitation(
  actor_user_id uuid,
  target_invitation_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_invitation(actor_user_id, target_invitation_id);
$$;

revoke all on function public.revoke_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_invitation(uuid, uuid) to service_role;

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
  membership_role public.school_role;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(selected_invitation.school_id::text || ':' || current_user_id::text, 0)
  );

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
  where public.school_memberships.role = excluded.role
  returning id, role into membership_id, membership_role;

  if membership_id is null or membership_role <> selected_invitation.invited_role then
    raise exception 'Invitation is invalid or unavailable.' using errcode = 'P0001';
  end if;

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
