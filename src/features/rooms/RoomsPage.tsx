import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, DoorOpen, LoaderCircle, LogOut, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toFriendlyError } from '../../core/errors'
import { createRoom, listRooms } from '../../data/rooms'
import { useAuth } from '../auth/AuthProvider'
import { useRoomsTools } from '../../webmcp/useRoomsTools'

export function RoomsPage() {
  const { user, signOut } = useAuth()
  const queryClient = useQueryClient()
  useRoomsTools(queryClient)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: listRooms })
  const create = useMutation({
    mutationFn: createRoom,
    onSuccess: () => {
      setName('')
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (caught) => setError(toFriendlyError(caught, 'Não foi possível criar a sala.')),
  })

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (name.trim()) create.mutate(name.trim())
  }

  return (
    <main className="rooms-page">
      <header className="rooms-header">
        <div className="brand-lockup"><DoorOpen size={22} /><span>Mesa</span></div>
        <div className="rooms-user">
          <span>{user?.email}</span>
          <button className="icon-button" aria-label="Sair" title="Sair" onClick={() => void signOut()}><LogOut size={18} /></button>
        </div>
      </header>
      <section className="rooms-content">
        <div className="rooms-intro">
          <p className="eyebrow">Suas mesas</p>
          <h1>Onde vamos jogar?</h1>
        </div>
        <form className="create-room-card" onSubmit={handleCreate}>
          <div className="create-room-icon"><Plus size={22} /></div>
          <label>
            <span>Nova sala</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex.: Ruínas de Salmar" aria-label="Nome da nova sala" />
          </label>
          <button className="button primary" disabled={!name.trim() || create.isPending}>
            {create.isPending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            Criar
          </button>
        </form>
        {error && <div className="form-message error" role="alert">{error}</div>}
        {rooms.isLoading && <div className="room-grid"><div className="room-card skeleton" /><div className="room-card skeleton" /></div>}
        {rooms.error && <div className="form-message error">{toFriendlyError(rooms.error, 'Não foi possível carregar suas salas.')}</div>}
        {rooms.data?.length === 0 && (
          <div className="empty-state">
            <div className="empty-map"><span /></div>
            <h2>Sua primeira mesa começa aqui</h2>
            <p>Crie uma sala, coloque um mapa e convide seus jogadores.</p>
          </div>
        )}
        {!!rooms.data?.length && (
          <div className="room-grid">
            {rooms.data.map((room) => (
              <Link className="room-card" to={`/room/${room.id}`} key={room.id}>
                <div className="room-card-map"><span className="mini-token">{room.name.slice(0, 2).toUpperCase()}</span></div>
                <div className="room-card-copy"><h2>{room.name}</h2><span>Abrir mesa <ArrowRight size={15} /></span></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
