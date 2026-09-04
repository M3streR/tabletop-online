import type { RealtimeChannel } from '@supabase/supabase-js'
import type { RoomRole } from '../domain/tabletop'
import { supabase } from '../data/supabase'
import { acceptSequence, ephemeralEventSchema, presenceSchema, type EphemeralEvent, type TabletopPresence } from './protocol'

export type RoomChannelOptions = {
  roomId: string
  topic: string
  userId: string
  displayName: string
  role: RoomRole
  onEvent: (event: EphemeralEvent) => void
  onPresence: (users: TabletopPresence[]) => void
  onDurableChange: () => void
  onConnected: () => Promise<void>
  onStatus: (ready: boolean) => void
}

export class RoomChannel {
  private channel: RealtimeChannel | null = null
  private seen = new Map<string, number>()
  sentCount = 0
  private closed = false
  private ready = false

  constructor(private readonly options: RoomChannelOptions) {}

  async connect() {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token)
    const presenceKey = `${this.options.userId}:${crypto.randomUUID()}`
    const channel = supabase.channel(this.options.topic, { config: { private: true, presence: { key: presenceKey }, broadcast: { ack: false, self: false } } })
    if (this.closed) return
    this.channel = channel
    channel.on('broadcast', { event: 'ephemeral' }, ({ payload }) => {
      const parsed = ephemeralEventSchema.safeParse(payload)
      if (!this.ready || !parsed.success || parsed.data.roomId !== this.options.roomId || !acceptSequence(this.seen, parsed.data)) return
      if (this.seen.size > 2000) this.seen.delete(this.seen.keys().next().value!)
      this.options.onEvent(parsed.data)
    })
    channel.on('presence', { event: 'sync' }, () => {
      const users = Object.values(channel.presenceState()).flatMap((entries) => entries).flatMap((entry) => {
        const parsed = presenceSchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
      })
      this.options.onPresence(Array.from(new Map(users.map((user) => [user.userId, user])).values()))
    })
    const durableTables = ['room_state', 'scenes', 'media_assets', 'tokens', 'token_transforms', 'token_control_grants', 'room_members']
    durableTables.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `room_id=eq.${this.options.roomId}` }, this.options.onDurableChange))
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${this.options.roomId}` }, this.options.onDurableChange)
    await new Promise<void>((resolve, reject) => {
      channel.subscribe(async (status, error) => {
        if (status === 'SUBSCRIBED') {
          this.ready = false
          this.options.onStatus(false)
          try { await this.options.onConnected() } catch (caught) { reject(caught); return }
          if (this.closed) return
          this.seen.clear()
          this.ready = true
          this.options.onStatus(true)
          await channel.track({ userId: this.options.userId, displayName: this.options.displayName, role: this.options.role, onlineAt: new Date().toISOString() })
          resolve()
        } else {
          this.ready = false
          this.options.onStatus(false)
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(error ?? new Error('Falha ao conectar à sala.'))
        }
      })
    })
  }

  async send(event: EphemeralEvent) {
    if (!this.channel || !this.ready || this.closed) return
    this.sentCount += 1
    await this.channel.send({ type: 'broadcast', event: 'ephemeral', payload: event })
  }

  async disconnect() {
    this.closed = true
    this.ready = false
    if (this.channel) await supabase.removeChannel(this.channel)
    this.channel = null
  }
}
