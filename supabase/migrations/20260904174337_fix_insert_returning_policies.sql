-- INSERT ... RETURNING must be able to read the row it just wrote. Avoid a
-- helper lookup of that same not-yet-visible row and authorize administrators
-- directly from the row's room/owner columns.

drop policy rooms_select_member on public.rooms;
create policy rooms_select_member on public.rooms
for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.room_members rm
    where rm.room_id = rooms.id and rm.user_id = (select auth.uid())
  )
);

drop policy scenes_select_visible on public.scenes;
create policy scenes_select_visible on public.scenes
for select to authenticated
using (private.is_room_admin(room_id) or private.can_view_scene(id));

drop policy tokens_select_visible on public.tokens;
create policy tokens_select_visible on public.tokens
for select to authenticated
using (private.is_room_admin(room_id) or private.can_view_token(id));
