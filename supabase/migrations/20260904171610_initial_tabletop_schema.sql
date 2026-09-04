-- Tabletop Online: first playable vertical slice.
-- PostgreSQL is authoritative; Broadcast is used only for ephemeral interaction.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 48),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  realtime_topic text not null unique default ('room:' || gen_random_uuid()::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('gm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user_room_idx on public.room_members(user_id, room_id);

create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  role text not null default 'player' check (role in ('gm', 'player')),
  expires_at timestamptz not null,
  max_uses integer not null default 20 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index room_invites_active_hash_idx
  on public.room_invites(token_hash)
  where revoked_at is null;
create index room_invites_room_idx on public.room_invites(room_id);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  kind text not null check (kind in ('map', 'token')),
  bucket_id text not null check (bucket_id in ('room-maps', 'room-tokens')),
  object_path text not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size > 0),
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'failed')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  unique (id, room_id),
  check (object_path like room_id::text || '/' || id::text || '/%'),
  check (
    (kind = 'map' and bucket_id = 'room-maps' and byte_size <= 20971520 and width_px <= 4096 and height_px <= 4096 and width_px::bigint * height_px::bigint <= 16777216)
    or
    (kind = 'token' and bucket_id = 'room-tokens' and byte_size <= 5242880 and width_px <= 2048 and height_px <= 2048 and width_px::bigint * height_px::bigint <= 4194304)
  )
);

create index media_assets_room_idx on public.media_assets(room_id);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  background_asset_id uuid,
  world_width double precision not null check (world_width between 1 and 4096),
  world_height double precision not null check (world_height between 1 and 4096),
  grid_enabled boolean not null default true,
  grid_cell_size double precision not null default 70 check (grid_cell_size between 8 and 512),
  grid_offset_x double precision not null default 0 check (grid_offset_x between -4096 and 4096),
  grid_offset_y double precision not null default 0 check (grid_offset_y between -4096 and 4096),
  grid_opacity double precision not null default 0.35 check (grid_opacity between 0 and 1),
  snap_enabled boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, room_id),
  constraint scenes_background_asset_fk
    foreign key (background_asset_id, room_id)
    references public.media_assets(id, room_id)
    on delete set null (background_asset_id)
);

create index scenes_room_idx on public.scenes(room_id);

create table public.room_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  active_scene_id uuid,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint room_state_active_scene_fk
    foreign key (active_scene_id, room_id)
    references public.scenes(id, room_id)
    on delete set null (active_scene_id)
);

create table public.tokens (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  scene_id uuid not null,
  image_asset_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  width_world double precision not null check (width_world between 8 and 2048),
  height_world double precision not null check (height_world between 8 and 2048),
  color text not null default '#4fd1c5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  z_index integer not null default 0,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'gm_only')),
  locked boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, room_id, scene_id),
  constraint tokens_scene_fk
    foreign key (scene_id, room_id)
    references public.scenes(id, room_id)
    on delete cascade,
  constraint tokens_image_asset_fk
    foreign key (image_asset_id, room_id)
    references public.media_assets(id, room_id)
    on delete set null (image_asset_id)
);

create index tokens_scene_z_idx on public.tokens(scene_id, z_index, id);
create index tokens_room_idx on public.tokens(room_id);

create table public.token_transforms (
  token_id uuid primary key,
  room_id uuid not null,
  scene_id uuid not null,
  x_world double precision not null check (x_world between 0 and 4096),
  y_world double precision not null check (y_world between 0 and 4096),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint token_transforms_token_fk
    foreign key (token_id, room_id, scene_id)
    references public.tokens(id, room_id, scene_id)
    on delete cascade
);

create index token_transforms_room_scene_idx on public.token_transforms(room_id, scene_id);

create table public.token_control_grants (
  token_id uuid not null,
  room_id uuid not null,
  scene_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (token_id, user_id),
  constraint token_control_grants_token_fk
    foreign key (token_id, room_id, scene_id)
    references public.tokens(id, room_id, scene_id)
    on delete cascade
);

