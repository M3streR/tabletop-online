import type { Database } from '../data/database.types'

export type Room = Database['public']['Tables']['rooms']['Row']
export type RoomMember = Database['public']['Tables']['room_members']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Scene = Database['public']['Tables']['scenes']['Row']
export type MediaAsset = Database['public']['Tables']['media_assets']['Row']
export type Token = Database['public']['Tables']['tokens']['Row']
export type TokenTransform = Database['public']['Tables']['token_transforms']['Row']
export type TokenGrant = Database['public']['Tables']['token_control_grants']['Row']
export type RoomRole = 'owner' | 'gm' | 'player'

export type RoomParticipant = {
  userId: string
  displayName: string
  role: RoomRole
}

export type AssetWithUrl = MediaAsset & { signedUrl: string | null }

export type TabletopToken = Token & {
  transform: TokenTransform
  imageUrl: string | null
  controllers: string[]
}

export type RoomSnapshot = {
  room: Room
  role: RoomRole
  state: Database['public']['Tables']['room_state']['Row']
  scenes: Scene[]
  assets: AssetWithUrl[]
  tokens: TabletopToken[]
  participants: RoomParticipant[]
}

export function isRoomAdmin(role: RoomRole) {
  return role === 'owner' || role === 'gm'
}

export function canControlToken(token: TabletopToken, role: RoomRole, userId: string) {
  return !token.locked && (isRoomAdmin(role) || token.controllers.includes(userId))
}
