import { createInviteSecret, sha256Hex } from '../core/crypto'
import type { AssetWithUrl, RoomParticipant, RoomRole, RoomSnapshot, Scene, TabletopToken } from '../domain/tabletop'
import { supabase } from './supabase'
import { validateImage } from '../rendering/safeImage'

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'] as const
type AssetKind = 'map' | 'token'

export type ImageInfo = { width: number; height: number; mimeType: (typeof imageTypes)[number]; bytes: number }

export async function inspectImage(file: File, kind: AssetKind): Promise<ImageInfo> {
  await validateImage(file, kind)
  if (!imageTypes.includes(file.type as ImageInfo['mimeType'])) throw new Error('Use uma imagem PNG, JPEG ou WebP.')
  const maxBytes = kind === 'map' ? 20 * 1024 * 1024 : 5 * 1024 * 1024
  if (file.size <= 0 || file.size > maxBytes) throw new Error(kind === 'map' ? 'O mapa deve ter no máximo 20 MB.' : 'A imagem do token deve ter no máximo 5 MB.')
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()
  const maxSide = kind === 'map' ? 4096 : 2048
  const maxPixels = kind === 'map' ? 16_777_216 : 4_194_304
  if (width > maxSide || height > maxSide || width * height > maxPixels) {
    throw new Error(kind === 'map' ? 'O mapa excede 4096 × 4096 ou 16 megapixels.' : 'A imagem do token excede 2048 × 2048 ou 4 megapixels.')
  }
  return { width, height, mimeType: file.type as ImageInfo['mimeType'], bytes: file.size }
}

function fileExtension(mime: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

const signedUrls = new Map<string, { url: string; expires: number }>()
async function signedUrl(bucket: string, path: string) {
  const key = `${bucket}/${path}`
  const cached = signedUrls.get(key)
  if (cached && cached.expires > Date.now()) return cached.url
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
  if (error) return null
  signedUrls.set(key, { url: data.signedUrl, expires: Date.now() + 45 * 60 * 1000 })
  if (signedUrls.size > 512) signedUrls.delete(signedUrls.keys().next().value!)
  return data.signedUrl
}

export async function uploadAsset(roomId: string, file: File, kind: AssetKind) {
  const info = await inspectImage(file, kind)
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('AUTH_REQUIRED')
  const assetId = crypto.randomUUID()
  const bucket = kind === 'map' ? 'room-maps' : 'room-tokens'
  const path = `${roomId}/${assetId}/${crypto.randomUUID()}.${fileExtension(info.mimeType)}`
  const { data: asset, error: rowError } = await supabase.from('media_assets').insert({
    id: assetId,
    room_id: roomId,
    kind,
    bucket_id: bucket,
    object_path: path,
    original_name: file.name.slice(0, 255) || `${kind}.${fileExtension(info.mimeType)}`,
    mime_type: info.mimeType,
    byte_size: info.bytes,
    width_px: info.width,
    height_px: info.height,
    created_by: auth.user.id,
  }).select().single()
  if (rowError) throw rowError

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: info.mimeType,
    upsert: false,
    cacheControl: '3600',
  })
  if (uploadError) {
    await supabase.from('media_assets').update({ status: 'failed' }).eq('id', assetId)
    throw uploadError
  }

  const { data: ready, error: readyError } = await supabase.from('media_assets').update({ status: 'ready' }).eq('id', assetId).select().single()
  if (readyError) throw readyError
  return { ...ready, signedUrl: await signedUrl(bucket, path), asset }
}

async function loadAssets(roomId: string) {
  const { data, error } = await supabase.from('media_assets').select('*').eq('room_id', roomId).eq('status', 'ready')
  if (error) throw error
  return Promise.all(data.map(async (asset) => ({ ...asset, signedUrl: await signedUrl(asset.bucket_id, asset.object_path) })))
}

