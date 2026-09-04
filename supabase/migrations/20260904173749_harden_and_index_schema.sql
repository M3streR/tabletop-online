-- Explicitly deny direct lease access and add covering indexes for foreign keys.
-- Lease mutations remain available only through the guarded RPCs.

create policy token_leases_deny_direct
on public.token_leases
for all
to authenticated
using (false)
with check (false);

create index rooms_owner_idx on public.rooms(owner_id);
create index room_invites_created_by_idx on public.room_invites(created_by);
create index media_assets_created_by_idx on public.media_assets(created_by);
create index scenes_background_asset_room_idx on public.scenes(background_asset_id, room_id);
create index scenes_created_by_idx on public.scenes(created_by);
create index room_state_active_scene_room_idx on public.room_state(active_scene_id, room_id);
create index room_state_updated_by_idx on public.room_state(updated_by);
create index tokens_scene_room_idx on public.tokens(scene_id, room_id);
create index tokens_image_asset_room_idx on public.tokens(image_asset_id, room_id);
create index tokens_created_by_idx on public.tokens(created_by);
create index token_transforms_token_room_scene_idx on public.token_transforms(token_id, room_id, scene_id);
create index token_transforms_updated_by_idx on public.token_transforms(updated_by);
create index token_grants_token_room_scene_idx on public.token_control_grants(token_id, room_id, scene_id);
create index token_grants_granted_by_idx on public.token_control_grants(granted_by);
create index token_leases_user_idx on public.token_leases(user_id);
