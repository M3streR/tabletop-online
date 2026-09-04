import type { PostgrestError } from '@supabase/supabase-js'

const friendlyMessages: Record<string, string> = {
  AUTH_REQUIRED: 'Entre na sua conta para continuar.',
  FORBIDDEN: 'Você não tem permissão para fazer isso.',
  INVITE_UNAVAILABLE: 'Este convite expirou, foi revogado ou atingiu o limite de usos.',
  INVALID_INVITE: 'Este link de convite não é válido.',
  TOKEN_BUSY: 'Outra pessoa já está movendo este token.',
  TOKEN_CONTROL_FORBIDDEN: 'Você não tem controle sobre este token.',
  LEASE_LOST: 'O controle temporário do token expirou. Tente novamente.',
  STALE_POSITION: 'O token mudou em outra sessão. A posição foi atualizada.',
  POSITION_OUT_OF_BOUNDS: 'O token precisa permanecer dentro do mapa.',
  GRANTEE_NOT_ROOM_MEMBER: 'Só membros da sala podem controlar tokens.',
}

export function toFriendlyError(error: unknown, fallback = 'Algo deu errado. Tente novamente.') {
  if (error instanceof Error) {
    const key = Object.keys(friendlyMessages).find((candidate) => error.message.includes(candidate))
    if (key) return friendlyMessages[key]
    if (/invalid login credentials/i.test(error.message)) return 'E-mail ou senha incorretos.'
    if (/user already registered/i.test(error.message)) return 'Já existe uma conta com este e-mail.'
    if (/email not confirmed/i.test(error.message)) return 'Confirme seu e-mail antes de entrar.'
    if (/failed to fetch/i.test(error.message)) return 'Não foi possível conectar. Verifique sua internet.'
    return error.message || fallback
  }

  const postgrest = error as Partial<PostgrestError> | null
  if (postgrest?.message) return toFriendlyError(new Error(postgrest.message), fallback)
  return fallback
}
