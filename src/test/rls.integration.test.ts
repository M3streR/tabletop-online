import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../data/database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const credentials = {
  owner: { email: import.meta.env.E2E_OWNER_EMAIL, password: import.meta.env.E2E_OWNER_PASSWORD },
  player: { email: import.meta.env.E2E_PLAYER_EMAIL, password: import.meta.env.E2E_PLAYER_PASSWORD },
  external: { email: import.meta.env.E2E_EXTERNAL_EMAIL, password: import.meta.env.E2E_EXTERNAL_PASSWORD },
}
const enabled = Boolean(url && key && Object.values(credentials).every((entry) => entry.email && entry.password))

function client() {
  return createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, storageKey: crypto.randomUUID() } })
}

describe.skipIf(!enabled)('Supabase RLS and atomic multiplayer operations', () => {
  let owner: SupabaseClient<Database>
  let player: SupabaseClient<Database>
  let external: SupabaseClient<Database>
  let roomId = ''
  let sceneId = ''
  let tokenId = ''
  let deniedTokenId = ''
  let objectPath = ''

  beforeAll(async () => {
    owner = client(); player = client(); external = client()
    for (const [name, current] of Object.entries({ owner, player, external })) {
      const auth = await current.auth.signInWithPassword(credentials[name as keyof typeof credentials] as { email: string; password: string })
      expect(auth.error, name).toBeNull()
    }
  })

  afterAll(async () => {
    if (objectPath) await owner.storage.from('room-maps').remove([objectPath])
    if (roomId) await owner.from('rooms').delete().eq('id', roomId)
    await Promise.all([owner.auth.signOut(), player.auth.signOut(), external.auth.signOut()])
  })

  it('accepts a hashed invitation atomically and hides the room from outsiders', async () => {
    const created = await owner.rpc('create_room', { p_name: `RLS ${Date.now()}` })
    expect(created.error).toBeNull()
    roomId = created.data!.id
    const rawToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken))), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const ownerUser = (await owner.auth.getUser()).data.user!
    expect((await owner.from('room_invites').insert({ room_id: roomId, token_hash: tokenHash, role: 'player', expires_at: new Date(Date.now() + 60_000).toISOString(), created_by: ownerUser.id })).error).toBeNull()
    expect((await external.rpc('accept_room_invite', { p_token_hash: '0'.repeat(64) })).error?.message).toContain('INVITE_UNAVAILABLE')
    const accepted = await player.rpc('accept_room_invite', { p_token_hash: tokenHash })
    expect(accepted.error).toBeNull()
    expect(accepted.data).toBe(roomId)
    expect((await owner.from('room_invites').select('use_count').eq('token_hash', tokenHash).single()).data?.use_count).toBe(1)
    expect((await player.from('rooms').select('id').eq('id', roomId)).data).toHaveLength(1)
    expect((await external.from('rooms').select('id').eq('id', roomId)).data).toHaveLength(0)
  })

  it('protects the private map while allowing the active scene to members', async () => {
    const ownerUser = (await owner.auth.getUser()).data.user!
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (char) => char.charCodeAt(0))
    const assetId = crypto.randomUUID()
    objectPath = `${roomId}/${assetId}/${crypto.randomUUID()}.png`
    expect((await owner.from('media_assets').insert({ id: assetId, room_id: roomId, kind: 'map', bucket_id: 'room-maps', object_path: objectPath, original_name: 'map.png', mime_type: 'image/png', byte_size: png.byteLength, width_px: 1, height_px: 1, created_by: ownerUser.id })).error).toBeNull()
    expect((await owner.storage.from('room-maps').upload(objectPath, png, { contentType: 'image/png' })).error).toBeNull()
    expect((await owner.from('media_assets').update({ status: 'ready' }).eq('id', assetId)).error).toBeNull()
    const scene = await owner.from('scenes').insert({ room_id: roomId, name: 'Mapa de teste', background_asset_id: assetId, world_width: 1000, world_height: 800, created_by: ownerUser.id }).select().single()
    expect(scene.error).toBeNull()
    sceneId = scene.data!.id
    expect((await owner.from('room_state').update({ active_scene_id: sceneId }).eq('room_id', roomId)).error).toBeNull()
    expect((await player.from('scenes').select('id').eq('id', sceneId)).data).toHaveLength(1)
    expect((await player.storage.from('room-maps').createSignedUrl(objectPath, 60)).error).toBeNull()
    expect((await external.storage.from('room-maps').createSignedUrl(objectPath, 60)).error).not.toBeNull()
    expect((await player.from('scenes').insert({ room_id: roomId, name: 'Proibida', world_width: 10, world_height: 10, created_by: (await player.auth.getUser()).data.user!.id })).error).not.toBeNull()
  })

  it('enforces grants, leases, conflicts, expiry and durable final position', async () => {
    const created = await owner.rpc('create_token', { p_room_id: roomId, p_scene_id: sceneId, p_name: 'Heroína', p_x: 350, p_y: 280, p_width: 70, p_height: 70, p_color: '#64dfd2' })
    expect(created.error).toBeNull()
    tokenId = created.data!.id
    const denied = await owner.rpc('create_token', { p_room_id: roomId, p_scene_id: sceneId, p_name: 'Sem controle', p_x: 140, p_y: 140, p_width: 70, p_height: 70, p_color: '#f2bd68' })
    deniedTokenId = denied.data!.id
    const playerUser = (await player.auth.getUser()).data.user!
    expect((await owner.from('token_control_grants').insert({ token_id: tokenId, room_id: roomId, scene_id: sceneId, user_id: playerUser.id, granted_by: (await owner.auth.getUser()).data.user!.id })).error).toBeNull()
    expect((await player.rpc('acquire_token_lease', { p_token_id: deniedTokenId })).error?.message).toContain('TOKEN_CONTROL_FORBIDDEN')
    await player.from('tokens').update({ name: 'Hack' }).eq('id', tokenId)
    expect((await owner.from('tokens').select('name').eq('id', tokenId).single()).data?.name).toBe('Heroína')
    const lease = await player.rpc('acquire_token_lease', { p_token_id: tokenId })
    expect(lease.error).toBeNull()
    expect((await player.rpc('acquire_token_lease', { p_token_id: tokenId })).error?.message).toContain('TOKEN_BUSY')
    expect((await owner.rpc('acquire_token_lease', { p_token_id: tokenId })).error?.message).toContain('TOKEN_BUSY')
    const current = await player.from('token_transforms').select('revision').eq('token_id', tokenId).single()
    const committed = await player.rpc('commit_token_move', { p_token_id: tokenId, p_lease_id: lease.data![0].lease_id, p_expected_revision: current.data!.revision, p_x: 490, p_y: 420 })
    expect(committed.error).toBeNull()
    expect(committed.data?.x_world).toBe(490)
    const persisted = await owner.from('token_transforms').select('x_world,y_world').eq('token_id', tokenId).single()
    expect(persisted.data).toEqual({ x_world: 490, y_world: 420 })
    const expiring = await player.rpc('acquire_token_lease', { p_token_id: tokenId })
    expect(expiring.error).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 10_500))
    expect((await owner.rpc('acquire_token_lease', { p_token_id: tokenId })).error).toBeNull()
  }, 20_000)

  it('does not expose hidden token state to the outsider', async () => {
    expect((await external.from('tokens').select('*').eq('room_id', roomId)).data).toHaveLength(0)
    expect((await external.from('token_transforms').select('*').eq('room_id', roomId)).data).toHaveLength(0)
    expect((await player.from('token_control_grants').select('*').eq('token_id', deniedTokenId)).data).toHaveLength(0)
  })

  it('hides inactive scenes and GM-only tokens and rejects direct lease writes', async () => {
    const ownerId = (await owner.auth.getUser()).data.user!.id
    const hiddenScene = await owner.from('scenes').insert({ room_id: roomId, name: 'Oculta', world_width: 800, world_height: 800, created_by: ownerId }).select().single()
    expect(hiddenScene.error).toBeNull()
    expect((await player.from('scenes').select('*').eq('id', hiddenScene.data!.id)).data).toHaveLength(0)
    expect((await owner.from('tokens').update({ visibility: 'gm_only' }).eq('id', deniedTokenId)).error).toBeNull()
    expect((await player.from('tokens').select('*').eq('id', deniedTokenId)).data).toHaveLength(0)
    expect((await player.from('token_transforms').select('*').eq('token_id', deniedTokenId)).data).toHaveLength(0)
    expect((await external.rpc('inspect_token_lease', { p_token_id: tokenId })).data).toHaveLength(0)
    expect((await player.from('token_leases').select('*')).error?.code).toBe('42501')
    expect((await player.from('token_leases').insert({ token_id: deniedTokenId, user_id: (await player.auth.getUser()).data.user!.id, lease_id: crypto.randomUUID(), expires_at: new Date(Date.now() + 10000).toISOString() })).error?.code).toBe('42501')
  })

  it('revoked control prevents renewal and commit, even with an existing lease', async () => {
    const token = await owner.rpc('create_token', { p_room_id: roomId, p_scene_id: sceneId, p_name: 'Revogável', p_x: 100, p_y: 100, p_width: 70, p_height: 70, p_color: '#64dfd2' })
    expect(token.error).toBeNull()
    const id = token.data!.id
    const playerId = (await player.auth.getUser()).data.user!.id
    expect((await owner.from('token_control_grants').insert({ token_id: id, room_id: roomId, scene_id: sceneId, user_id: playerId, granted_by: (await owner.auth.getUser()).data.user!.id })).error).toBeNull()
    const lease = await player.rpc('acquire_token_lease', { p_token_id: id })
    expect(lease.error).toBeNull()
    expect((await owner.from('token_control_grants').delete().eq('token_id', id)).error).toBeNull()
    expect((await player.rpc('renew_token_lease', { p_token_id: id, p_lease_id: lease.data![0].lease_id })).error?.message).toContain('TOKEN_CONTROL_FORBIDDEN')
    expect((await player.rpc('commit_token_move', { p_token_id: id, p_lease_id: lease.data![0].lease_id, p_expected_revision: 1, p_x: 200, p_y: 200 })).error?.message).toContain('TOKEN_CONTROL_FORBIDDEN')
    expect((await owner.from('tokens').delete().eq('id', id)).error).toBeNull()
    expect((await player.rpc('commit_token_move', { p_token_id: id, p_lease_id: lease.data![0].lease_id, p_expected_revision: 1, p_x: 200, p_y: 200 })).error?.message).toContain('LEASE_LOST')
  })

  it('admits members but denies outsiders to the private Broadcast channel', async () => {
    const topic = (await owner.from('rooms').select('realtime_topic').eq('id', roomId).single()).data!.realtime_topic
    const join = async (current: SupabaseClient<Database>) => {
      await current.realtime.setAuth((await current.auth.getSession()).data.session!.access_token)
      const channel = current.channel(topic, { config: { private: true } })
      channel.on('broadcast', { event: 'ephemeral' }, () => undefined)
      try {
        return await new Promise<string>((resolve) => {
          const timer = setTimeout(() => resolve('TEST_TIMEOUT'), 15000)
          channel.subscribe((status) => {
            if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); resolve(status) }
          })
        })
      } finally { await current.removeChannel(channel) }
    }
    expect(await join(player)).toBe('SUBSCRIBED')
    expect(await join(external)).toBe('CHANNEL_ERROR')
  }, 35000)

  it('GM can manage a scene but cannot promote members, rewrite invites or delete the room', async () => {
    const gmId = (await external.auth.getUser()).data.user!.id
    expect((await owner.from('room_members').insert({ room_id: roomId, user_id: gmId, role: 'gm' })).error).toBeNull()
    const scene = await external.from('scenes').insert({ room_id: roomId, name: 'GM scene', world_width: 800, world_height: 800, created_by: gmId }).select().single()
    expect(scene.error).toBeNull()
    const playerId = (await player.auth.getUser()).data.user!.id
    await external.from('room_members').update({ role: 'gm' }).eq('room_id', roomId).eq('user_id', playerId)
    expect((await owner.from('room_members').select('role').eq('room_id', roomId).eq('user_id', playerId).single()).data?.role).toBe('player')
    expect((await external.from('room_invites').update({ role: 'gm' }).eq('room_id', roomId)).error?.code).toBe('42501')
    await external.from('rooms').delete().eq('id', roomId)
    expect((await owner.from('rooms').select('id').eq('id', roomId)).data).toHaveLength(1)
  })
})
