import { supabase } from './supabase'

export async function listRooms() {
  const { data, error } = await supabase.from('rooms').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createRoom(name: string) {
  const { data, error } = await supabase.rpc('create_room', { p_name: name })
  if (error) throw error
  return data
}
