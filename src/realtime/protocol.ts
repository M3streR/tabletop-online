import { z } from 'zod'

const common = z.object({
  v: z.literal(1),
  eventId: z.string().uuid(),
  roomId: z.string().uuid(),
  sceneId: z.string().uuid(),
  userId: z.string().uuid(),
  sentAt: z.number().int().nonnegative(),
})

export const dragEventSchema = common.extend({
  type: z.literal('token.drag'),
  tokenId: z.string().uuid(),
  leaseId: z.string().uuid(),
  gestureId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  phase: z.enum(['start', 'move', 'end', 'cancel']),
  x: z.number().min(0).max(4096),
  y: z.number().min(0).max(4096),
})

export const pingEventSchema = common.extend({
  type: z.literal('map.ping'),
  x: z.number().finite(),
  y: z.number().finite(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const measureEventSchema = common.extend({
  type: z.literal('map.measure'),
  gestureId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  phase: z.enum(['start', 'move', 'end']),
  startX: z.number().finite(),
  startY: z.number().finite(),
  endX: z.number().finite(),
  endY: z.number().finite(),
})

export const ephemeralEventSchema = z.discriminatedUnion('type', [dragEventSchema, pingEventSchema, measureEventSchema])
export type EphemeralEvent = z.infer<typeof ephemeralEventSchema>

export const presenceSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1).max(48),
  role: z.enum(['owner', 'gm', 'player']),
  onlineAt: z.string().datetime(),
})
export type TabletopPresence = z.infer<typeof presenceSchema>

export function acceptSequence(seen: Map<string, number>, event: EphemeralEvent) {
  const gestureId = 'gestureId' in event ? event.gestureId : event.eventId
  const sequence = 'sequence' in event ? event.sequence : 0
  const key = `${event.userId}:${gestureId}`
  const previous = seen.get(key) ?? -1
  if (sequence <= previous) return false
  seen.set(key, sequence)
  return true
}