create index token_control_grants_user_idx on public.token_control_grants(user_id, token_id);
create index token_control_grants_room_idx on public.token_control_grants(room_id, scene_id);

create table public.token_leases (
  token_id uuid primary key references public.tokens(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lease_id uuid not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index token_leases_expiry_idx on public.token_leases(expires_at);

-- ---------------------------------------------------------------------------
-- Internal authorization helpers. These deliberately bypass table RLS to avoid
-- recursive policies, but accept no caller-controlled identity.
-- ---------------------------------------------------------------------------

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (
      select 1 from public.rooms r
      where r.id = p_room_id and r.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.room_members rm
      where rm.room_id = p_room_id and rm.user_id = (select auth.uid())
    )
  );
$$;

create or replace function private.is_room_admin(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (
      select 1 from public.rooms r
      where r.id = p_room_id and r.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.room_members rm
      where rm.room_id = p_room_id
        and rm.user_id = (select auth.uid())
        and rm.role = 'gm'
    )
  );
$$;

create or replace function private.can_view_scene(p_scene_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.scenes s
    left join public.room_state rs on rs.room_id = s.room_id
    where s.id = p_scene_id
      and (
        private.is_room_admin(s.room_id)
        or (private.is_room_member(s.room_id) and rs.active_scene_id = s.id)
      )
  );
$$;

create or replace function private.can_view_token(p_token_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tokens t
    where t.id = p_token_id
      and (
        private.is_room_admin(t.room_id)
        or (
          t.visibility = 'everyone'
          and private.is_room_member(t.room_id)
          and private.can_view_scene(t.scene_id)
        )
      )
  );
$$;

create or replace function private.can_control_token(p_token_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tokens t
    where t.id = p_token_id
      and (
        private.is_room_admin(t.room_id)
        or (
          not t.locked
          and t.visibility = 'everyone'
          and private.can_view_scene(t.scene_id)
          and exists (
            select 1 from public.token_control_grants g
            where g.token_id = t.id and g.user_id = (select auth.uid())
          )
        )
      )
  );
$$;

create or replace function private.can_read_asset(p_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_assets a
    where a.id = p_asset_id
      and a.status = 'ready'
      and (
        private.is_room_admin(a.room_id)
        or exists (
          select 1 from public.scenes s
          where s.background_asset_id = a.id and private.can_view_scene(s.id)
        )
        or exists (
          select 1 from public.tokens t
          where t.image_asset_id = a.id and private.can_view_token(t.id)
        )
      )
  );
$$;

create or replace function private.can_read_storage_object(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_assets a
    where a.bucket_id = p_bucket_id
      and a.object_path = p_name
      and private.can_read_asset(a.id)
  );
$$;

create or replace function private.can_write_storage_object(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_assets a
    where a.bucket_id = p_bucket_id
      and a.object_path = p_name
      and a.status = 'uploading'
      and a.created_by = (select auth.uid())
      and private.is_room_admin(a.room_id)
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Utility triggers
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger rooms_set_updated_at before update on public.rooms
for each row execute function private.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets
for each row execute function private.set_updated_at();
create trigger scenes_set_updated_at before update on public.scenes
for each row execute function private.set_updated_at();
create trigger tokens_set_updated_at before update on public.tokens
for each row execute function private.set_updated_at();

create or replace function private.bump_scene_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision = old.revision + 1;
  return new;
end;
$$;

create trigger scenes_bump_revision before update on public.scenes
for each row execute function private.bump_scene_revision();

create or replace function private.bump_token_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision = old.revision + 1;
  return new;
end;
$$;

create trigger tokens_bump_revision before update on public.tokens
for each row execute function private.bump_token_revision();

create or replace function private.protect_room_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id or new.realtime_topic <> old.realtime_topic then
    raise exception 'ROOM_IDENTITY_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger rooms_protect_identity before update on public.rooms
for each row execute function private.protect_room_identity();

create or replace function private.prepare_room_state_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision = old.revision + 1;
  new.updated_by = (select auth.uid());
  new.updated_at = now();
  return new;
end;
$$;

create trigger room_state_prepare_update before update on public.room_state
for each row execute function private.prepare_room_state_update();

create or replace function private.validate_scene_asset()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.background_asset_id is not null and not exists (
    select 1 from public.media_assets a
    where a.id = new.background_asset_id
      and a.room_id = new.room_id
      and a.kind = 'map'
      and a.status = 'ready'
  ) then
    raise exception 'INVALID_MAP_ASSET' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger scenes_validate_asset before insert or update on public.scenes
for each row execute function private.validate_scene_asset();

create or replace function private.validate_token_asset()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.image_asset_id is not null and not exists (
    select 1 from public.media_assets a
    where a.id = new.image_asset_id
      and a.room_id = new.room_id
      and a.kind = 'token'
      and a.status = 'ready'
  ) then
    raise exception 'INVALID_TOKEN_ASSET' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tokens_validate_asset before insert or update on public.tokens
for each row execute function private.validate_token_asset();

create or replace function private.validate_token_grant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.rooms r
    where r.id = new.room_id and r.owner_id = new.user_id
  ) and not exists (
    select 1 from public.room_members rm
    where rm.room_id = new.room_id and rm.user_id = new.user_id
  ) then
    raise exception 'GRANTEE_NOT_ROOM_MEMBER' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger token_grants_validate before insert or update on public.token_control_grants
for each row execute function private.validate_token_grant();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Jogador'), '@', 1)), 48);
  insert into public.profiles(id, display_name) values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic public operations
-- ---------------------------------------------------------------------------

create or replace function public.create_room(p_name text)
returns public.rooms
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'INVALID_ROOM_NAME' using errcode = 'P0001';
  end if;

  insert into public.rooms(owner_id, name)
  values ((select auth.uid()), btrim(p_name))
  returning * into v_room;

  insert into public.room_state(room_id, updated_by)
  values (v_room.id, (select auth.uid()));

  return v_room;
end;
$$;

create or replace function public.accept_room_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.room_invites;
  v_uid uuid := (select auth.uid());
  v_inserted integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_INVITE' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.room_invites
  where token_hash = p_token_hash
  for update;

  if not found
    or v_invite.revoked_at is not null
    or v_invite.expires_at <= now()
    or v_invite.use_count >= v_invite.max_uses then
    raise exception 'INVITE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.rooms r where r.id = v_invite.room_id and r.owner_id = v_uid) then
    return v_invite.room_id;
  end if;

  insert into public.room_members(room_id, user_id, role)
  values (v_invite.room_id, v_uid, v_invite.role)
  on conflict (room_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.room_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;

  return v_invite.room_id;
end;
$$;

create or replace function public.create_token(
  p_room_id uuid,
  p_scene_id uuid,
  p_name text,
  p_x double precision,
  p_y double precision,
  p_width double precision,
  p_height double precision,
  p_color text,
  p_image_asset_id uuid default null
)
returns public.tokens
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token public.tokens;
  v_scene_width double precision;
  v_scene_height double precision;
begin
  if not private.is_room_admin(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select world_width, world_height
  into v_scene_width, v_scene_height
  from public.scenes
  where id = p_scene_id and room_id = p_room_id;

  if v_scene_width is null then
    raise exception 'SCENE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_x < 0 or p_y < 0 or p_x > v_scene_width or p_y > v_scene_height then
    raise exception 'POSITION_OUT_OF_BOUNDS' using errcode = 'P0001';
  end if;

  insert into public.tokens(
    room_id, scene_id, image_asset_id, name, width_world, height_world, color, created_by
  ) values (
    p_room_id, p_scene_id, p_image_asset_id, btrim(p_name), p_width, p_height, p_color, (select auth.uid())
  ) returning * into v_token;

  insert into public.token_transforms(token_id, room_id, scene_id, x_world, y_world, updated_by)
  values (v_token.id, p_room_id, p_scene_id, p_x, p_y, (select auth.uid()));

  return v_token;
end;
$$;

create or replace function public.acquire_token_lease(p_token_id uuid)
returns table(lease_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lease uuid := gen_random_uuid();
begin
  if v_uid is null or not private.can_control_token(p_token_id) then
    raise exception 'TOKEN_CONTROL_FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  insert into public.token_leases as current_lease(token_id, user_id, lease_id, expires_at)
  values (p_token_id, v_uid, v_lease, now() + interval '10 seconds')
  on conflict (token_id) do update
    set user_id = excluded.user_id,
        lease_id = excluded.lease_id,
        expires_at = excluded.expires_at,
        created_at = now()
    where current_lease.expires_at <= now() or current_lease.user_id = v_uid
  returning current_lease.lease_id, current_lease.expires_at;

  if not found then
    raise exception 'TOKEN_BUSY' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.renew_token_lease(p_token_id uuid, p_lease_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz;
begin
  update public.token_leases
  set expires_at = now() + interval '10 seconds'
  where token_id = p_token_id
    and lease_id = p_lease_id
    and user_id = (select auth.uid())
    and expires_at > now()
  returning expires_at into v_expires;

  if v_expires is null then
    raise exception 'LEASE_LOST' using errcode = 'P0001';
  end if;
  return v_expires;
end;
$$;

create or replace function public.release_token_lease(p_token_id uuid, p_lease_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.token_leases
  where token_id = p_token_id
    and lease_id = p_lease_id
    and user_id = (select auth.uid());
  return found;
end;
$$;

create or replace function public.commit_token_move(
  p_token_id uuid,
  p_lease_id uuid,
  p_expected_revision bigint,
  p_x double precision,
  p_y double precision
)
returns public.token_transforms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_scene_width double precision;
  v_scene_height double precision;
  v_result public.token_transforms;
begin
  if v_uid is null or not private.can_control_token(p_token_id) then
    raise exception 'TOKEN_CONTROL_FORBIDDEN' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.token_leases l
    where l.token_id = p_token_id
      and l.lease_id = p_lease_id
      and l.user_id = v_uid
      and l.expires_at > now()
  ) then
    raise exception 'LEASE_LOST' using errcode = 'P0001';
  end if;

  select s.world_width, s.world_height
  into v_scene_width, v_scene_height
  from public.tokens t
  join public.scenes s on s.id = t.scene_id
  where t.id = p_token_id;

  if p_x < 0 or p_y < 0 or p_x > v_scene_width or p_y > v_scene_height then
    raise exception 'POSITION_OUT_OF_BOUNDS' using errcode = 'P0001';
  end if;

  update public.token_transforms
  set x_world = p_x,
      y_world = p_y,
      revision = revision + 1,
      updated_by = v_uid,
      updated_at = now()
  where token_id = p_token_id
    and revision = p_expected_revision
  returning * into v_result;

  if v_result.token_id is null then
    raise exception 'STALE_POSITION' using errcode = 'P0001';
  end if;

  delete from public.token_leases where token_id = p_token_id and lease_id = p_lease_id;
  return v_result;
end;
$$;

revoke all on function public.create_room(text) from public, anon;
revoke all on function public.accept_room_invite(text) from public, anon;
revoke all on function public.create_token(uuid, uuid, text, double precision, double precision, double precision, double precision, text, uuid) from public, anon;
revoke all on function public.acquire_token_lease(uuid) from public, anon;
revoke all on function public.renew_token_lease(uuid, uuid) from public, anon;
revoke all on function public.release_token_lease(uuid, uuid) from public, anon;
revoke all on function public.commit_token_move(uuid, uuid, bigint, double precision, double precision) from public, anon;

grant execute on function public.create_room(text) to authenticated;
grant execute on function public.accept_room_invite(text) to authenticated;
grant execute on function public.create_token(uuid, uuid, text, double precision, double precision, double precision, double precision, text, uuid) to authenticated;
grant execute on function public.acquire_token_lease(uuid) to authenticated;
grant execute on function public.renew_token_lease(uuid, uuid) to authenticated;
grant execute on function public.release_token_lease(uuid, uuid) to authenticated;
grant execute on function public.commit_token_move(uuid, uuid, bigint, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Table grants and RLS
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.rooms to authenticated;
grant update (name) on public.rooms to authenticated;
grant select, insert, update, delete on public.room_members to authenticated;
grant select, insert, update, delete on public.room_invites to authenticated;
grant select, insert on public.room_state to authenticated;
grant update (active_scene_id) on public.room_state to authenticated;
grant select, insert, delete on public.scenes to authenticated;
grant update (name, background_asset_id, world_width, world_height, grid_enabled, grid_cell_size, grid_offset_x, grid_offset_y, grid_opacity, snap_enabled) on public.scenes to authenticated;
grant select, insert, update, delete on public.media_assets to authenticated;
grant select, insert, delete on public.tokens to authenticated;
grant update (image_asset_id, name, width_world, height_world, color, z_index, visibility, locked) on public.tokens to authenticated;
grant select, insert on public.token_transforms to authenticated;
grant select, insert, delete on public.token_control_grants to authenticated;
-- token_leases and transform updates are only reachable through guarded RPCs.

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.room_state enable row level security;
alter table public.scenes enable row level security;
alter table public.media_assets enable row level security;
alter table public.tokens enable row level security;
alter table public.token_transforms enable row level security;
alter table public.token_control_grants enable row level security;
alter table public.token_leases enable row level security;

create policy profiles_select_shared on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.rooms r
    where private.is_room_member(r.id)
      and (r.owner_id = profiles.id or exists (
        select 1 from public.room_members rm where rm.room_id = r.id and rm.user_id = profiles.id
      ))
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy rooms_select_member on public.rooms for select to authenticated
using (private.is_room_member(id));
create policy rooms_insert_owner on public.rooms for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy rooms_update_admin on public.rooms for update to authenticated
using (private.is_room_admin(id))
with check (private.is_room_admin(id));
create policy rooms_delete_owner on public.rooms for delete to authenticated
using (owner_id = (select auth.uid()));

create policy room_members_select_member on public.room_members for select to authenticated
using (private.is_room_member(room_id));
create policy room_members_insert_admin on public.room_members for insert to authenticated
with check (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid()))
  or (private.is_room_admin(room_id) and role = 'player')
);
create policy room_members_update_owner on public.room_members for update to authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid())))
with check (exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid())));
create policy room_members_delete_admin_or_self on public.room_members for delete to authenticated
using (private.is_room_admin(room_id) or user_id = (select auth.uid()));

