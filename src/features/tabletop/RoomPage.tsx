import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, DoorOpen, Grid3X3, Hand, ImagePlus, Link2, LoaderCircle, Lock, LogOut, MapPin, Menu, MousePointer2, Plus, Ruler, Settings2, Trash2, Unlock, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toFriendlyError } from '../../core/errors'
import { acquireTokenLease, activeScene, assetForScene, commitTokenMove, createInvite, createScene, createToken, deleteRoom, deleteToken, getRoomSnapshot, leaveRoom, releaseTokenLease, renameRoom, renewTokenLease, revokeRoomInvites, sceneTokens, setActiveScene, setTokenGrant, updateScene, updateToken } from '../../data/tabletop'
import type { RoomSnapshot, TabletopToken } from '../../domain/tabletop'
import { canControlToken, isRoomAdmin } from '../../domain/tabletop'
import { RoomChannel } from '../../realtime/roomChannel'
import { LeasePreview } from '../../realtime/leasePreview'
import type { EphemeralEvent, TabletopPresence } from '../../realtime/protocol'
import type { BoardCallbacks, BoardEngine, BoardTool } from '../../rendering/BoardEngine'
import type { Point } from '../../rendering/math'
import { useAuth } from '../auth/AuthProvider'
import { PixiBoard } from './PixiBoard'

type Modal = 'scene' | 'token' | 'invite' | 'grid' | 'room' | null
type DragSession = { tokenId: string; sceneId: string; broadcast: boolean; leaseId: string; gestureId: string; sequence: number; revision: number; lastSent: number; point: Point; renewTimer: number }

function roleLabel(role: string) {
  if (role === 'owner') return 'Dono'
  if (role === 'gm') return 'Mestre'
  return 'Jogador'
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog-card" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><p className="eyebrow">Configuração</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
      {children}
    </section>
  </div>
}

function SceneForm({ roomId, onCreated, onCancel }: { roomId: string; onCreated: (sceneId: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const mutation = useMutation({ mutationFn: () => createScene(roomId, name, file!), onSuccess: (scene) => onCreated(scene.id), onError: (caught) => setError(toFriendlyError(caught, 'Não foi possível criar a cena.')) })
  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (name.trim() && file) mutation.mutate() }}>
    <label><span>Nome da cena</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Templo submerso" autoFocus /></label>
    <label className="file-field"><span>Imagem do mapa</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small>PNG, JPEG ou WebP · até 20 MB · 4096 × 4096</small></label>
    {error && <div className="form-message error">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={!name.trim() || !file || mutation.isPending}>{mutation.isPending && <LoaderCircle className="spin" size={17} />}Criar cena</button></div>
  </form>
}

function TokenForm({ snapshot, sceneId, onCreated, onCancel }: { snapshot: RoomSnapshot; sceneId: string; onCreated: () => void; onCancel: () => void }) {
  const scene = snapshot.scenes.find((item) => item.id === sceneId)!
  const [name, setName] = useState('')
  const [size, setSize] = useState(scene.grid_cell_size)
  const [color, setColor] = useState('#64dfd2')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const mutation = useMutation({ mutationFn: () => createToken({ roomId: snapshot.room.id, sceneId, name, size, color, image: file, x: Math.min(scene.world_width / 2, scene.world_width - size / 2), y: Math.min(scene.world_height / 2, scene.world_height - size / 2) }), onSuccess: onCreated, onError: (caught) => setError(toFriendlyError(caught, 'Não foi possível criar o token.')) })
  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (name.trim()) mutation.mutate() }}>
    <label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Arqueira" autoFocus /></label>
    <div className="form-row"><label><span>Tamanho</span><input type="number" min={8} max={2048} value={size} onChange={(event) => setSize(Number(event.target.value))} /></label><label><span>Cor</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div>
    <label className="file-field"><span>Imagem opcional</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small>Sem imagem, criamos um marcador com iniciais.</small></label>
    {error && <div className="form-message error">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={!name.trim() || mutation.isPending}>{mutation.isPending && <LoaderCircle className="spin" size={17} />}Criar token</button></div>
  </form>
}

