import { useMutation } from '@tanstack/react-query'
import { DoorOpen, LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { toFriendlyError } from '../../core/errors'
import { acceptInvite } from '../../data/tabletop'
import { useAuth } from '../auth/AuthProvider'

export function InvitePage() {
  const { token = '' } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const accept = useMutation({ mutationFn: () => acceptInvite(token), onSuccess: (roomId) => navigate(`/room/${roomId}`, { replace: true }) })
  useEffect(() => { if (user && token && !accept.isPending && !accept.isSuccess && !accept.isError) accept.mutate() }, [user, token])
  if (loading) return <div className="app-loading"><div className="loading-rune" /><span>Abrindo o convite…</span></div>
  if (!user) return <Navigate to={`/auth?returnTo=${encodeURIComponent(`/invite/${token}`)}`} replace />
  return <main className="invite-page"><div className="invite-status"><DoorOpen size={34} /><h1>{accept.isError ? 'Este convite não pôde ser usado' : 'Entrando na mesa…'}</h1>{accept.isPending && <LoaderCircle className="spin" size={22} />}{accept.isError && <><p>{toFriendlyError(accept.error)}</p><button className="button primary" onClick={() => navigate('/rooms')}>Ver minhas salas</button></>}</div></main>
}
