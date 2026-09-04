import { describe, expect, it } from 'vitest'
import { acceptSequence, dragEventSchema, ephemeralEventSchema } from './protocol'

const base = { v: 1, eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roomId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sceneId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', sentAt: 1 }

describe('realtime protocol v1', () => {
  it('rejects malformed and unknown messages', () => {
    expect(ephemeralEventSchema.safeParse({ ...base, type: 'token.teleport' }).success).toBe(false)
    expect(ephemeralEventSchema.safeParse({ ...base, type: 'map.ping', x: 'x', y: 2, color: '#64dfd2' }).success).toBe(false)
  })

  it('ignores old or duplicate gesture events', () => {
    const event = dragEventSchema.parse({ ...base, type: 'token.drag', tokenId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', leaseId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', gestureId: '11111111-1111-4111-8111-111111111111', sequence: 2, revision: 1, phase: 'move', x: 10, y: 20 })
    const seen = new Map<string, number>()
    expect(acceptSequence(seen, event)).toBe(true)
    expect(acceptSequence(seen, event)).toBe(false)
    expect(acceptSequence(seen, { ...event, sequence: 1 })).toBe(false)
    expect(acceptSequence(seen, { ...event, sequence: 3 })).toBe(true)
  })
})
