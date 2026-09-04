import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { AuthPage } from '../features/auth/AuthPage'
import { useAuth } from '../features/auth/AuthProvider'
import { RoomsPage } from '../features/rooms/RoomsPage'
import { InvitePage } from '../features/rooms/InvitePage'

const RoomPage = lazy(() => import('../features/tabletop/RoomPage').then((module) => ({ default: module.RoomPage })))
const BenchmarkPage = lazy(() => import('../features/benchmark/BenchmarkPage').then((module) => ({ default: module.BenchmarkPage })))

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="app-loading"><div className="loading-rune" /><span>Preparando a mesa…</span></div>
  if (!user) return <Navigate to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/rooms" element={<Protected><RoomsPage /></Protected>} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/benchmark" element={<Suspense fallback={<div className="app-loading"><div className="loading-rune" /><span>Montando o cenário de carga…</span></div>}><BenchmarkPage /></Suspense>} />
      <Route path="/room/:roomId" element={<Protected><Suspense fallback={<div className="app-loading"><div className="loading-rune" /><span>Abrindo o mapa…</span></div>}><RoomPage /></Suspense></Protected>} />
      <Route path="*" element={<Navigate to="/rooms" replace />} />
    </Routes>
  )
}
