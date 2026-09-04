import { Dice5, LoaderCircle, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { toFriendlyError } from '../../core/errors'
import { supabase } from '../../data/supabase'
import { useAuth } from './AuthProvider'

type Mode = 'login' | 'signup'

export function AuthPage() {
  const { user, loading: authLoading } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestedPath = searchParams.get('returnTo') ?? '/rooms'
  const returnTo = /^\/(rooms|room\/|invite\/)/.test(requestedPath) ? requestedPath : '/rooms'

  if (!authLoading && user) return <Navigate to={returnTo} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: `${window.location.origin}${returnTo}`,
          },
        })
        if (signUpError) throw signUpError
        if (!data.session) setNotice('Conta criada. Confira seu e-mail para confirmar o acesso.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
    } catch (caught) {
      setError(toFriendlyError(caught, 'Não foi possível autenticar.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
        <div className="auth-map-card">
          <span className="auth-token auth-token-a">FR</span>
          <span className="auth-token auth-token-b">MG</span>
          <span className="auth-ping" />
        </div>
        <div className="auth-copy">
          <span className="eyebrow"><Sparkles size={14} /> mesa online</span>
          <h1>O mapa no centro.<br />A sessão em movimento.</h1>
          <p>Uma mesa virtual rápida para preparar menos e jogar mais.</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="brand-lockup"><Dice5 size={22} /><span>Mesa</span></div>
        <div className="auth-form-wrap">
          <p className="eyebrow">{mode === 'login' ? 'Bem-vindo de volta' : 'Sua primeira mesa'}</p>
          <h2>{mode === 'login' ? 'Entre para continuar' : 'Crie sua conta'}</h2>
          <form onSubmit={handleSubmit} className="form-stack">
            {mode === 'signup' && (
              <label>
                <span>Como devemos chamar você?</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={1} maxLength={48} autoComplete="name" />
              </label>
            )}
            <label>
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </label>
            <label>
              <span>Senha</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </label>
            {error && <div className="form-message error" role="alert">{error}</div>}
            {notice && <div className="form-message success" role="status">{notice}</div>}
            <button className="button primary wide" disabled={loading || authLoading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : null}
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
          <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice('') }}>
            {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}
          </button>
        </div>
      </section>
    </main>
  )
}