create policy room_invites_select_admin on public.room_invites for select to authenticated
using (private.is_room_admin(room_id));
create policy room_invites_insert_admin on public.room_invites for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = (select auth.uid()))
    or (private.is_room_admin(room_id) and role = 'player')
  )
);
create policy room_invites_update_admin on public.room_invites for update to authenticated
using (private.is_room_admin(room_id)) with check (private.is_room_admin(room_id));
create policy room_invites_delete_admin on public.room_invites for delete to authenticated
using (private.is_room_admin(room_id));

create policy room_state_select_member on public.room_state for select to authenticated
using (private.is_room_member(room_id));
create policy room_state_insert_admin on public.room_state for insert to authenticated
with check (private.is_room_admin(room_id) and updated_by = (select auth.uid()));
create policy room_state_update_admin on public.room_state for update to authenticated
using (private.is_room_admin(room_id))
with check (private.is_room_admin(room_id) and updated_by = (select auth.uid()));

create policy scenes_select_visible on public.scenes for select to authenticated
using (private.can_view_scene(id));
create policy scenes_insert_admin on public.scenes for insert to authenticated
with check (private.is_room_admin(room_id) and created_by = (select auth.uid()));
create policy scenes_update_admin on public.scenes for update to authenticated
using (private.is_room_admin(room_id)) with check (private.is_room_admin(room_id));
create policy scenes_delete_admin on public.scenes for delete to authenticated
using (private.is_room_admin(room_id));

