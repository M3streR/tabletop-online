import { supabase } from '../data/supabase'
import type { EphemeralEvent } from './protocol'

type Drag = Extract<EphemeralEvent, { type: 'token.drag' }>

/** Broadcast is only a preview, never an authority or authenticated identity.
 * Validate against the current lease, at most once/second/token, coalescing bursts.
 * Final events only request a durable snapshot; their coordinates are not trusted.
 */
export class LeasePreview {
  private entries = new Map<string, { until: number; check: PromiseLike<{ user_id: string; lease_id: string } | null> }>()
  async accepts(event: Drag) {
    let entry = this.entries.get(event.tokenId)
    if (!entry || entry.until <= Date.now()) {
      entry = { until: Date.now() + 1000, check: supabase.rpc('inspect_token_lease', { p_token_id: event.tokenId }).then(({ data, error }) => error ? null : data?.[0] ?? null) }
      this.entries.set(event.tokenId, entry)
      if (this.entries.size > 256) this.entries.delete(this.entries.keys().next().value!)
    }
    const lease = await entry.check
    return lease?.user_id === event.userId && lease.lease_id === event.leaseId
  }
}