export async function getRoomSnapshot(roomId: string, userId: string): Promise<RoomSnapshot> {
  const [roomResult, stateResult, scenesResult, tokensResult, transformsResult, grantsResult, membersResult, assets] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('room_state').select('*').eq('room_id', roomId).single(),
    supabase.from('scenes').select('*').eq('room_id', roomId).order('created_at'),
    supabase.from('tokens').select('*').eq('room_id', roomId).order('z_index'),
    supabase.from('token_transforms').select('*').eq('room_id', roomId),
    supabase.from('token_control_grants').select('*').eq('room_id', roomId),
    supabase.from('room_members').select('*').eq('room_id', roomId),
    loadAssets(roomId),
  ])
  const firstError = [roomResult, stateResult, scenesResult, tokensResult, transformsResult, grantsResult, membersResult].find((result) => result.error)?.error
  if (firstError) throw firstError
  const room = roomResult.data!
  const members = membersResult.data!
  const profileIds = Array.from(new Set([room.owner_id, ...members.map((member) => member.user_id)]))
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', profileIds)
  if (profilesError) throw profilesError
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const participants: RoomParticipant[] = [
    { userId: room.owner_id, displayName: profileMap.get(room.owner_id)?.display_name ?? 'Mestre', role: 'owner' },
    ...members.map((member) => ({
      userId: member.user_id,
      displayName: profileMap.get(member.user_id)?.display_name ?? 'Jogador',
      role: member.role as RoomRole,
    })),
  ]
  const role: RoomRole = room.owner_id === userId ? 'owner' : (members.find((member) => member.user_id === userId)?.role as RoomRole)
  if (!role) throw new Error('Você não faz mais parte desta sala.')
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const transformMap = new Map(transformsResult.data!.map((transform) => [transform.token_id, transform]))
  const controllers = grantsResult.data!.reduce<Map<string, string[]>>((map, grant) => {
    map.set(grant.token_id, [...(map.get(grant.token_id) ?? []), grant.user_id])
    return map
  }, new Map())
  const tokens: TabletopToken[] = tokensResult.data!.flatMap((token) => {
    const transform = transformMap.get(token.id)
    if (!transform) return []
    return [{ ...token, transform, imageUrl: token.image_asset_id ? assetMap.get(token.image_asset_id)?.signedUrl ?? null : null, controllers: controllers.get(token.id) ?? [] }]
  })
  return { room, state: stateResult.data!, scenes: scenesResult.data!, assets, tokens, participants, role }
}

export async function createInvite(roomId: string, role: 'gm' | 'player' = 'player') {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('AUTH_REQUIRED')
  const secret = createInviteSecret()
  const tokenHash = await sha256Hex(secret)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('room_invites').insert({ room_id: roomId, token_hash: tokenHash, role, expires_at: expiresAt, created_by: auth.user.id })
  if (error) throw error
  return { secret, expiresAt }
}

export async function revokeRoomInvites(roomId: string) {
  const { error } = await supabase.from('room_invites').update({ revoked_at: new Date().toISOString() }).eq('room_id', roomId).is('revoked_at', null)
  if (error) throw error
}

export async function acceptInvite(secret: string) {
  const { data, error } = await supabase.rpc('accept_room_invite', { p_token_hash: await sha256Hex(secret) })
  if (error) throw error
  return data
}

export async function createScene(roomId: string, name: string, map: File) {
  const uploaded = await uploadAsset(roomId, map, 'map')
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('AUTH_REQUIRED')
  const { data: scene, error } = await supabase.from('scenes').insert({
    room_id: roomId,
    name: name.trim(),
    background_asset_id: uploaded.id,
    world_width: uploaded.width_px,
    world_height: uploaded.height_px,
    created_by: auth.user.id,
  }).select().single()
  if (error) throw error
  return scene
}

export async function setActiveScene(roomId: string, sceneId: string | null) {
  const { error } = await supabase.from('room_state').update({ active_scene_id: sceneId }).eq('room_id', roomId)
  if (error) throw error
}

export async function updateScene(sceneId: string, changes: Partial<Pick<Scene, 'name' | 'grid_enabled' | 'grid_cell_size' | 'grid_offset_x' | 'grid_offset_y' | 'grid_opacity' | 'snap_enabled'>>) {
  const { error } = await supabase.from('scenes').update(changes).eq('id', sceneId)
  if (error) throw error
}

