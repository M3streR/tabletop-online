-- Narrow mutable columns: a GM cannot turn a player invite into a GM invite,
-- or move membership/asset identity between rooms.
revoke update on public.room_invites from authenticated;
grant update (revoked_at) on public.room_invites to authenticated;
revoke update on public.room_members from authenticated;
grant update (role) on public.room_members to authenticated;
revoke update on public.media_assets from authenticated;
grant update (status) on public.media_assets to authenticated;

create or replace function public.acquire_token_lease(p_token_id uuid)
returns table(lease_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.can_control_token(p_token_id) then
    raise exception 'TOKEN_CONTROL_FORBIDDEN';
  end if;
  return query
  insert into public.token_leases as existing(token_id, user_id, lease_id, expires_at)
  values (p_token_id, v_uid, gen_random_uuid(), clock_timestamp() + interval '10 seconds')
  on conflict (token_id) do update set user_id = excluded.user_id,
    lease_id = excluded.lease_id, expires_at = excluded.expires_at, created_at = now()
  where existing.expires_at <= clock_timestamp()
  returning existing.lease_id, existing.expires_at;
  if not found then raise exception 'TOKEN_BUSY'; end if;
end;
$$;

create or replace function public.renew_token_lease(p_token_id uuid, p_lease_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_expires timestamptz;
begin
  if not private.can_control_token(p_token_id) then raise exception 'TOKEN_CONTROL_FORBIDDEN'; end if;
  update public.token_leases set expires_at = clock_timestamp() + interval '10 seconds'
  where token_id = p_token_id and lease_id = p_lease_id
    and user_id = (select auth.uid()) and expires_at > clock_timestamp()
  returning expires_at into v_expires;
  if v_expires is null then raise exception 'LEASE_LOST'; end if;
  return v_expires;
end;
$$;

-- Read once per remote gesture. Never expose the lease table directly.
create or replace function public.inspect_token_lease(p_token_id uuid)
returns table(user_id uuid, lease_id uuid, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.user_id, l.lease_id, l.expires_at from public.token_leases l
  where l.token_id = p_token_id and l.expires_at > now()
    and private.can_view_token(p_token_id);
$$;
revoke all on function public.inspect_token_lease(uuid) from public, anon;
grant execute on function public.inspect_token_lease(uuid) to authenticated;

create or replace function public.commit_token_move(p_token_id uuid, p_lease_id uuid,
  p_expected_revision bigint, p_x double precision, p_y double precision)
returns public.token_transforms language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_lease public.token_leases;
  v_token public.tokens; v_scene public.scenes; v_result public.token_transforms;
begin
  select * into v_lease from public.token_leases where token_id = p_token_id for update;
  if not found or v_lease.lease_id <> p_lease_id or v_lease.user_id <> v_uid
    or v_lease.expires_at <= clock_timestamp() then raise exception 'LEASE_LOST'; end if;
  if v_uid is null or not private.can_control_token(p_token_id) then raise exception 'TOKEN_CONTROL_FORBIDDEN'; end if;
  select * into v_token from public.tokens where id = p_token_id;
  select * into v_scene from public.scenes where id = v_token.scene_id;
  if p_x is null or p_y is null or p_x < 0 or p_y < 0
    or p_x > v_scene.world_width or p_y > v_scene.world_height then raise exception 'POSITION_OUT_OF_BOUNDS'; end if;
  update public.token_transforms set x_world = p_x, y_world = p_y,
    revision = revision + 1, updated_by = v_uid, updated_at = now()
  where token_id = p_token_id and revision = p_expected_revision returning * into v_result;
  if not found then raise exception 'STALE_POSITION'; end if;
  delete from public.token_leases where token_id = p_token_id and lease_id = p_lease_id;
  return v_result;
end;
$$;
