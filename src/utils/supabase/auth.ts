import { createClient } from './server'
import { redirect } from 'next/navigation'

export type UserProfile = {
  id: string
  name: string
  email: string
  role: 'admin' | 'operator'
  active: boolean
  is_super_admin?: boolean
  organization_id: string
  organization?: {
    id: string
    name: string
    cnpj?: string | null
    slug?: string
    logo_url?: string | null
  }
}

/**
 * Retorna o perfil completo do usuário autenticado e sua organização
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organization:organizations(id, name, cnpj, slug, logo_url)')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.active) {
    return null
  }

  return profile as UserProfile
}

/**
 * Exige autenticação. Redireciona para /login se não estiver autenticado.
 */
export async function requireAuth(): Promise<UserProfile> {
  const profile = await getCurrentUser()
  if (!profile) {
    redirect('/login')
  }
  return profile
}

/**
 * Exige perfil de Administrador. Redireciona para / se for operador.
 */
export async function requireAdmin(): Promise<UserProfile> {
  const profile = await requireAuth()
  if (profile.role !== 'admin') {
    redirect('/')
  }
  return profile
}

/**
 * Exige perfil de Super Administrador da plataforma SaaS (Painel Master). Redireciona para / se não for.
 */
export async function requireSuperAdmin(): Promise<UserProfile> {
  const profile = await requireAuth()
  if (!profile.is_super_admin) {
    redirect('/')
  }
  return profile
}