export async function createToken(input: { roomId: string; sceneId: string; name: string; x: number; y: number; size: number; color: string; image?: File | null }) {
  const imageAsset = input.image ? await uploadAsset(input.roomId, input.image, 'token') : null
  const { data, error } = await supabase.rpc('create_token', {
    p_room_id: input.roomId,
    p_scene_id: input.sceneId,
    p_name: input.name,
    p_x: input.x,
    p_y: input.y,
    p_width: input.size,
    p_height: input.size,
    p_color: input.color,
    p_image_asset_id: imageAsset?.id,
  })
  if (error) throw error
  return data
}

export async function updateToken(tokenId: string, changes: { name?: string; width_world?: number; height_world?: number; color?: string; locked?: boolean; visibility?: string }) {
  const { error } = await supabase.from('tokens').update(changes).eq('id', tokenId)
  if (error) throw error
}

export async function deleteToken(tokenId: string) {
  const { error } = await supabase.from('tokens').delete().eq('id', tokenId)
  if (error) throw error
}

export async function setTokenGrant(token: TabletopToken, userId: string, granted: boolean) {
  if (granted) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('AUTH_REQUIRED')
    const { error } = await supabase.from('token_control_grants').insert({ token_id: token.id, room_id: token.room_id, scene_id: token.scene_id, user_id: userId, granted_by: auth.user.id })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase.from('token_control_grants').delete().eq('token_id', token.id).eq('user_id', userId)
    if (error) throw error
  }
}

export async function acquireTokenLease(tokenId: string) {
  const { data, error } = await supabase.rpc('acquire_token_lease', { p_token_id: tokenId })
  if (error) throw error
  return data[0]
}

export async function renewTokenLease(tokenId: string, leaseId: string) {
  const { data, error } = await supabase.rpc('renew_token_lease', { p_token_id: tokenId, p_lease_id: leaseId })
  if (error) throw error
  return data
}

export async function releaseTokenLease(tokenId: string, leaseId: string) {
  const { error } = await supabase.rpc('release_token_lease', { p_token_id: tokenId, p_lease_id: leaseId })
  if (error) throw error
}

export async function commitTokenMove(tokenId: string, leaseId: string, expectedRevision: number, x: number, y: number) {
  const { data, error } = await supabase.rpc('commit_token_move', { p_token_id: tokenId, p_lease_id: leaseId, p_expected_revision: expectedRevision, p_x: x, p_y: y })
  if (error) throw error
  return data
}

export async function leaveRoom(roomId: string, userId: string) {
  const { error } = await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', userId)
  if (error) throw error
}

export async function deleteRoom(roomId: string) {
  const { data: auth } = await supabase.auth.getUser()
  const { data: room, error: roomError } = await supabase.from('rooms').select('owner_id').eq('id', roomId).single()
  if (roomError) throw roomError
  if (room.owner_id !== auth.user?.id) throw new Error('FORBIDDEN')
  const { data: assets, error: assetError } = await supabase.from('media_assets').select('bucket_id, object_path').eq('room_id', roomId)
  if (assetError) throw assetError
  for (const bucket of ['room-maps', 'room-tokens']) {
    const paths = assets.filter((asset) => asset.bucket_id === bucket).map((asset) => asset.object_path)
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from(bucket).remove(paths)
      if (storageError) throw storageError
    }
  }
  const { error } = await supabase.from('rooms').delete().eq('id', roomId)
  if (error) throw error
}

export async function renameRoom(roomId: string, name: string) {
  const { error } = await supabase.from('rooms').update({ name: name.trim() }).eq('id', roomId)
  if (error) throw error
}

export function activeScene(snapshot: RoomSnapshot): Scene | null {
  return snapshot.scenes.find((scene) => scene.id === snapshot.state.active_scene_id) ?? null
}

export function sceneTokens(snapshot: RoomSnapshot, sceneId: string): TabletopToken[] {
  return snapshot.tokens.filter((token) => token.scene_id === sceneId)
}

export function assetForScene(snapshot: RoomSnapshot, scene: Scene): AssetWithUrl | null {
  return snapshot.assets.find((asset) => asset.id === scene.background_asset_id) ?? null
}