create policy media_assets_select_visible on public.media_assets for select to authenticated
using (private.is_room_admin(room_id) or private.can_read_asset(id));
create policy media_assets_insert_admin on public.media_assets for insert to authenticated
with check (private.is_room_admin(room_id) and created_by = (select auth.uid()));
create policy media_assets_update_admin on public.media_assets for update to authenticated
using (private.is_room_admin(room_id))
with check (private.is_room_admin(room_id) and created_by = (select auth.uid()));
create policy media_assets_delete_admin on public.media_assets for delete to authenticated
using (private.is_room_admin(room_id));

create policy tokens_select_visible on public.tokens for select to authenticated
using (private.can_view_token(id));
create policy tokens_insert_admin on public.tokens for insert to authenticated
with check (private.is_room_admin(room_id) and created_by = (select auth.uid()));
create policy tokens_update_admin on public.tokens for update to authenticated
using (private.is_room_admin(room_id)) with check (private.is_room_admin(room_id));
create policy tokens_delete_admin on public.tokens for delete to authenticated
using (private.is_room_admin(room_id));

create policy token_transforms_select_visible on public.token_transforms for select to authenticated
using (private.can_view_token(token_id));
create policy token_transforms_insert_admin on public.token_transforms for insert to authenticated
with check (private.is_room_admin(room_id) and updated_by = (select auth.uid()));

