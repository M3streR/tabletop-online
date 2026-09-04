import { useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { createRoom, listRooms } from '../data/rooms'

export function useRoomsTools(queryClient: QueryClient) {
  useEffect(() => {
    const context = document.modelContext
    if (!context?.registerTool) return
    const lifecycle = new AbortController()
    const register = async () => {
      await context.registerTool({
        name: 'list_my_tabletop_rooms',
        title: 'Listar salas do Tabletop',
        description: 'Lista as salas privadas às quais a conta autenticada tem acesso.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        async execute() {
          const rooms = await listRooms()
          return { rooms: rooms.map(({ id, name, updated_at }) => ({ id, name, updatedAt: updated_at })) }
        },
      }, { signal: lifecycle.signal })
      await context.registerTool({
        name: 'create_tabletop_room',
        title: 'Criar sala do Tabletop',
        description: 'Cria uma nova sala privada para a conta autenticada e atualiza a lista visível.',
        inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['name'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const name = typeof input === 'object' && input && 'name' in input ? String(input.name).trim() : ''
          if (!name || name.length > 80) throw new Error('O nome da sala deve ter entre 1 e 80 caracteres.')
          const room = await createRoom(name)
          await queryClient.invalidateQueries({ queryKey: ['rooms'] })
          return { id: room.id, name: room.name, status: 'created' }
        },
      }, { signal: lifecycle.signal })
    }
    void register().catch(() => undefined)
    return () => lifecycle.abort()
  }, [queryClient])
}
