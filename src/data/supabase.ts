import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://configuration-required.invalid',
  supabaseKey ?? 'configuration-required',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  },
)

export const getSupabaseUrl = () => supabaseUrl ?? ''
export const getSupabasePublishableKey = () => supabaseKey ?? ''