create policy token_grants_select_visible on public.token_control_grants for select to authenticated
using (private.is_room_admin(room_id) or user_id = (select auth.uid()));
create policy token_grants_insert_admin on public.token_control_grants for insert to authenticated
with check (private.is_room_admin(room_id) and granted_by = (select auth.uid()));
create policy token_grants_delete_admin on public.token_control_grants for delete to authenticated
using (private.is_room_admin(room_id));

-- No direct token_leases policies: guarded SECURITY DEFINER functions are the API.

-- ---------------------------------------------------------------------------
-- Private Storage buckets and object policies
-- ---------------------------------------------------------------------------

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('room-maps', 'room-maps', false, 20971520, array['image/png', 'image/jpeg', 'image/webp']),
  ('room-tokens', 'room-tokens', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_objects_select_visible
on storage.objects for select to authenticated
using (
  bucket_id in ('room-maps', 'room-tokens')
  and private.can_read_storage_object(bucket_id, name)
);

create policy storage_objects_insert_admin
on storage.objects for insert to authenticated
with check (
  bucket_id in ('room-maps', 'room-tokens')
  and private.can_write_storage_object(bucket_id, name)
);

create policy storage_objects_delete_admin
on storage.objects for delete to authenticated
using (
  bucket_id in ('room-maps', 'room-tokens')
  and exists (
    select 1 from public.media_assets a
    where a.bucket_id = storage.objects.bucket_id
      and a.object_path = storage.objects.name
      and private.is_room_admin(a.room_id)
  )
);

-- ---------------------------------------------------------------------------
-- Realtime: private room topics for Broadcast + Presence. Durable tables use
-- low-frequency Postgres Changes; no pointer movement is written to Postgres.
-- ---------------------------------------------------------------------------

create policy tabletop_realtime_read
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.rooms r
    where r.realtime_topic = (select realtime.topic())
      and private.is_room_member(r.id)
  )
);

create policy tabletop_realtime_write
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1 from public.rooms r
    where r.realtime_topic = (select realtime.topic())
      and private.is_room_member(r.id)
  )
);

alter table public.rooms replica identity full;
alter table public.room_members replica identity full;
alter table public.room_state replica identity full;
alter table public.scenes replica identity full;
alter table public.media_assets replica identity full;
alter table public.tokens replica identity full;
alter table public.token_transforms replica identity full;
alter table public.token_control_grants replica identity full;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_members;
alter publication supabase_realtime add table public.room_state;
alter publication supabase_realtime add table public.scenes;
alter publication supabase_realtime add table public.media_assets;
alter publication supabase_realtime add table public.tokens;
alter publication supabase_realtime add table public.token_transforms;
alter publication supabase_realtime add table public.token_control_grants;