function GridForm({ scene, onSaved, onCancel }: { scene: NonNullable<ReturnType<typeof activeScene>>; onSaved: () => void; onCancel: () => void }) {
  const [values, setValues] = useState({ grid_enabled: scene.grid_enabled, grid_cell_size: scene.grid_cell_size, grid_offset_x: scene.grid_offset_x, grid_offset_y: scene.grid_offset_y, grid_opacity: scene.grid_opacity, snap_enabled: scene.snap_enabled })
  const [error, setError] = useState('')
  const mutation = useMutation({ mutationFn: () => updateScene(scene.id, values), onSuccess: onSaved, onError: (caught) => setError(toFriendlyError(caught)) })
  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); mutation.mutate() }}>
    <div className="toggle-row"><span>Exibir grid</span><input type="checkbox" checked={values.grid_enabled} onChange={(event) => setValues({ ...values, grid_enabled: event.target.checked })} /></div>
    <div className="toggle-row"><span>Ajustar tokens ao grid</span><input type="checkbox" checked={values.snap_enabled} onChange={(event) => setValues({ ...values, snap_enabled: event.target.checked })} /></div>
    <div className="form-row"><label><span>Célula</span><input type="number" min={8} max={512} value={values.grid_cell_size} onChange={(event) => setValues({ ...values, grid_cell_size: Number(event.target.value) })} /></label><label><span>Opacidade</span><input type="number" min={0} max={1} step={0.05} value={values.grid_opacity} onChange={(event) => setValues({ ...values, grid_opacity: Number(event.target.value) })} /></label></div>
    <div className="form-row"><label><span>Offset X</span><input type="number" min={-4096} max={4096} value={values.grid_offset_x} onChange={(event) => setValues({ ...values, grid_offset_x: Number(event.target.value) })} /></label><label><span>Offset Y</span><input type="number" min={-4096} max={4096} value={values.grid_offset_y} onChange={(event) => setValues({ ...values, grid_offset_y: Number(event.target.value) })} /></label></div>
    {error && <div className="form-message error">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={mutation.isPending}>Salvar grid</button></div>
  </form>
}

function InvitePanel({ roomId, canInviteGm }: { roomId: string; canInviteGm: boolean }) {
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [role, setRole] = useState<'player' | 'gm'>('player')
  const [error, setError] = useState('')
  const mutation = useMutation({ mutationFn: () => createInvite(roomId, role), onSuccess: ({ secret }) => { setLink(`${location.origin}/invite/${secret}`); setError('') }, onError: (caught) => setError(toFriendlyError(caught)) })
  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) }
  const revoke = async () => { try { await revokeRoomInvites(roomId); setLink(''); setToastMessage('Convites ativos revogados.') } catch (caught) { setError(toFriendlyError(caught)) } }
  const [toastMessage, setToastMessage] = useState('')
  return <div className="form-stack"><p className="dialog-copy">O link expira em 7 dias. O segredo nunca é armazenado em texto puro.</p><label><span>Papel ao entrar</span><select value={role} onChange={(event) => setRole(event.target.value as 'player' | 'gm')}><option value="player">Jogador</option>{canInviteGm && <option value="gm">Mestre auxiliar</option>}</select></label>{link ? <div className="invite-link"><input readOnly value={link} /><button className="icon-button" onClick={() => void copy()} aria-label="Copiar link"><Copy size={18} /></button></div> : <button className="button primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />}Gerar link</button>}<button className="button secondary" onClick={() => void revoke()}>Revogar links ativos</button>{copied && <div className="form-message success">Link copiado.</div>}{toastMessage && <div className="form-message success">{toastMessage}</div>}{error && <div className="form-message error">{error}</div>}</div>
}

