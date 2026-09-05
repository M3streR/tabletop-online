import { createClient } from '@supabase/supabase-js'

// Only the dedicated Tabletop test project and test owner's generated rooms.
const expectedUrl = 'https://gpjeuhrdjcmsfwxymjyd.supabase.co'
if (process.env.VITE_SUPABASE_URL !== expectedUrl) throw new Error('Unexpected project; cleanup refused')
const client = createClient(expectedUrl, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const { data: auth, error } = await client.auth.signInWithPassword({ email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD })
if (error) throw error
if (auth.user.id !== '10000000-0000-4000-8000-000000000001') throw new Error('Unexpected test owner; cleanup refused')
const { data: rooms, error: roomsError } = await client.from('rooms').select('id,name').eq('owner_id', auth.user.id).like('name', 'Mesa E2E %')
if (roomsError) throw roomsError
for (const room of rooms) {
  if (!/^Mesa E2E \d+$/.test(room.name)) throw new Error('Unexpected room name; cleanup refused')
  const { data: assets, error: assetsError } = await client.from('media_assets').select('bucket_id,object_path').eq('room_id', room.id)
  if (assetsError) throw assetsError
  for (const bucket of ['room-maps', 'room-tokens']) {
    const paths = assets.filter(a => a.bucket_id === bucket).map(a => a.object_path)
    if (paths.some(path => !path.startsWith(`${room.id}/`))) throw new Error('Unexpected asset path')
    if (paths.length) { const { error } = await client.storage.from(bucket).remove(paths); if (error) throw error }
  }
  const { error } = await client.from('rooms').delete().eq('id', room.id).eq('owner_id', auth.user.id)
  if (error) throw error
  console.log(`Removed disposable room ${room.id}`)
}
await client.auth.signOut({ scope: 'local' })