function RoomMenu({ snapshot, onClose, onRefresh, onExit, onSignOut }: { snapshot: RoomSnapshot; onClose: () => void; onRefresh: () => void; onExit: () => void; onSignOut: () => void }) {
  const [name, setName] = useState(snapshot.room.name)
  const [error, setError] = useState('')
  const admin = isRoomAdmin(snapshot.role)
  const save = async () => { try { await renameRoom(snapshot.room.id, name); onRefresh(); onClose() } catch (caught) { setError(toFriendlyError(caught)) } }
  return <div className="room-menu">{admin && <label><span>Nome da sala</span><div className="inline-field"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /><button className="button secondary" disabled={!name.trim()} onClick={() => void save()}>Salvar</button></div></label>}<div><span>Seu papel</span><strong>{roleLabel(snapshot.role)}</strong></div><div><span>Membros</span><strong>{snapshot.participants.length}</strong></div><button className="button secondary wide" onClick={onSignOut}><LogOut size={17} />Sair da conta</button><button className="button danger wide" onClick={onExit}><Trash2 size={17} />{snapshot.role === 'owner' ? 'Excluir sala' : 'Sair da sala'}</button>{error && <div className="form-message error">{error}</div>}</div>
}

function TokenPanel({ token, snapshot, userId, onClose, onChanged }: { token: TabletopToken; snapshot: RoomSnapshot; userId: string; onClose: () => void; onChanged: () => void }) {
  const admin = isRoomAdmin(snapshot.role)
  const [name, setName] = useState(token.name)
  const [size, setSize] = useState(token.width_world)
  const [color, setColor] = useState(token.color)
  const [grants, setGrants] = useState(() => new Set(token.controllers))
  const [error, setError] = useState('')
  const save = useMutation({ mutationFn: () => updateToken(token.id, { name, width_world: size, height_world: size, color }), onSuccess: onChanged, onError: (caught) => setError(toFriendlyError(caught)) })
  const remove = useMutation({ mutationFn: () => deleteToken(token.id), onSuccess: () => { onClose(); onChanged() }, onError: (caught) => setError(toFriendlyError(caught)) })
  const change = async (changes: Parameters<typeof updateToken>[1]) => { try { await updateToken(token.id, changes); onChanged() } catch (caught) { setError(toFriendlyError(caught)) } }
  useEffect(() => setGrants(new Set(token.controllers)), [token.controllers])
  const grant = async (userId: string, granted: boolean) => {
    setGrants((current) => { const next = new Set(current); if (granted) next.add(userId); else next.delete(userId); return next })
    try { await setTokenGrant(token, userId, granted); onChanged() } catch (caught) {
      setGrants((current) => { const next = new Set(current); if (granted) next.delete(userId); else next.add(userId); return next })
      setError(toFriendlyError(caught))
    }
  }
  return <aside className="token-panel">
    <header><div><p className="eyebrow">Token</p><h2>{token.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header>
    {!admin && <div className="permission-note">{canControlToken(token, snapshot.role, userId) ? 'Você controla este token.' : 'Somente visualização.'}</div>}
    {admin && <><label><span>Nome</span><div className="inline-field"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /><button className="button secondary" onClick={() => save.mutate()} disabled={save.isPending}>Salvar</button></div></label>
      <div className="form-row"><label><span>Tamanho do token</span><input type="number" min={8} max={2048} value={size} onChange={(event) => setSize(Number(event.target.value))} /></label><label><span>Cor do token</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div>
      <div className="token-options"><button onClick={() => void change({ locked: !token.locked })}>{token.locked ? <Lock size={16} /> : <Unlock size={16} />}{token.locked ? 'Desbloquear' : 'Bloquear'}</button><button onClick={() => void change({ visibility: token.visibility === 'everyone' ? 'gm_only' : 'everyone' })}><Users size={16} />{token.visibility === 'everyone' ? 'Visível a todos' : 'Apenas mestres'}</button></div>
      <div className="grant-list"><p>Quem pode mover</p>{snapshot.participants.filter((participant) => participant.role !== 'owner').map((participant) => <label key={participant.userId}><span><i className={`presence-dot ${participant.role}`} />{participant.displayName}</span><input type="checkbox" checked={grants.has(participant.userId)} onChange={(event) => void grant(participant.userId, event.target.checked)} /></label>)}</div>
      <button className="button danger wide" onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 size={17} />Excluir token</button>
    </>}
    {error && <div className="form-message error">{error}</div>}
  </aside>
}

export function RoomPage() {
  const { roomId = '' } = useParams()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tool, setTool] = useState<BoardTool>('select')
  const [modal, setModal] = useState<Modal>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [presence, setPresence] = useState<TabletopPresence[]>([])
  const [toast, setToast] = useState('')
  const [contextLost, setContextLost] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectionEpoch, setConnectionEpoch] = useState(0)
  const connectedRef = useRef(false)
  const engineRef = useRef<BoardEngine | null>(null)
  const channelRef = useRef<RoomChannel | null>(null)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const measureRef = useRef({ gestureId: '', sequence: 0, lastSent: 0 })
  const reconnectTimer = useRef<number | null>(null)
  const snapshot = useQuery({ queryKey: ['room', roomId, user?.id], queryFn: () => getRoomSnapshot(roomId, user!.id), enabled: Boolean(roomId && user), retry: 1, refetchInterval: 15_000, refetchOnReconnect: 'always' })
  snapshotRef.current = snapshot.data ?? null
  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: ['room', roomId] }), [queryClient, roomId])
  const currentScene = snapshot.data ? activeScene(snapshot.data) : null
  const currentTokens = snapshot.data && currentScene ? sceneTokens(snapshot.data, currentScene.id) : []
  const selected = currentTokens.find((token) => token.id === selectedId) ?? null
  const background = snapshot.data && currentScene ? assetForScene(snapshot.data, currentScene)?.signedUrl ?? null : null

  useEffect(() => {
    const offline = () => {
      connectedRef.current = false
      setConnected(false)
      engineRef.current?.cancelDrag()
      void channelRef.current?.disconnect()
    }
    const online = () => setConnectionEpoch(epoch => epoch + 1)
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', online) }
  }, [])

  useEffect(() => {
    const data = snapshot.data
    if (!data || !user || snapshot.error || !navigator.onLine) return
    let cancelled = false
    const previews = new LeasePreview()
    const applied = new Map<string, number>()
    const self = data.participants.find((participant) => participant.userId === user.id)!
    const roomChannel = new RoomChannel({
      roomId,
      topic: data.room.realtime_topic,
      userId: user.id,
      displayName: self?.displayName ?? user.email ?? 'Jogador',
      role: data.role,
      onPresence: (users) => setPresence(users.flatMap((entry) => {
        const participant = snapshotRef.current?.participants.find((p) => p.userId === entry.userId)
        return participant ? [{ ...entry, ...participant }] : []
      })),
      onStatus: (ready) => { if (cancelled) return; connectedRef.current = ready; setConnected(ready); if (!ready) engineRef.current?.cancelDrag() },
      onConnected: async () => {
        const next = await getRoomSnapshot(roomId, user.id)
        snapshotRef.current = next
        queryClient.setQueryData(['room', roomId, user.id], next)
      },
      onDurableChange: () => {
        if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current)
        reconnectTimer.current = window.setTimeout(refresh, 90)
      },
      onEvent: async (event) => {
        if (event.sceneId !== snapshotRef.current?.state.active_scene_id) return
        if (event.type === 'token.drag') {
          const token = snapshotRef.current?.tokens.find((t) => t.id === event.tokenId)
          if (!token || token.visibility !== 'everyone' || token.locked || event.x < 0 || event.x > 4096 || event.y < 0 || event.y > 4096) return
          if (event.phase === 'end' || event.phase === 'cancel') { refresh(); return }
          if (event.revision !== token.transform.revision || !await previews.accepts(event) || cancelled) return
          const latest = snapshotRef.current?.tokens.find((t) => t.id === event.tokenId)
          if (!latest || latest.transform.revision !== event.revision || latest.visibility !== 'everyone' || latest.locked || latest.scene_id !== snapshotRef.current?.state.active_scene_id) return
          const sequenceKey = `${event.tokenId}:${event.gestureId}`
          if (event.sequence <= (applied.get(sequenceKey) ?? -1)) return
          applied.set(sequenceKey, event.sequence)
          if (applied.size > 256) applied.delete(applied.keys().next().value!)
          engineRef.current?.setRemoteTokenPosition(event.tokenId, { x: event.x, y: event.y })
        } else if (event.type === 'map.ping') engineRef.current?.showPing({ x: event.x, y: event.y }, event.color)
        else {
          const scene = snapshotRef.current?.scenes.find((item) => item.id === event.sceneId)
          engineRef.current?.showRemoteMeasure({ x: event.startX, y: event.startY }, { x: event.endX, y: event.endY }, scene?.grid_cell_size ?? 70, event.phase === 'end')
        }
      },
    })
    channelRef.current = roomChannel
    roomChannel.connect().catch((caught) => !cancelled && setToast(toFriendlyError(caught, 'A conexão em tempo real será restabelecida.')))
    return () => { cancelled = true; void roomChannel.disconnect(); if (channelRef.current === roomChannel) channelRef.current = null }
  }, [snapshot.data?.room.realtime_topic, user?.id, Boolean(snapshot.error), connectionEpoch])

  const baseEvent = useCallback(() => ({ v: 1 as const, eventId: crypto.randomUUID(), roomId, sceneId: snapshotRef.current!.state.active_scene_id!, userId: user!.id, sentAt: Date.now() }), [roomId, user?.id])

  const callbacks = useMemo<BoardCallbacks>(() => ({
    onSelect: setSelectedId,
    onContextLost: setContextLost,
    onDragAbort: (tokenId) => {
      const drag = dragRef.current
      if (!drag || drag.tokenId !== tokenId) return
      dragRef.current = null
      window.clearInterval(drag.renewTimer)
      void releaseTokenLease(tokenId, drag.leaseId).finally(refresh)
    },
    onDragStart: async (tokenId) => {
      if (!connectedRef.current) { setToast('Aguarde a conexão com a mesa.'); return false }
      const data = snapshotRef.current
      const token = data?.tokens.find((item) => item.id === tokenId)
      if (!data || !token || !user || !canControlToken(token, data.role, user.id)) { setToast('Você não tem controle sobre este token.'); return false }
      try {
        const lease = await acquireTokenLease(tokenId)
        const latest = snapshotRef.current?.tokens.find((t) => t.id === tokenId)
        if (!latest || latest.scene_id !== snapshotRef.current?.state.active_scene_id) { await releaseTokenLease(tokenId, lease.lease_id); return false }
        const session: DragSession = { tokenId, sceneId: token.scene_id, broadcast: token.visibility === 'everyone', leaseId: lease.lease_id, gestureId: crypto.randomUUID(), sequence: 0, revision: token.transform.revision, lastSent: 0, point: { x: token.transform.x_world, y: token.transform.y_world }, renewTimer: 0 }
        session.renewTimer = window.setInterval(() => void renewTokenLease(tokenId, session.leaseId).catch(() => { engineRef.current?.cancelDrag(); setToast('O controle temporário do token expirou.'); refresh() }), 5000)
        dragRef.current = session
        if (session.broadcast) await channelRef.current?.send({ ...baseEvent(), type: 'token.drag', tokenId, leaseId: session.leaseId, gestureId: session.gestureId, sequence: session.sequence++, revision: session.revision, phase: 'start', ...session.point })
        return true
      } catch (caught) { setToast(toFriendlyError(caught)); refresh(); return false }
    },
    onDragMove: (tokenId, point) => {
      const drag = dragRef.current
      if (!drag || drag.tokenId !== tokenId) return
      drag.point = point
      if (!drag.broadcast) return
      const now = performance.now()
      if (now - drag.lastSent < 67) return
      drag.lastSent = now
      void channelRef.current?.send({ ...baseEvent(), type: 'token.drag', tokenId, leaseId: drag.leaseId, gestureId: drag.gestureId, sequence: drag.sequence++, revision: drag.revision, phase: 'move', x: point.x, y: point.y })
    },
    onDragEnd: (tokenId, point) => {
      const drag = dragRef.current
      if (!drag || drag.tokenId !== tokenId) return
      dragRef.current = null
      window.clearInterval(drag.renewTimer)
      void (async () => {
        try {
          await commitTokenMove(tokenId, drag.leaseId, drag.revision, point.x, point.y)
          if (drag.broadcast) await channelRef.current?.send({ ...baseEvent(), sceneId: drag.sceneId, type: 'token.drag', tokenId, leaseId: drag.leaseId, gestureId: drag.gestureId, sequence: drag.sequence++, revision: drag.revision, phase: 'end', x: point.x, y: point.y })
        } catch (caught) {
          setToast(toFriendlyError(caught, 'A posição não pôde ser salva.'))
          await releaseTokenLease(tokenId, drag.leaseId).catch(() => undefined)
        } finally { refresh() }
      })()
    },
    onPing: (point) => {
      if (!snapshotRef.current?.state.active_scene_id) return
      const event: EphemeralEvent = { ...baseEvent(), type: 'map.ping', x: point.x, y: point.y, color: '#64dfd2' }
      void channelRef.current?.send(event)
    },
    onMeasure: (phase, start, end) => {
      if (!snapshotRef.current?.state.active_scene_id) return
      const state = measureRef.current
      if (phase === 'start') { state.gestureId = crypto.randomUUID(); state.sequence = 0; state.lastSent = 0 }
      const now = performance.now()
      if (phase === 'move' && now - state.lastSent < 67) return
      state.lastSent = now
      void channelRef.current?.send({ ...baseEvent(), type: 'map.measure', gestureId: state.gestureId, sequence: state.sequence++, phase, startX: start.x, startY: start.y, endX: end.x, endY: end.y })
    },
  }), [baseEvent, refresh, user?.id])

  useEffect(() => () => { const drag = dragRef.current; if (drag) { window.clearInterval(drag.renewTimer); void releaseTokenLease(drag.tokenId, drag.leaseId) } }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3800); return () => clearTimeout(timer) }, [toast])

  if (snapshot.isLoading) return <div className="app-loading"><div className="loading-rune" /><span>Posicionando miniaturas…</span></div>
  if (snapshot.error || !snapshot.data) return <main className="room-error"><DoorOpen size={36} /><h1>Esta mesa não está disponível</h1><p>{toFriendlyError(snapshot.error, 'Você pode ter saído da sala ou perdido o acesso.')}</p><Link className="button primary" to="/rooms">Voltar às salas</Link></main>
  const data = snapshot.data
  const admin = isRoomAdmin(data.role)

  const chooseScene = async (sceneId: string) => { try { await setActiveScene(roomId, sceneId); refresh() } catch (caught) { setToast(toFriendlyError(caught)) } }
  const createdScene = async (sceneId: string) => { setModal(null); await setActiveScene(roomId, sceneId); refresh() }
  const exitRoom = async () => { if (data.role === 'owner') { if (!confirm('Excluir esta sala e todo o estado persistente?')) return; await deleteRoom(roomId) } else await leaveRoom(roomId, user!.id); navigate('/rooms') }

  return <main className="tabletop-shell">
    <header className="tabletop-topbar">
      <div className="tabletop-title"><Link to="/rooms" className="icon-button" aria-label="Voltar às salas"><DoorOpen size={19} /></Link><div><strong>{data.room.name}</strong><span>{currentScene?.name ?? 'Sem cena ativa'}</span></div></div>
      <div className="scene-switcher">{admin && data.scenes.length > 0 && <select aria-label="Cena ativa" value={currentScene?.id ?? ''} onChange={(event) => void chooseScene(event.target.value)}>{data.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select>}</div>
      <div className="tabletop-people"><div className="presence-stack">{presence.slice(0, 5).map((person) => <span key={person.userId} title={`${person.displayName} · ${roleLabel(person.role)}`}><i className={`presence-dot ${person.role}`} />{person.displayName}</span>)}</div>{admin && <button className="button top-action" onClick={() => setModal('invite')}><Link2 size={16} />Convidar</button>}<button className="icon-button" aria-label="Menu da sala" onClick={() => setModal('room')}><Menu size={20} /></button></div>
    </header>
    <section className="tabletop-stage">
      <div className="connection-badge" data-testid="connection-state">{connected ? 'Online' : 'Conectando…'}</div>
      <PixiBoard scene={currentScene} backgroundUrl={background} tokens={currentTokens} selectedId={selectedId} tool={tool} callbacks={callbacks} engineRef={engineRef as MutableRefObject<BoardEngine | null>} />
      <nav className="tool-rail" aria-label="Ferramentas da mesa">{([
        ['select', MousePointer2, 'Selecionar'], ['pan', Hand, 'Mover câmera'], ['ping', MapPin, 'Ping'], ['measure', Ruler, 'Régua'],
      ] as const).map(([id, Icon, label]) => <button key={id} className={tool === id ? 'active' : ''} onClick={() => { engineRef.current?.setTool(id); setTool(id) }} aria-label={label} title={label}><Icon size={20} /><span>{label}</span></button>)}<hr />{admin && <><button onClick={() => setModal('scene')} aria-label="Adicionar mapa" title="Adicionar mapa"><ImagePlus size={20} /><span>Mapa</span></button><button disabled={!currentScene} onClick={() => setModal('token')} aria-label="Criar token" title="Criar token"><Plus size={20} /><span>Token</span></button><button disabled={!currentScene} onClick={() => setModal('grid')} aria-label="Configurar grid" title="Configurar grid"><Grid3X3 size={20} /><span>Grid</span></button></>}</nav>
      {!currentScene && <div className="board-empty"><div className="empty-map"><span /></div><h1>A mesa está pronta</h1><p>{admin ? 'Adicione um mapa para abrir a primeira cena.' : 'O Mestre ainda está preparando a primeira cena.'}</p>{admin && <button className="button primary" onClick={() => setModal('scene')}><ImagePlus size={18} />Adicionar mapa</button>}</div>}
      {selected && <TokenPanel key={selected.id} token={selected} snapshot={data} userId={user!.id} onClose={() => setSelectedId(null)} onChanged={refresh} />}
      {contextLost && <div className="context-warning">A placa de vídeo pausou a mesa. Tentando recuperar o WebGL…</div>}
      {toast && <div className="tabletop-toast" role="status">{toast}</div>}
    </section>
    {modal === 'scene' && <Dialog title="Nova cena" onClose={() => setModal(null)}><SceneForm roomId={roomId} onCreated={(id) => void createdScene(id)} onCancel={() => setModal(null)} /></Dialog>}
    {modal === 'token' && currentScene && <Dialog title="Novo token" onClose={() => setModal(null)}><TokenForm snapshot={data} sceneId={currentScene.id} onCreated={() => { setModal(null); refresh() }} onCancel={() => setModal(null)} /></Dialog>}
    {modal === 'invite' && <Dialog title="Convidar para a sala" onClose={() => setModal(null)}><InvitePanel roomId={roomId} canInviteGm={data.role === 'owner'} /></Dialog>}
    {modal === 'grid' && currentScene && <Dialog title="Grid quadrado" onClose={() => setModal(null)}><GridForm scene={currentScene} onSaved={() => { setModal(null); refresh() }} onCancel={() => setModal(null)} /></Dialog>}
    {modal === 'room' && <Dialog title="Sala" onClose={() => setModal(null)}><RoomMenu snapshot={data} onClose={() => setModal(null)} onRefresh={refresh} onExit={() => void exitRoom()} onSignOut={() => void signOut()} /></Dialog>}
  </main>
}
