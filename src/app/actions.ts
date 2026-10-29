'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getCurrentUser, requireAuth, requireAdmin, requireSuperAdmin } from '@/utils/supabase/auth'
import { getDbPool } from '@/utils/db'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { sendArrivalEmail, sendCompletionEmail } from '@/utils/mailer'
import { sendTripWhatsAppPrompt } from '@/utils/whatsapp'
import { sendTripTelegramPrompt, getTelegramTripDeepLink } from '@/utils/telegram'
import { formatCNPJ, EMAIL_REGEX } from '@/utils/masks'
import { parseCTeXml } from '@/utils/sefaz/sync-service'
import { syncCteEmailsFromMailbox, getSswSyncHealth, classifyImapError, EmailSyncResult } from '@/utils/email/email-xml-sync'
import { parseProcedaConemb, processEdiLoteInDatabase } from '@/utils/edi/conemb-parser'
import { BlockedSswDriverInfo, Ssw047ParseResult, parseSsw047DriversReport } from '@/utils/ssw/driver-report-parser'
import {
  appendTripAuditEvent,
  appendTripIncident,
  resolveTripIncidentInMeta,
  parseSafeMetadata,
  IncidentCategory,
  INCIDENT_CATEGORIES,
} from '@/utils/trip-audit'
import crypto from 'crypto'

// ==========================================
// 🔐 AUTENTICAÇÃO E SESSÃO DO SISTEMA (SAAS)
// ==========================================

export async function signInAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Por favor, informe e-mail e senha.' }
  }

  // Validação de Tamanho de Payload (Anti-DoS)
  if (email.length > 150) {
    return { error: 'E-mail inválido ou muito longo.' }
  }
  if (password.length > 128) {
    return { error: 'A senha informada excede o tamanho máximo permitido.' }
  }

  // Rate Limiting por E-mail (Proteção contra Brute Force / Credential Stuffing)
  const cookieStore = await cookies()
  const emailKey = email.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 48)

  const lockCookie = cookieStore.get(`login_lock_${emailKey}`)
  if (lockCookie) {
    const unlockAt = parseInt(lockCookie.value, 10)
    const remainingSeconds = Math.ceil((unlockAt - Date.now()) / 1000)
    if (remainingSeconds > 0) {
      return {
        error: `Muitas tentativas incorretas. Acesso bloqueado por segurança. Tente novamente em ${remainingSeconds} segundos.`
      }
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('Erro no Supabase signInWithPassword:', error.message)
    const errorMsg = (error.message || '').toLowerCase()
    const isNetworkOrTlsError =
      errorMsg.includes('fetch failed') ||
      errorMsg.includes('certificate') ||
      errorMsg.includes('econnrefused') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('network')

    if (isNetworkOrTlsError) {
      return {
        error: 'Falha temporária de conexão com o serviço de autenticação (rede/proxy). Por favor, tente novamente.',
      }
    }

    const attemptsCookie = cookieStore.get(`login_attempts_${emailKey}`)
    let attempts = attemptsCookie ? parseInt(attemptsCookie.value, 10) : 0
    attempts += 1

    if (attempts >= 5) {
      // Bloqueio de 5 minutos
      cookieStore.set(`login_lock_${emailKey}`, (Date.now() + 5 * 60 * 1000).toString(), {
        maxAge: 5 * 60,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      })
      cookieStore.delete(`login_attempts_${emailKey}`)
      return {
        error: 'Limite de 5 tentativas atingido. Acesso temporariamente bloqueado por 5 minutos por segurança.'
      }
    } else {
      cookieStore.set(`login_attempts_${emailKey}`, attempts.toString(), {
        maxAge: 15 * 60,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      })
      return {
        error: `E-mail ou senha incorretos. Tentativa ${attempts} de 5.`
      }
    }
  }

  if (data?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('active, role, is_super_admin, organization_id, organization:organizations(active)')
      .eq('id', data.user.id)
      .single()

    if (profile && !profile.active) {
      // Limpeza profunda de cookies para garantir que a sessão não persista
      const allCookies = cookieStore.getAll()
      for (const c of allCookies) {
        if (c.name.startsWith('sb-') || c.name.includes('supabase') || c.name.includes('auth')) {
          cookieStore.delete(c.name)
          cookieStore.set(c.name, '', { path: '/', maxAge: 0, expires: new Date(0) })
        }
      }
      try {
        await supabase.auth.signOut()
      } catch {}
      return { error: 'Acesso bloqueado: este usuário foi inativado pelo administrador.' }
    }

    if (profile && !profile.is_super_admin && (profile.organization as any)?.active === false) {
      const allCookies = cookieStore.getAll()
      for (const c of allCookies) {
        if (c.name.startsWith('sb-') || c.name.includes('supabase') || c.name.includes('auth')) {
          cookieStore.delete(c.name)
          cookieStore.set(c.name, '', { path: '/', maxAge: 0, expires: new Date(0) })
        }
      }
      try {
        await supabase.auth.signOut()
      } catch {}
      return { error: 'Acesso bloqueado: a empresa associada a esta conta está inativada pelo administrador master.' }
    }
  }

  // Sucesso: limpar contadores de tentativas
  cookieStore.delete(`login_attempts_${emailKey}`)
  cookieStore.delete(`login_lock_${emailKey}`)

  return { success: true }
}

export async function signOutAction() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  for (const c of allCookies) {
    if (c.name.startsWith('sb-') || c.name.includes('supabase') || c.name.includes('auth')) {
      cookieStore.delete(c.name)
      cookieStore.set(c.name, '', { path: '/', maxAge: 0, expires: new Date(0) })
    }
  }

  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch (err) {
    console.error('Erro no signOut do Supabase:', err)
  }

  return { success: true }
}

// ==========================================
// 👥 GESTÃO DE USUÁRIOS DA EQUIPE (/usuarios)
// ==========================================

export async function getUsersAction() {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', admin.organization_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar usuários:', error.message)
    return []
  }
  return data || []
}

export async function createUserAction(formData: FormData) {
  const admin = await requireAdmin()
  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string
  const rawRole = (formData.get('role') as string) || 'operator'
  const role = (rawRole === 'admin' ? 'admin' : 'operator') as 'admin' | 'operator'

  if (!name || name.length < 2) {
    return { error: 'O nome do colaborador deve conter pelo menos 2 caracteres.' }
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return { error: 'Por favor, informe um endereço de e-mail corporativo válido.' }
  }
  if (!password || password.length < 6) {
    return { error: 'A senha provisória deve conter no mínimo 6 caracteres.' }
  }

  try {
    const supabase = await createClient()

    // 1. Validação prévia de duplicidade: checa se já existe colaborador com este e-mail
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, name')
      .ilike('email', email)
      .maybeSingle()

    if (existingProfile) {
      return { error: `Já existe um colaborador cadastrado com o e-mail "${email}".` }
    }

    // 2. Cria o usuário via API oficial do Supabase Auth (HTTPS / Porta 443)
    const authClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )

    const { data: signUpData, error: signUpError } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    })

    if (signUpError) {
      if (signUpError.message?.toLowerCase().includes('already registered')) {
        return { error: `Já existe um usuário cadastrado com o e-mail "${email}".` }
      }
      return { error: signUpError.message }
    }

    // No Supabase, se o e-mail já existir no auth.users, GoTrue retorna identities: [] por segurança anti-enumeração
    if (
      !signUpData?.user ||
      (Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0)
    ) {
      return {
        error: `Já existe uma conta registrada com o e-mail "${email}". Por favor, utilize outro endereço de e-mail.`,
      }
    }

    const userId = signUpData.user.id
    const nowIso = new Date().toISOString()

    // 3. Vincula o perfil à organização do administrador via cliente autenticado
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        organization_id: admin.organization_id,
        name,
        email,
        role,
        active: true,
      })

    if (profileError) {
      console.error('Erro ao vincular perfil do usuário:', profileError.message)
      return { error: 'Erro ao vincular perfil: ' + profileError.message }
    }

    revalidatePath('/usuarios')

    return {
      success: true,
      data: {
        id: String(userId),
        name,
        email,
        role,
        active: true,
        created_at: nowIso,
      },
    }
  } catch (err: any) {
    console.error('Erro ao criar usuário:', err)
    return { error: err.message || 'Erro ao registrar usuário.' }
  }
}

export async function toggleUserStatusAction(userId: string, active: boolean) {
  const admin = await requireAdmin()
  if (admin.id === userId) {
    return { error: 'Você não pode inativar sua própria conta.' }
  }

  const supabase = await createClient()

  // Anti-IDOR: verifica se o usuário pertence à organização do administrador
  const { data: targetProfile, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, role, organization_id, is_super_admin')
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr || !targetProfile || targetProfile.organization_id !== admin.organization_id) {
    return { error: 'Colaborador não encontrado na sua organização.' }
  }

  if (targetProfile.is_super_admin && !admin.is_super_admin) {
    return { error: 'Não é permitido alterar o status de um super administrador.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', userId)
    .eq('organization_id', admin.organization_id)

  if (error) return { error: error.message }
  revalidatePath('/usuarios')
  return { success: true }
}

export async function deleteUserAction(userId: string) {
  const admin = await requireAdmin()
  if (admin.id === userId) {
    return { error: 'Você não pode excluir sua própria conta de administrador.' }
  }

  const supabase = await createClient()

  // Anti-IDOR Crítico: Garante que o usuário pertence estritamente à organização do admin logado
  const { data: targetProfile, error: profileCheckError } = await supabase
    .from('profiles')
    .select('id, organization_id, role, is_super_admin')
    .eq('id', userId)
    .maybeSingle()

  if (profileCheckError || !targetProfile || targetProfile.organization_id !== admin.organization_id) {
    return { error: 'Colaborador não encontrado na sua organização.' }
  }

  if (targetProfile.is_super_admin && !admin.is_super_admin) {
    return { error: 'Não é permitido excluir um super administrador.' }
  }

  const { error: deleteErr } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
    .eq('organization_id', admin.organization_id)

  if (deleteErr) {
    return { error: deleteErr.message }
  }

  revalidatePath('/usuarios')
  return { success: true }
}

// ==========================================
// 🏢 EMPRESAS
// ==========================================

export async function getOrCreateTenantCompanyId(supabase: any, organizationId?: string): Promise<string | null> {
  if (!organizationId) return null
  const { data: comp } = await supabase
    .from('companies')
    .select('id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (comp?.id) return comp.id

  const { data: org } = await supabase
    .from('organizations')
    .select('name, cnpj')
    .eq('id', organizationId)
    .single()

  if (org) {
    const { data: newComp } = await supabase
      .from('companies')
      .insert({
        organization_id: organizationId,
        name: org.name,
        cnpj: org.cnpj || '00.000.000/0001-00',
      })
      .select('id')
      .single()
    if (newComp?.id) return newComp.id
  }
  return null
}

export async function getCompanies(organizationId?: string) {
  const user = await getCurrentUser()
  if (!user) return []

  const targetOrgId = (user.is_super_admin && organizationId) ? organizationId : user.organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('organization_id', targetOrgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar empresas:', error.message)
    return []
  }

  if ((!data || data.length === 0) && targetOrgId) {
    const defaultId = await getOrCreateTenantCompanyId(supabase, targetOrgId)
    if (defaultId) {
      const { data: refreshed } = await supabase
        .from('companies')
        .select('*')
        .eq('id', defaultId)
        .eq('organization_id', targetOrgId)
      return refreshed || []
    }
  }

  return data || []
}

export async function createCompany(formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const rawName = (formData.get('name') as string)?.trim()
  const rawCnpj = (formData.get('cnpj') as string)?.trim()
  const rawContact = (formData.get('contact') as string)?.trim()
  const rawPhone = (formData.get('phone') as string)?.trim()
  const rawEmail = (formData.get('email') as string)?.trim().toLowerCase()
  const rawWebsite = (formData.get('website') as string)?.trim()

  if (!rawName || rawName.length < 2) {
    return { error: 'O nome da empresa deve conter pelo menos 2 caracteres.' }
  }

  const cnpjClean = rawCnpj ? rawCnpj.replace(/\D/g, '') : ''
  if (cnpjClean && cnpjClean.length !== 14) {
    return { error: 'O CNPJ informado é inválido (deve conter 14 dígitos numéricos).' }
  }
  const formattedCnpj = cnpjClean ? formatCNPJ(cnpjClean) : (rawCnpj || null)

  let validEmail: string | null = null
  if (rawEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return { error: 'O e-mail corporativo informado é inválido.' }
    }
    validEmail = rawEmail
  }

  let validWebsite: string | null = null
  if (rawWebsite) {
    validWebsite = rawWebsite.startsWith('http://') || rawWebsite.startsWith('https://')
      ? rawWebsite
      : `https://${rawWebsite}`
  }

  const targetOrgId = user.organization_id
  if (!targetOrgId) {
    return { error: 'Organização não identificada na sessão do administrador.' }
  }

  const insertObj: any = {
    name: rawName,
    cnpj: formattedCnpj,
    contact: rawContact || null,
    phone: rawPhone || null,
    email: validEmail,
    website: validWebsite,
    organization_id: targetOrgId,
  }

  const { data, error } = await supabase
    .from('companies')
    .insert([insertObj])
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/empresas')
  return { success: true, data }
}

export async function updateCompany(id: string, formData: FormData) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const rawName = (formData.get('name') as string)?.trim()
  const rawCnpj = (formData.get('cnpj') as string)?.trim()
  const rawContact = (formData.get('contact') as string)?.trim()
  const rawPhone = (formData.get('phone') as string)?.trim()
  const rawEmail = (formData.get('email') as string)?.trim().toLowerCase()
  const rawWebsite = (formData.get('website') as string)?.trim()

  if (!rawName || rawName.length < 2) {
    return { error: 'O nome da empresa deve conter pelo menos 2 caracteres.' }
  }

  const cnpjClean = rawCnpj ? rawCnpj.replace(/\D/g, '') : ''
  if (cnpjClean && cnpjClean.length !== 14) {
    return { error: 'O CNPJ informado é inválido (deve conter 14 dígitos numéricos).' }
  }
  const formattedCnpj = cnpjClean ? formatCNPJ(cnpjClean) : (rawCnpj || null)

  let validEmail: string | null = null
  if (rawEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return { error: 'O e-mail corporativo informado é inválido.' }
    }
    validEmail = rawEmail
  }

  let validWebsite: string | null = null
  if (rawWebsite) {
    validWebsite = rawWebsite.startsWith('http://') || rawWebsite.startsWith('https://')
      ? rawWebsite
      : `https://${rawWebsite}`
  }

  const targetOrgId = user.organization_id
  if (!targetOrgId) {
    return { error: 'Organização não identificada na sessão do administrador.' }
  }

  const { data, error } = await supabase
    .from('companies')
    .update({
      name: rawName,
      cnpj: formattedCnpj,
      contact: rawContact || null,
      phone: rawPhone || null,
      email: validEmail,
      website: validWebsite,
    })
    .eq('id', id)
    .eq('organization_id', targetOrgId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/empresas')
  revalidatePath('/filiais')
  revalidatePath('/motoristas')
  return { success: true, data }
}

export async function deleteCompany(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const targetOrgId = user.organization_id
  if (!targetOrgId) {
    return { error: 'Organização não identificada.' }
  }

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id)
    .eq('organization_id', targetOrgId)

  if (error) {
    if (error.message?.includes('foreign key') || (error as any).code === '23503') {
      return {
        error: 'Não é possível excluir esta empresa pois existem filiais, motoristas ou viagens vinculadas a ela. Realoque ou remova os vínculos primeiro.'
      }
    }
    return { error: error.message }
  }

  revalidatePath('/empresas')
  revalidatePath('/filiais')
  revalidatePath('/motoristas')
  return { success: true }
}

// ==========================================
// 📍 FILIAIS
// ==========================================

export async function getBranches(organizationId?: string) {
  const user = await requireAuth().catch(() => null)
  if (!user) return []

  // Previne IDOR/BOLA: usuário comum só acessa a própria organização
  const targetOrgId = (user.is_super_admin && organizationId) ? organizationId : user.organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, code, city, state, email, phone, contact, company_id, created_at, companies(name)')
    .eq('organization_id', targetOrgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar filiais:', error.message)
    return []
  }
  return data || []
}

export async function createBranch(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const name = ((formData.get('name') as string) || '').trim()
  const code = ((formData.get('code') as string) || '').trim().toUpperCase()
  const city = ((formData.get('city') as string) || '').trim()
  const state = ((formData.get('state') as string) || '').trim().toUpperCase().slice(0, 2)
  const email = ((formData.get('email') as string) || '').trim() || null
  const phone = ((formData.get('phone') as string) || '').trim() || null
  const contact = ((formData.get('contact') as string) || '').trim() || null

  if (!name || name.length < 3) {
    return { error: 'O nome da filial deve ter pelo menos 3 caracteres.' }
  }

  const { data, error } = await supabase
    .from('branches')
    .insert([
      {
        company_id: company_id || null,
        name,
        code: code || null,
        city: city || null,
        state: state || null,
        email,
        phone,
        contact,
        organization_id: user.organization_id,
      },
    ])
    .select('id, name, code, city, state, email, phone, contact, company_id, created_at, companies(name)')
    .single()

  if (error) {
    console.error('Erro ao cadastrar filial:', error)
    return { error: error.message }
  }
  revalidatePath('/filiais')
  return { success: true, data }
}

export async function updateBranch(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const name = ((formData.get('name') as string) || '').trim()
  const code = ((formData.get('code') as string) || '').trim().toUpperCase()
  const city = ((formData.get('city') as string) || '').trim()
  const state = ((formData.get('state') as string) || '').trim().toUpperCase().slice(0, 2)
  const email = ((formData.get('email') as string) || '').trim() || null
  const phone = ((formData.get('phone') as string) || '').trim() || null
  const contact = ((formData.get('contact') as string) || '').trim() || null

  if (!name || name.length < 3) {
    return { error: 'O nome da filial deve ter pelo menos 3 caracteres.' }
  }

  const { data, error } = await supabase
    .from('branches')
    .update({
      company_id: company_id || null,
      name,
      code: code || null,
      city: city || null,
      state: state || null,
      email,
      phone,
      contact,
    })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, code, city, state, email, phone, contact, company_id, created_at, companies(name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/filiais')
  return { success: true, data }
}

export async function deleteBranch(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) {
    if (error.message.includes('foreign key') || error.code === '23503') {
      return { error: 'Não é possível excluir esta filial pois existem transportes vinculados a ela.' }
    }
    return { error: error.message }
  }

  revalidatePath('/filiais')
  return { success: true }
}

// ==========================================
// 🚛 MOTORISTAS
// ==========================================

/**
 * Normaliza dígitos de CPF para 11 caracteres (preservando zeros à esquerda quando entre 8 e 11 dígitos).
 */
function normalizeCpfDigits(rawCpf?: string | null): string {
  const digits = String(rawCpf || '').replace(/\D/g, '')
  if (digits.length >= 8 && digits.length <= 11) {
    return digits.padStart(11, '0')
  }
  return digits
}

/**
 * Busca todos os motoristas da organização paginando em ondas de 1.000 registros
 * sem depender de `{ count: 'exact' }` (que pode falhar ou truncar em joins do PostgREST).
 */
async function fetchAllDriversForOrganization(supabase: any, targetOrgId: string) {
  const PAGE_SIZE = 1000
  const WAVE_PAGES = 5 // Busca até 5.000 registros por onda paralela
  const MAX_RECORDS = 50000
  const selectColumns =
    'id, name, cpf, phone, default_plate, pin, company_id, telegram_chat_id, telegram_username, created_at, companies(name)'

  const allDrivers: any[] = []
  let offset = 0

  while (offset < MAX_RECORDS) {
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < WAVE_PAGES; i++) {
      const from = offset + i * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      ranges.push([from, to])
    }

    const waveResults = await Promise.all(
      ranges.map(([from, to]) =>
        supabase
          .from('drivers')
          .select(selectColumns)
          .eq('organization_id', targetOrgId)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
    )

    let reachedEnd = false
    for (const res of waveResults) {
      if (res.error) {
        console.error('Erro ao buscar página de motoristas:', res.error.message)
        if (allDrivers.length === 0) {
          return { data: [], error: res.error }
        }
        reachedEnd = true
        break
      }

      const rows = res.data || []
      if (rows.length > 0) {
        allDrivers.push(...rows)
      }
      if (rows.length < PAGE_SIZE) {
        reachedEnd = true
        break
      }
    }

    if (reachedEnd) {
      break
    }

    offset += WAVE_PAGES * PAGE_SIZE
  }

  return { data: allDrivers, error: null }
}

export async function getDrivers(organizationId?: string) {
  const user = await requireAuth().catch(() => null)
  if (!user) return []

  // Previne IDOR/BOLA: usuário comum só acessa a própria organização
  const targetOrgId = (user.is_super_admin && organizationId) ? organizationId : user.organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  const { data } = await fetchAllDriversForOrganization(supabase, targetOrgId)

  // Deduplica visualmente caso existam registros duplicados de testes anteriores (priorizando quem tem placa ou vínculo Telegram)
  const seenKeys = new Map<string, any>()
  for (const drv of data || []) {
    const cpfKey = normalizeCpfDigits(drv.cpf)
    const nameKey = String(drv.name || '').toUpperCase().replace(/\s+/g, ' ').trim()
    const key = cpfKey.length === 11 ? `cpf:${cpfKey}` : `name:${nameKey}`

    const existing = seenKeys.get(key)
    if (!existing) {
      seenKeys.set(key, drv)
    } else {
      const existingScore = (existing.default_plate ? 2 : 0) + (existing.telegram_chat_id ? 2 : 0)
      const currentScore = (drv.default_plate ? 2 : 0) + (drv.telegram_chat_id ? 2 : 0)
      if (currentScore > existingScore) {
        seenKeys.set(key, drv)
      }
    }
  }

  return Array.from(seenKeys.values())
}

export async function createDriver(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id: garante que a empresa pertence à organização do usuário
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const name = ((formData.get('name') as string) || '').trim()
  const cpf = ((formData.get('cpf') as string) || '').replace(/\D/g, '')
  const phone = ((formData.get('phone') as string) || '').trim()
  const default_plate = ((formData.get('default_plate') as string) || '').trim().toUpperCase()
  const pin = ((formData.get('pin') as string) || '').trim()
  const telegram_chat_id = ((formData.get('telegram_chat_id') as string) || '').trim() || null
  const telegram_username = ((formData.get('telegram_username') as string) || '').trim() || null

  if (!name || name.length < 3) {
    return { error: 'Nome do motorista deve ter pelo menos 3 caracteres.' }
  }

  const cleanPhone = phone.replace(/\D/g, '')
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return { error: 'Telefone inválido. Digite DDD + número (ex: 11999998888).' }
  }

  if (cpf && cpf.length !== 11) {
    return { error: 'CPF deve conter 11 dígitos numéricos.' }
  }

  if (!pin || !/^\d{4}$/.test(pin)) {
    return { error: 'O PIN de acesso deve ser composto exatamente por 4 dígitos numéricos.' }
  }

  const { data, error } = await supabase
    .from('drivers')
    .insert([
      {
        company_id: company_id || null,
        name,
        cpf: cpf || null,
        phone,
        default_plate: default_plate || null,
        pin,
        telegram_chat_id,
        telegram_username,
        organization_id: user.organization_id,
      },
    ])
    .select('id, name, cpf, phone, default_plate, pin, company_id, telegram_chat_id, telegram_username, created_at, companies(name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/motoristas')
  return { success: true, data }
}

export async function updateDriver(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id na edição
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const name = ((formData.get('name') as string) || '').trim()
  const cpf = ((formData.get('cpf') as string) || '').replace(/\D/g, '')
  const phone = ((formData.get('phone') as string) || '').trim()
  const default_plate = ((formData.get('default_plate') as string) || '').trim().toUpperCase()
  const pin = ((formData.get('pin') as string) || '').trim()
  const telegram_chat_id = ((formData.get('telegram_chat_id') as string) || '').trim() || null
  const telegram_username = ((formData.get('telegram_username') as string) || '').trim() || null

  if (!name || name.length < 3) {
    return { error: 'Nome do motorista deve ter pelo menos 3 caracteres.' }
  }

  const cleanPhone = phone.replace(/\D/g, '')
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return { error: 'Telefone inválido. Digite DDD + número (ex: 11999998888).' }
  }

  if (cpf && cpf.length !== 11) {
    return { error: 'CPF deve conter 11 dígitos numéricos.' }
  }

  const updatePayload: Record<string, any> = {
    company_id: company_id || null,
    name,
    cpf: cpf || null,
    phone,
    default_plate: default_plate || null,
    telegram_chat_id,
    telegram_username,
  }

  if (pin) {
    if (!/^\d{4}$/.test(pin)) {
      return { error: 'O PIN de acesso deve ser composto exatamente por 4 dígitos numéricos.' }
    }
    updatePayload.pin = pin
  }

  const { data, error } = await supabase
    .from('drivers')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, cpf, phone, default_plate, pin, company_id, telegram_chat_id, telegram_username, created_at, companies(name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/motoristas')
  return { success: true, data }
}

export async function deleteDriver(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('drivers')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) {
    if (error.message.includes('foreign key') || error.code === '23503') {
      return { error: 'Não é possível excluir este motorista pois existem transportes vinculados a ele.' }
    }
    return { error: error.message }
  }

  revalidatePath('/motoristas')
  return { success: true }
}

export interface SswDriverImportDetail {
  name: string
  phone: string
  previousPhone?: string
  maskedCpf: string
  pin: string
  status: 'criado' | 'atualizado'
}

export async function importSswDriversAction(
  input: Ssw047ParseResult | string,
  targetCompanyId?: string
): Promise<{
  success: boolean
  error?: string
  totalRecords?: number
  validMobileCount?: number
  ignoredEmptyPhone?: number
  ignoredLandlineOrInvalid?: number
  ignoredBlockedCount?: number
  blockedDrivers?: BlockedSswDriverInfo[]
  unchangedCount?: number
  createdCount?: number
  updatedCount?: number
  changedDetails?: SswDriverImportDetail[]
  createdDrivers?: any[]
  updatedDrivers?: any[]
}> {
  try {
    const user = await requireAuth()
    if (!user.organization_id) {
      return { success: false, error: 'Organização do usuário não identificada.' }
    }

    const parsed: Ssw047ParseResult =
      typeof input === 'string' ? parseSsw047DriversReport(input) : input

    if (parsed?.isMatricialFormat) {
      return {
        success: false,
        error:
          'Formato Matricial (Impressão) detectado. No SSW, o relatório de impressão omite a coluna de Celular/WhatsApp e corta o nome dos motoristas. Por favor, gere o mesmo relatório "047 - Relação de Motoristas" no SSW selecionando a opção de exportação em Excel / CSV.',
      }
    }

    if (!parsed || !parsed.isValidReport || parsed.totalRecords === 0) {
      return {
        success: false,
        error:
          'O arquivo enviado não foi reconhecido como um relatório "047 - Relação de Motoristas" (formato Excel/CSV) válido do SSW.',
      }
    }

    const supabase = await createClient()

    // Valida ou obtém a empresa padrão da organização
    let companyId = (targetCompanyId || '').trim()
    if (companyId) {
      const { data: comp } = await supabase
        .from('companies')
        .select('id')
        .eq('id', companyId)
        .eq('organization_id', user.organization_id)
        .maybeSingle()

      if (!comp) {
        return { success: false, error: 'Empresa vinculada inválida.' }
      }
    } else {
      companyId = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
    }

    // Carrega todos os motoristas existentes na organização (sem limite de 1.000 do PostgREST) para deduplicação rápida em memória
    const { data: existingList, error: fetchError } = await fetchAllDriversForOrganization(
      supabase,
      user.organization_id
    )

    if (fetchError) {
      return { success: false, error: 'Falha ao consultar base de motoristas: ' + fetchError.message }
    }

    const byCpf = new Map<string, any>()
    const byNameFull = new Map<string, any>()
    const byName30 = new Map<string, any>()
    const duplicateIdsToDelete: string[] = []

    const scoreDriverRecord = (drv: any) =>
      (drv.default_plate ? 4 : 0) + (drv.telegram_chat_id ? 4 : 0) + (drv.cpf ? 2 : 0)

    for (const existing of existingList || []) {
      const cleanExistingCpf = normalizeCpfDigits(existing.cpf)
      const normName = String(existing.name || '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim()
      const normNamePrefix = normName.slice(0, 30)

      if (cleanExistingCpf.length === 11) {
        const prev = byCpf.get(cleanExistingCpf)
        if (!prev) {
          byCpf.set(cleanExistingCpf, existing)
        } else {
          // Se havia duplicata de testes anteriores (quando o limite de 1.000 estava ativo), mantém o registro principal e agenda a limpeza da duplicata
          if (scoreDriverRecord(existing) > scoreDriverRecord(prev)) {
            duplicateIdsToDelete.push(prev.id)
            byCpf.set(cleanExistingCpf, existing)
          } else {
            duplicateIdsToDelete.push(existing.id)
          }
        }
      }

      if (normName && !byNameFull.has(normName)) {
        byNameFull.set(normName, existing)
      }
      if (normNamePrefix && !byName30.has(normNamePrefix)) {
        byName30.set(normNamePrefix, existing)
      }
    }

    // Limpa automaticamente eventuais duplicatas geradas em testes anteriores
    if (duplicateIdsToDelete.length > 0) {
      const DELETE_CHUNK = 200
      for (let i = 0; i < duplicateIdsToDelete.length; i += DELETE_CHUNK) {
        const chunkIds = duplicateIdsToDelete.slice(i, i + DELETE_CHUNK)
        await supabase
          .from('drivers')
          .delete()
          .in('id', chunkIds)
          .eq('organization_id', user.organization_id)
      }
    }

    const maskCpfHelper = (cpfDigits: string) => {
      if (cpfDigits.length !== 11) return '***.***.***-**'
      return `***.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-**`
    }

    const toInsert: Array<{
      company_id: string | null
      name: string
      cpf: string
      phone: string
      pin: string
      organization_id: string
    }> = []

    const toUpdate: Array<{
      id: string
      cpf: string
      phone: string
      pin: string
      previousPhone: string
      name: string
    }> = []

    let unchangedCount = 0
    const changedDetails: SswDriverImportDetail[] = []
    const seenInBatch = new Set<string>()

    for (const drv of parsed.validMobileDrivers) {
      const cleanCpf = normalizeCpfDigits(drv.cpf)
      const cleanPhone = (drv.cleanPhone || drv.phone || '').replace(/\D/g, '')
      const pin = (drv.pin || cleanCpf.slice(-4)).replace(/\D/g, '')
      const name = (drv.name || '').trim()

      if (name.length < 3 || cleanCpf.length !== 11 || cleanPhone.length !== 11 || pin.length !== 4) {
        continue
      }

      if (seenInBatch.has(cleanCpf)) {
        continue
      }
      seenInBatch.add(cleanCpf)

      const normName = name.toUpperCase().replace(/\s+/g, ' ').trim()
      const normName30 = normName.slice(0, 30)
      const existing =
        byCpf.get(cleanCpf) ||
        byNameFull.get(normName) ||
        byName30.get(normName30)

      if (!existing) {
        toInsert.push({
          company_id: companyId || null,
          name,
          cpf: cleanCpf,
          phone: drv.phone,
          pin,
          organization_id: user.organization_id,
        })
        changedDetails.push({
          name,
          phone: drv.phone,
          maskedCpf: maskCpfHelper(cleanCpf),
          pin,
          status: 'criado',
        })
      } else {
        const existingCleanPhone = (existing.phone || '').replace(/\D/g, '')
        const existingCleanCpf = normalizeCpfDigits(existing.cpf)

        const phoneChanged = existingCleanPhone !== cleanPhone
        const cpfWasMissing = existingCleanCpf !== cleanCpf

        if (!phoneChanged && !cpfWasMissing) {
          // Registro idêntico: ignora silenciosamente conforme regra de reimportação
          unchangedCount += 1
        } else {
          toUpdate.push({
            id: existing.id,
            cpf: cleanCpf,
            phone: drv.phone,
            pin: existing.pin && /^\d{4}$/.test(existing.pin) ? existing.pin : pin,
            previousPhone: existing.phone || '',
            name: existing.name || name,
          })
          changedDetails.push({
            name: existing.name || name,
            phone: drv.phone,
            previousPhone: phoneChanged ? existing.phone || undefined : undefined,
            maskedCpf: maskCpfHelper(cleanCpf),
            pin: existing.pin && /^\d{4}$/.test(existing.pin) ? existing.pin : pin,
            status: 'atualizado',
          })
        }
      }
    }

    const createdDrivers: any[] = []
    const updatedDrivers: any[] = []

    // Inserção em lotes (chunks de 200) para suportar milhares de registros com alta performance
    const CHUNK_SIZE = 200
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE)
      const { data: insertedRows, error: insertError } = await supabase
        .from('drivers')
        .insert(chunk)
        .select(
          'id, name, cpf, phone, default_plate, pin, company_id, telegram_chat_id, telegram_username, created_at, companies(name)'
        )

      if (insertError) {
        console.error('Erro ao inserir lote de motoristas SSW:', insertError.message)
        return {
          success: false,
          error: 'Erro ao gravar lote de motoristas no banco: ' + insertError.message,
        }
      }
      if (insertedRows) {
        createdDrivers.push(...insertedRows)
      }
    }

    // Atualização em lotes paralelos controlados (25 por vez)
    const UPDATE_BATCH_SIZE = 25
    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + UPDATE_BATCH_SIZE)
      const results = await Promise.all(
        batch.map((item) =>
          supabase
            .from('drivers')
            .update({
              cpf: item.cpf,
              phone: item.phone,
              pin: item.pin,
            })
            .eq('id', item.id)
            .eq('organization_id', user.organization_id)
            .select(
              'id, name, cpf, phone, default_plate, pin, company_id, telegram_chat_id, telegram_username, created_at, companies(name)'
            )
            .single()
        )
      )

      for (const res of results) {
        if (res.data) {
          updatedDrivers.push(res.data)
        }
      }
    }

    revalidatePath('/motoristas')

    return {
      success: true,
      totalRecords: parsed.totalRecords,
      validMobileCount: parsed.validMobileDrivers.length,
      ignoredEmptyPhone: parsed.ignoredEmptyPhone,
      ignoredLandlineOrInvalid: parsed.ignoredLandlineOrInvalid,
      ignoredBlockedCount: parsed.ignoredBlockedCount ?? 0,
      blockedDrivers: parsed.blockedDrivers ?? [],
      unchangedCount,
      createdCount: createdDrivers.length,
      updatedCount: updatedDrivers.length,
      changedDetails,
      createdDrivers,
      updatedDrivers,
    }
  } catch (err: any) {
    console.error('Erro em importSswDriversAction:', err)
    return {
      success: false,
      error: err?.message || 'Erro inesperado ao importar relação de motoristas do SSW.',
    }
  }
}

// ==========================================
// 📦 VIAGENS / TRANSPORTES
// ==========================================

export type TripsPeriodFilter = '7d' | '30d' | 'all'

export async function getTrips(organizationId?: string, period: TripsPeriodFilter = '7d') {
  let targetOrgId = organizationId
  if (!targetOrgId) {
    const user = await requireAuth().catch(() => null)
    targetOrgId = user?.organization_id
  }

  // Fail-secure: nunca executa consulta aberta sem organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  let query = supabase
    .from('trips')
    .select(`
      id,
      cte_number,
      cte_key,
      recipients,
      sefaz_metadata,
      service_type,
      status,
      sender,
      sender_id,
      destination,
      invoices,
      token,
      arrival_time,
      completion_time,
      created_at,
      organization_id,
      driver_id,
      company_id,
      branch_id,
      telegram_chat_id,
      last_driver_latitude,
      last_driver_longitude,
      delivery_receipt_url,
      companies(name),
      branches(name, code, city),
      drivers(name, phone, default_plate, telegram_chat_id, telegram_username)
    `)
    .eq('organization_id', targetOrgId)

  if (period === '7d' || period === '30d') {
    const days = period === '7d' ? 7 : 30
    let referenceNowMs = Date.now()
    try {
      const dbRes = await getDbPool().query('SELECT NOW() AS db_now')
      if (dbRes.rows[0]?.db_now) {
        referenceNowMs = new Date(dbRes.rows[0].db_now).getTime()
      }
    } catch {
      // Fallback para Date.now() local
    }
    const cutoffIso = new Date(referenceNowMs - days * 24 * 60 * 60 * 1000).toISOString()
    query = query.or(
      `created_at.gte.${cutoffIso},completion_time.gte.${cutoffIso},status.in.(pending,in_transit,arrived,unloading)`
    )
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(period === 'all' ? 500 : 200)

  if (error) {
    console.error('Erro ao buscar transportes:', error.message)
    return []
  }
  return data || []
}

export async function getTripsByPeriodAction(period: TripsPeriodFilter) {
  const user = await requireAuth()
  return getTrips(user.organization_id, period)
}


/**
 * ⚡ Consulta e Decodifica Chave de 44 dígitos do DACTE (Bipe / Leitor Óptico)
 */
export async function lookupCteByKeyAction(cteKey: string) {
  try {
    const user = await requireAuth()
    const orgId = user.organization_id
    if (!orgId) return { success: false, error: 'Sessão do usuário não identificada.' }

    const cleanKey = (cteKey || '').replace(/\D/g, '')
    if (cleanKey.length !== 44) {
      return { success: false, error: 'A chave do CT-e deve conter exatamente 44 dígitos numéricos.' }
    }

    const cUF = cleanKey.slice(0, 2)
    const aamm = cleanKey.slice(2, 6)
    const emitCnpj = cleanKey.slice(6, 20)
    const mod = cleanKey.slice(20, 22)
    const serie = parseInt(cleanKey.slice(22, 25), 10)
    const cteNumber = String(parseInt(cleanKey.slice(25, 34), 10))
    const tpEmis = cleanKey.slice(34, 35)

    const supabase = await createClient()

    // 1. Verifica se já existe uma viagem com esta chave ou número de CT-e na organização
    const { data: existingTrip } = await supabase
      .from('trips')
      .select('id, token, cte_number, cte_key, created_at, destination, drivers(name)')
      .eq('organization_id', orgId)
      .or(`cte_key.eq.${cleanKey},cte_number.eq.${cteNumber}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 2. Tenta identificar a filial emissora cadastrada correspondente
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name, code, city')
      .eq('organization_id', orgId)

    let matchedBranchId: string | null = null
    if (branches && branches.length > 0) {
      if (emitCnpj.includes('000486')) {
        const bGuarulhos = branches.find(
          (b) => b.name?.toLowerCase().includes('guarulhos') || b.city?.toLowerCase().includes('guarulhos')
        )
        if (bGuarulhos) matchedBranchId = bGuarulhos.id
      } else if (emitCnpj.includes('000133')) {
        const bMatriz = branches.find(
          (b) => b.name?.toLowerCase().includes('matriz')
        )
        if (bMatriz) matchedBranchId = bMatriz.id
      }
      if (!matchedBranchId) matchedBranchId = branches[0].id
    }

    return {
      success: true,
      alreadyExists: !!existingTrip,
      existingTrip: existingTrip || null,
      keyData: {
        cleanKey,
        cteNumber,
        serie,
        mod,
        emitCnpj,
        aamm: `${aamm.slice(2, 4)}/20${aamm.slice(0, 2)}`,
        cUF,
        tpEmis,
      },
      matchedBranchId,
    }
  } catch (err: any) {
    console.error('Erro em lookupCteByKeyAction:', err)
    return { success: false, error: err?.message || 'Falha ao consultar chave do CT-e.' }
  }
}

/**
 * 📄 Parser e Vinculador Rápido de XML de CT-e para Emissão Expressa
 */
export async function parseCteXmlAction(xmlContent: string, autoCreateEntities: boolean = false) {
  try {
    const user = await requireAuth()
    const orgId = user.organization_id
    if (!orgId) return { success: false, error: 'Sessão do usuário não identificada.' }

    if (!xmlContent || typeof xmlContent !== 'string') {
      return { success: false, error: 'Conteúdo XML vazio ou inválido.' }
    }

    const cteData = parseCTeXml(xmlContent)
    if (!cteData) {
      return { success: false, error: 'Não foi possível ler as tags do CT-e. Verifique se o arquivo é um XML de CT-e (mod 57) válido.' }
    }

    const supabase = await createClient()

    // 1. Verifica se já existe viagem cadastrada com esta chave
    const { data: existingTrip } = await supabase
      .from('trips')
      .select('id, token, cte_number, cte_key, created_at, destination, drivers(name)')
      .eq('organization_id', orgId)
      .or(`cte_key.eq.${cteData.chCTe},cte_number.eq.${cteData.nCT}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 2. Busca empresa padrão para vinculação
    const companyId = (await getOrCreateTenantCompanyId(supabase, orgId)) || null

    // 3. Localiza ou cria Remetente
    let matchedSenderId: string | null = null
    let matchedSender: any = null
    const cleanRemCnpj = cteData.remCnpj ? cteData.remCnpj.replace(/\D/g, '') : ''
    const normRemNome = (cteData.remNome || '').toLowerCase().trim()

    const { data: senders } = await supabase
      .from('senders')
      .select('id, name, cnpj, city, phone, email, company_id')
      .eq('organization_id', orgId)

    // Busca prioritária por CNPJ exato (apenas dígitos)
    let senderFound = cleanRemCnpj
      ? senders?.find((s) => (s.cnpj || '').replace(/\D/g, '') === cleanRemCnpj)
      : null

    // Fallback: busca por nome (caso o cadastro esteja sem CNPJ ou com formatação diferente)
    if (!senderFound && normRemNome.length >= 3) {
      senderFound = senders?.find((s) => {
        const sName = (s.name || '').toLowerCase().trim()
        return sName && (normRemNome.includes(sName) || sName.includes(normRemNome.slice(0, 15)))
      })
    }

    if (senderFound) {
      matchedSenderId = senderFound.id
      matchedSender = senderFound
    } else if (autoCreateEntities && (cteData.remCnpj || cteData.remNome)) {
      const { data: newSender } = await supabase
        .from('senders')
        .insert([
          {
            name: cteData.remNome || 'Remetente CT-e',
            cnpj: cteData.remCnpj || null,
            address: cteData.remEndereco || null,
            city: cteData.remCidade || null,
            phone: cteData.remTelefone || null,
            company_id: companyId,
            organization_id: orgId,
          },
        ])
        .select('id, name, cnpj, city, phone, email, company_id')
        .single()
      if (newSender) {
        matchedSenderId = newSender.id
        matchedSender = newSender
      }
    }

    // 4. Localiza ou cria Destinatário
    let matchedRecipientId: string | null = null
    let matchedRecipient: any = null
    const cleanDestCnpj = cteData.destCnpj ? cteData.destCnpj.replace(/\D/g, '') : ''
    const normDestNome = (cteData.destNome || '').toLowerCase().trim()

    const { data: recipients } = await supabase
      .from('recipients')
      .select('id, name, cnpj, city, address, email, sender_id, company_id')
      .eq('organization_id', orgId)

    // Busca prioritária por CNPJ do destinatário
    let recFound = cleanDestCnpj
      ? recipients?.find((r) => (r.cnpj || '').replace(/\D/g, '') === cleanDestCnpj)
      : null

    // Fallback por nome
    if (!recFound && normDestNome.length >= 3) {
      recFound = recipients?.find((r) => {
        const rName = (r.name || '').toLowerCase().trim()
        return rName && (normDestNome.includes(rName) || rName.includes(normDestNome.slice(0, 15)))
      })
    }

    if (recFound) {
      matchedRecipientId = recFound.id
      matchedRecipient = recFound
    } else if (autoCreateEntities && matchedSenderId && (cteData.destCnpj || cteData.destNome)) {
      const { data: newRec } = await supabase
        .from('recipients')
        .insert([
          {
              name: cteData.destNome || 'Destinatário CT-e',
              cnpj: cteData.destCnpj,
              address: cteData.destEndereco || null,
              city: cteData.destCidade || null,
              phone: cteData.destTelefone || null,
              sender_id: matchedSenderId,
              company_id: companyId,
              organization_id: orgId,
            },
          ])
          .select('id, name, cnpj, city, address, email, sender_id')
          .single()
        if (newRec) {
          matchedRecipientId = newRec.id
          matchedRecipient = newRec
        }
    }

    // 5. Localiza motorista pela placa do veículo
    let matchedDriverId: string | null = null
    let matchedDriverName: string | null = null
    if (cteData.placa) {
      const cleanPlaca = cteData.placa.replace(/[-\s]/g, '').toUpperCase()
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, name, default_plate')
        .eq('organization_id', orgId)

      const driverFound = drivers?.find(
        (d) => (d.default_plate || '').replace(/[-\s]/g, '').toUpperCase() === cleanPlaca
      )
      if (driverFound) {
        matchedDriverId = driverFound.id
        matchedDriverName = driverFound.name
      }
    }

    // 6. Localiza filial
    let matchedBranchId: string | null = null
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name, city')
      .eq('organization_id', orgId)

    if (branches && branches.length > 0 && cteData.emitCnpj) {
      if (cteData.emitCnpj.includes('000486')) {
        const bGuarulhos = branches.find(
          (b) => b.name?.toLowerCase().includes('guarulhos') || b.city?.toLowerCase().includes('guarulhos')
        )
        if (bGuarulhos) matchedBranchId = bGuarulhos.id
      }
      if (!matchedBranchId) matchedBranchId = branches[0].id
    }

    const sefazMetadata = {
      weight_kg: cteData.weightKg ?? null,
      cargo_value: cteData.cargoValue ?? null,
      cargo_type: cteData.cargoType ?? null,
      freight_value: cteData.vFrete ?? null,
      rntrc: cteData.rntrc ?? null,
      observations: cteData.observations ?? null,
      plate: cteData.placa ?? null,
      emitter_cnpj: cteData.emitCnpj ?? null,
      emitter_name: cteData.emitNome ?? null,
      issue_date: cteData.dhEmi ?? null,
      serie: cteData.serie ?? null,
      origin_city: cteData.remCidade && cteData.remUf ? `${cteData.remCidade}/${cteData.remUf}` : null,
      destination_city: cteData.destCidade && cteData.destUf ? `${cteData.destCidade}/${cteData.destUf}` : null,
    }

    return {
      success: true,
      alreadyExists: !!existingTrip,
      existingTrip: existingTrip || null,
      cteData,
      sefazMetadata,
      matchedSenderId,
      matchedSender,
      matchedRecipientId,
      matchedRecipient,
      matchedDriverId,
      matchedDriverName,
      matchedBranchId,
    }
  } catch (err: any) {
    console.error('Erro em parseCteXmlAction:', err)
    return { success: false, error: err?.message || 'Falha ao processar arquivo XML do CT-e.' }
  }
}

export async function createTrip(payload: {
  company_id?: string
  branch_id?: string
  driver_id: string
  cte_number?: string
  cte_key?: string
  sefaz_metadata?: any
  service_type: string
  status: string
  sender?: string
  sender_id?: string
  sender_email?: string
  destination: string
  invoices: string[]
  recipient_email?: string
  recipients?: Array<{ name: string; destination: string; invoices: string; email?: string }>
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  const orgId = user.organization_id
  if (!orgId) {
    return { error: 'Organização não identificada na sessão do usuário.' }
  }

  if (!payload.driver_id) {
    return { error: 'O motorista condutor é obrigatório.' }
  }
  if (!payload.destination?.trim()) {
    return { error: 'O destino da carga é obrigatório.' }
  }

  // Anti-IDOR: valida se o motorista pertence estritamente à mesma organização
  const { data: driverCheck } = await supabase
    .from('drivers')
    .select('id, name, phone')
    .eq('id', payload.driver_id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!driverCheck) {
    return { error: 'O motorista selecionado não foi encontrado ou não pertence à sua organização.' }
  }

  // Anti-IDOR: valida remetente se informado
  if (payload.sender_id) {
    const { data: senderCheck } = await supabase
      .from('senders')
      .select('id')
      .eq('id', payload.sender_id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!senderCheck) {
      return { error: 'O remetente selecionado não foi encontrado ou não pertence à sua organização.' }
    }
  }

  // Anti-IDOR: valida empresa transportadora
  let company_id = payload.company_id || null
  if (company_id) {
    const { data: companyCheck } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!companyCheck) {
      company_id = (await getOrCreateTenantCompanyId(supabase, orgId)) || null
    }
  } else {
    company_id = (await getOrCreateTenantCompanyId(supabase, orgId)) || null
  }

  // Anti-IDOR: valida filial se informada
  let branch_id = payload.branch_id || null
  if (branch_id) {
    const { data: branchCheck } = await supabase
      .from('branches')
      .select('id')
      .eq('id', branch_id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!branchCheck) {
      branch_id = null
    }
  }

  // Token criptograficamente seguro com alta entropia (8 caracteres hexadecimais)
  const token = crypto.randomBytes(4).toString('hex').toUpperCase()

  // Whitelist de tipos de serviço e status
  const allowedServiceTypes = ['Estadia', 'Descarga', 'Reentrega', 'Devolução', 'Armazenagem']
  const service_type = allowedServiceTypes.includes(payload.service_type) ? payload.service_type : 'Estadia'

  const allowedStatuses = ['in_transit', 'arrived', 'unloading', 'finished']
  const status = allowedStatuses.includes(payload.status) ? payload.status : 'in_transit'

  let recipient_email: string | null = null
  if (payload.recipient_email?.trim()) {
    const emailNorm = payload.recipient_email.trim().toLowerCase()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      recipient_email = emailNorm
    }
  }

  let sender_email: string | null = null
  if (payload.sender_email?.trim()) {
    const sEmailNorm = payload.sender_email.trim().toLowerCase()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sEmailNorm)) {
      sender_email = sEmailNorm
    }
  }

  // Se não foi informado diretamente, busca o e-mail cadastrado no Remetente selecionado
  if (!sender_email && payload.sender_id) {
    const { data: senderCheck } = await supabase
      .from('senders')
      .select('email')
      .eq('id', payload.sender_id)
      .maybeSingle()

    if (senderCheck?.email) {
      sender_email = senderCheck.email.trim().toLowerCase()
    }
  }

  const initialMeta = appendTripAuditEvent(payload.sefaz_metadata || {}, {
    type: 'CREATED',
    title: 'Viagem criada no Painel de Controle',
    description: `Transporte emitido para ${payload.destination.trim()} com motorista ${driverCheck.name}. Serviço: ${service_type}.`,
    channel: 'painel_web',
    actor: user.name || user.email || 'Operador',
  })

  const insertObj: any = {
    company_id,
    branch_id,
    driver_id: payload.driver_id,
    cte_number: payload.cte_number?.trim() || null,
    cte_key: payload.cte_key?.trim() || null,
    sefaz_metadata: initialMeta,
    service_type,
    status,
    sender: payload.sender?.trim() || null,
    sender_id: payload.sender_id || null,
    destination: payload.destination.trim(),
    invoices: payload.invoices || [],
    recipients: payload.recipients || [],
    token,
    organization_id: orgId,
  }

  if (recipient_email) {
    insertObj.recipient_email = recipient_email
  }

  if (sender_email) {
    insertObj.sender_email = sender_email
  }

  let { data, error } = await supabase
    .from('trips')
    .insert([insertObj])
    .select(`
      *,
      drivers(name, phone)
    `)
    .single()

  if (error && error.message?.includes('recipient_email')) {
    delete insertObj.recipient_email
    const retry = await supabase
      .from('trips')
      .insert([insertObj])
      .select(`
        *,
        drivers(name, phone)
      `)
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    return { error: error.message }
  }

  // Disparo automático via WhatsApp (não-bloqueante)
  try {
    if (data?.drivers?.phone) {
      sendTripWhatsAppPrompt(data).catch((err) =>
        console.warn('⚠️ [WhatsApp] Aviso ao disparar mensagem inicial da viagem:', err)
      )
    }
  } catch (waErr) {
    console.warn('⚠️ [WhatsApp] Falha silenciosa no disparo WhatsApp da viagem:', waErr)
  }

  revalidatePath('/')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function sendWhatsAppTripStatusPromptAction(tripId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      *,
      drivers(name, phone)
    `)
    .eq('id', tripId)
    .eq('organization_id', user.organization_id)
    .single()

  if (error || !trip) {
    return { success: false, error: 'Transporte não encontrado ou não pertence à sua organização.' }
  }

  if (!trip.drivers?.phone) {
    return { success: false, error: 'O motorista deste transporte não possui telefone cadastrado.' }
  }

  const result = await sendTripWhatsAppPrompt(trip)
  if (!result.success) {
    return { success: false, error: result.error || 'Erro ao enviar mensagem via WhatsApp Meta.' }
  }

  try {
    const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
      type: 'NOTIFICATION_SENT',
      title: 'Cobrança de status enviada via WhatsApp',
      description: `Mensagem disparada para ${trip.drivers?.name || 'Motorista'} (${trip.drivers?.phone}).`,
      channel: 'whatsapp',
      actor: user.name || user.email || 'Operador',
    })
    await supabase.from('trips').update({ sefaz_metadata: updatedMeta }).eq('id', tripId)
    revalidatePath('/')
  } catch {}

  return { success: true, message: 'Mensagem de cobrança enviada com sucesso no WhatsApp do motorista!' }
}

export async function sendTelegramTripStatusPromptAction(tripId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      *,
      drivers(name, phone, telegram_chat_id, telegram_username)
    `)
    .eq('id', tripId)
    .eq('organization_id', user.organization_id)
    .single()

  if (error || !trip) {
    return { success: false, error: 'Transporte não encontrado ou não pertence à sua organização.' }
  }

  const telegramChatId = trip.telegram_chat_id || trip.drivers?.telegram_chat_id
  const telegramLink = getTelegramTripDeepLink(trip.token)

  if (!telegramChatId) {
    return {
      success: false,
      notLinked: true,
      telegramLink,
      message: 'O motorista ainda não iniciou o bot no Telegram.',
    }
  }

  const result = await sendTripTelegramPrompt(telegramChatId, trip)
  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Erro ao enviar mensagem via Telegram Bot.',
      telegramLink,
    }
  }

  try {
    const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
      type: 'NOTIFICATION_SENT',
      title: 'Acompanhamento enviado via Bot Telegram',
      description: `Solicitação interativa enviada no Telegram para ${trip.drivers?.name || 'Motorista'}.`,
      channel: 'telegram',
      actor: user.name || user.email || 'Operador',
    })
    await supabase.from('trips').update({ sefaz_metadata: updatedMeta }).eq('id', tripId)
    revalidatePath('/')
  } catch {}

  return {
    success: true,
    message: 'Mensagem de acompanhamento enviada com sucesso no Telegram do motorista!',
    telegramLink,
  }
}

export async function getTripTelegramLinkAction(tripId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, token, telegram_chat_id, drivers(name, phone, telegram_chat_id, telegram_username)')
    .eq('id', tripId)
    .eq('organization_id', user.organization_id)
    .single()

  if (error || !trip) {
    return { success: false, error: 'Viagem não encontrada.' }
  }

  const telegramLink = getTelegramTripDeepLink(trip.token)
  const isLinked = Boolean(trip.telegram_chat_id || (trip.drivers as any)?.telegram_chat_id)

  return {
    success: true,
    telegramLink,
    isLinked,
    token: trip.token,
  }
}

export async function updateTrip(
  id: string,
  payload: {
    cte_number?: string
    service_type?: string
    sender?: string
    destination?: string
    invoices?: string[]
    driver_id?: string
    status?: string
  }
) {
  const user = await requireAuth()

  // Trava de segurança: apenas administradores podem cancelar viagens
  if (payload.status === 'cancelled' && user.role !== 'admin') {
    return { error: 'Permissão negada: apenas administradores podem cancelar um transporte.' }
  }

  const supabase = await createClient()

  // Anti-IDOR: se for informada alteração de motorista, valida se pertence à organização do usuário
  if (payload.driver_id) {
    const { data: driverCheck } = await supabase
      .from('drivers')
      .select('id')
      .eq('id', payload.driver_id)
      .eq('organization_id', user.organization_id)
      .maybeSingle()

    if (!driverCheck) {
      return { error: 'O motorista selecionado não pertence à sua organização.' }
    }
  }

  const { data: currentTripData } = await supabase
    .from('trips')
    .select('sefaz_metadata, status, destination')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .maybeSingle()

  const updateData: any = {}
  if (payload.cte_number !== undefined) updateData.cte_number = payload.cte_number?.trim() || null
  if (payload.service_type !== undefined) updateData.service_type = payload.service_type
  if (payload.sender !== undefined) updateData.sender = payload.sender?.trim() || null
  if (payload.destination !== undefined) updateData.destination = payload.destination?.trim() || null
  if (payload.invoices !== undefined) updateData.invoices = payload.invoices
  if (payload.driver_id !== undefined) updateData.driver_id = payload.driver_id
  if (payload.status !== undefined) updateData.status = payload.status

  if (currentTripData) {
    const isCancel = payload.status === 'cancelled'
    updateData.sefaz_metadata = appendTripAuditEvent(currentTripData.sefaz_metadata, {
      type: isCancel ? 'TRIP_CANCELLED' : 'TRIP_UPDATED',
      title: isCancel ? 'Transporte cancelado' : 'Dados do transporte editados no Painel',
      description: isCancel
        ? `Transporte cancelado pelo administrador ${user.name || user.email}.`
        : `Dados cadastrais/operacionais da viagem atualizados no painel.`,
      channel: 'painel_web',
      actor: user.name || user.email || 'Operador',
    })
  }

  const { data, error } = await supabase
    .from('trips')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select(`
      id,
      cte_number,
      service_type,
      status,
      sender,
      sender_id,
      destination,
      invoices,
      token,
      sefaz_metadata,
      arrival_time,
      completion_time,
      created_at,
      organization_id,
      driver_id,
      company_id,
      branch_id,
      companies(name, contact, phone, email, website),
      drivers(name, phone, default_plate)
    `)
    .single()

  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true, data }
}

export async function cancelTrip(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('trips')
    .select('sefaz_metadata')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .maybeSingle()

  const updatedMeta = appendTripAuditEvent(existing?.sefaz_metadata, {
    type: 'TRIP_CANCELLED',
    title: 'Viagem cancelada',
    description: `Viagem cancelada manualmente pelo administrador ${user.name || user.email}.`,
    channel: 'painel_web',
    actor: user.name || user.email || 'Administrador',
  })

  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'cancelled', sefaz_metadata: updatedMeta })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true, data }
}

export async function deleteTrip(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true }
}

// ==========================================
// 📱 TELEMETRIA E MOTORISTA (SEM LOGIN)
// ==========================================

export async function registerCheckin(
  tripId: string,
  formData?: FormData,
  lat?: number,
  lng?: number
) {
  const supabase = await createClient()

  // 1. Verificação de integridade e autorização
  const { data: currentTrip, error: tripCheckError } = await supabase
    .from('trips')
    .select('id, token, status, arrival_time, sefaz_metadata, drivers(name)')
    .eq('id', tripId)
    .single()

  if (tripCheckError || !currentTrip) {
    return { error: 'Viagem não encontrada.' }
  }

  // Validação de Autorização: Cookie ativo do motorista para a viagem OU usuário logado (operador/admin)
  const cookieStore = await cookies()
  const isDriverAuth = cookieStore.get(`driver_auth_${currentTrip.token.toUpperCase()}`)?.value === 'true'
  const user = await getCurrentUser().catch(() => null)

  if (!isDriverAuth && !user) {
    return { error: 'Acesso não autorizado. Identifique-se com seu PIN para registrar a chegada.' }
  }

  let photoUrl: string | null = null

  if (formData) {
    const file = formData.get('photo') as File | null
    if (file && file.size > 0) {
      // Validação de Tamanho Máximo (10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024
      if (file.size > MAX_FILE_SIZE) {
        return { error: 'A foto excede o limite máximo permitido de 10MB.' }
      }

      // Validação Estrita de MIME Type
      const ALLOWED_MIME_TYPES: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      }
      const safeExt = ALLOWED_MIME_TYPES[file.type]
      if (!safeExt) {
        return { error: 'Formato de foto inválido. São permitidos apenas arquivos JPEG, PNG e WebP.' }
      }

      const fileName = `checkin_${tripId}_${Date.now()}.${safeExt}`

      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('trip-photos')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage
            .from('trip-photos')
            .getPublicUrl(uploadData.path)
          photoUrl = urlData.publicUrl
        } else {
          // Fallback resiliente: se o bucket do Storage não existir ou não tiver permissão pública, utiliza Data URL base64
          const buffer = Buffer.from(await file.arrayBuffer())
          photoUrl = `data:${file.type};base64,${buffer.toString('base64')}`
        }
      } catch (storageErr) {
        const buffer = Buffer.from(await file.arrayBuffer())
        photoUrl = `data:${file.type};base64,${buffer.toString('base64')}`
      }
    }
  }

  const arrivalTime = new Date().toISOString()
  const actorName = user ? (user.name || user.email || 'Operador') : ((currentTrip.drivers as any)?.name || 'Motorista')
  const channel = user ? 'painel_web' : 'motorista_web'

  const updatedMeta = appendTripAuditEvent(currentTrip.sefaz_metadata, {
    type: 'ARRIVED',
    title: 'Chegada registrada na portaria / cliente',
    description: `Check-in de chegada realizado${lat && lng ? ` com geolocalização GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})` : ''}${photoUrl ? ' e foto anexada' : ''}.`,
    channel,
    actor: actorName,
    timestamp: arrivalTime,
    lat: lat || null,
    lng: lng || null,
    photoUrl: photoUrl || null,
  })

  const updatePayload: any = {
    status: 'arrived',
    arrival_time: arrivalTime,
    checkin_lat: lat || null,
    checkin_lng: lng || null,
    sefaz_metadata: updatedMeta,
  }

  if (photoUrl) {
    updatePayload.checkin_photo_url = photoUrl
  }

  const { data, error } = await supabase
    .from('trips')
    .update(updatePayload)
    .eq('id', tripId)
    .select(`
      *,
      drivers(name, phone),
      companies(name, contact, phone, email, website),
      branches(name, code, city, state, email, phone, contact),
      senders(id, name, email)
    `)
    .single()

  if (error) {
    return { error: error.message }
  }

  // Disparo de e-mail em background com after() (Next.js) para não bloquear o motorista
  const trip = data
  after(async () => {
    try {
      if (!trip) return
      let targetEmail: string | null = null

      // O e-mail de notificação deve ser enviado para o REMETENTE
      if (trip.senders?.email) {
        targetEmail = trip.senders.email
      } else if (trip.sender_email) {
        targetEmail = trip.sender_email
      } else if (trip.sender_id) {
        const { data: sData } = await supabase
          .from('senders')
          .select('email')
          .eq('id', trip.sender_id)
          .maybeSingle()
        if (sData?.email) {
          targetEmail = sData.email
        }
      }

      // Se ainda não encontrou e temos o nome do remetente salvo na viagem
      if (!targetEmail && trip.sender) {
        let sQuery = supabase
          .from('senders')
          .select('name, email')
          .not('email', 'is', null)

        if (trip.organization_id) {
          sQuery = sQuery.eq('organization_id', trip.organization_id)
        }

        const { data: senderList } = await sQuery
        if (senderList && senderList.length > 0) {
          const sLower = trip.sender.toLowerCase()
          const matched = senderList.find((s: any) => {
            if (!s.email) return false
            const sName = (s.name || '').toLowerCase()
            return sLower.includes(sName) || sName.includes(sLower)
          })
          if (matched?.email) {
            targetEmail = matched.email
          }
        }
      }

      // Fallback seguro caso o remetente não possua e-mail configurado
      if (!targetEmail) {
        targetEmail = trip.recipient_email || null
      }

      if (targetEmail) {
        let destName = trip.destination || 'Destinatário'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        const extraCc = await getActiveCcEmails(trip.organization_id)

        let branchData = trip.branches
        if (!branchData && (trip.company_id || trip.organization_id)) {
          let bQuery = supabase
            .from('branches')
            .select('name, code, city, state, email, phone, contact')
          if (trip.organization_id) {
            bQuery = bQuery.eq('organization_id', trip.organization_id)
          } else if (trip.company_id) {
            bQuery = bQuery.eq('company_id', trip.company_id)
          }
          const { data: fbBranch } = await bQuery.limit(1).maybeSingle()
          if (fbBranch) {
            branchData = fbBranch
          }
        }

        const branchEmail = branchData?.email?.trim()
        if (branchEmail && branchEmail.includes('@') && !extraCc.includes(branchEmail)) {
          extraCc.push(branchEmail)
        }

        const operationalInfo = {
          name: branchData?.name
            ? `${trip.companies?.name || 'AuditCargo'} - Filial ${branchData.name}`
            : (trip.companies?.name || 'AuditCargo'),
          contact: branchData?.contact || trip.companies?.contact || 'Atendimento Operacional',
          phone: branchData?.phone || trip.companies?.phone || undefined,
          email: branchEmail || trip.companies?.email || undefined,
          website: trip.companies?.website,
        }

        await sendArrivalEmail({
          toEmail: targetEmail,
          destinationName: destName,
          destinationCity: destCity,
          invoices: trip.invoices || [],
          arrivalTime: arrivalTime,
          cteNumber: trip.cte_number,
          driverName: trip.drivers?.name,
          serviceType: trip.service_type,
          sender: trip.sender,
          companyInfo: operationalInfo,
          checkinPhotoUrl: photoUrl || trip.checkin_photo_url,
          extraCc,
        })
      }
    } catch (mailErr) {
      console.error('Erro em background ao processar e-mail de chegada:', mailErr)
    }
  })

  revalidatePath(`/v/${data.token}`)
  revalidatePath('/')
  return {
    success: true,
    data,
    emailSent: true,
  }
}

export async function registerCheckout(tripId: string) {
  const supabase = await createClient()

  // 1. Verificação de integridade e autorização
  const { data: currentTrip, error: tripCheckError } = await supabase
    .from('trips')
    .select('id, token, status, arrival_time, sefaz_metadata, drivers(name)')
    .eq('id', tripId)
    .single()

  if (tripCheckError || !currentTrip) {
    return { error: 'Viagem não encontrada.' }
  }

  // Validação de Autorização: Cookie ativo do motorista para a viagem OU usuário logado (operador/admin)
  const cookieStore = await cookies()
  const isDriverAuth = cookieStore.get(`driver_auth_${currentTrip.token.toUpperCase()}`)?.value === 'true'
  const user = await getCurrentUser().catch(() => null)

  if (!isDriverAuth && !user) {
    return { error: 'Acesso não autorizado. Identifique-se com seu PIN para registrar a finalização.' }
  }

  const completionTime = new Date().toISOString()
  const actorName = user ? (user.name || user.email || 'Operador') : ((currentTrip.drivers as any)?.name || 'Motorista')
  const channel = user ? 'painel_web' : 'motorista_web'

  const updatedMeta = appendTripAuditEvent(currentTrip.sefaz_metadata, {
    type: 'FINISHED',
    title: 'Descarga concluída e veículo liberado',
    description: `Check-out e encerramento da viagem realizados por ${actorName}.`,
    channel,
    actor: actorName,
    timestamp: completionTime,
  })

  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'finished',
      completion_time: completionTime,
      sefaz_metadata: updatedMeta,
    })
    .eq('id', tripId)
    .select(`
      *,
      drivers(name, phone),
      companies(name, contact, phone, email, website),
      branches(name, code, city, state, email, phone, contact),
      senders(id, name, email)
    `)
    .single()

  if (error) {
    return { error: error.message }
  }

  // Disparo de e-mail em background com after() para resposta instantânea
  const trip = data
  after(async () => {
    try {
      if (!trip) return
      let targetEmail: string | null = null

      // O e-mail de notificação deve ser enviado para o REMETENTE
      if (trip.senders?.email) {
        targetEmail = trip.senders.email
      } else if (trip.sender_email) {
        targetEmail = trip.sender_email
      } else if (trip.sender_id) {
        const { data: sData } = await supabase
          .from('senders')
          .select('email')
          .eq('id', trip.sender_id)
          .maybeSingle()
        if (sData?.email) {
          targetEmail = sData.email
        }
      }

      // Se ainda não encontrou e temos o nome do remetente salvo na viagem
      if (!targetEmail && trip.sender) {
        let sQuery = supabase
          .from('senders')
          .select('name, email')
          .not('email', 'is', null)

        if (trip.organization_id) {
          sQuery = sQuery.eq('organization_id', trip.organization_id)
        }

        const { data: senderList } = await sQuery
        if (senderList && senderList.length > 0) {
          const sLower = trip.sender.toLowerCase()
          const matched = senderList.find((s: any) => {
            if (!s.email) return false
            const sName = (s.name || '').toLowerCase()
            return sLower.includes(sName) || sName.includes(sLower)
          })
          if (matched?.email) {
            targetEmail = matched.email
          }
        }
      }

      // Fallback seguro caso o remetente não possua e-mail configurado
      if (!targetEmail) {
        targetEmail = trip.recipient_email || null
      }

      if (targetEmail) {
        let destName = trip.destination || 'Destinatário'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        const extraCc = await getActiveCcEmails(trip.organization_id)

        let branchData = trip.branches
        if (!branchData && (trip.company_id || trip.organization_id)) {
          let bQuery = supabase
            .from('branches')
            .select('name, code, city, state, email, phone, contact')
          if (trip.organization_id) {
            bQuery = bQuery.eq('organization_id', trip.organization_id)
          } else if (trip.company_id) {
            bQuery = bQuery.eq('company_id', trip.company_id)
          }
          const { data: fbBranch } = await bQuery.limit(1).maybeSingle()
          if (fbBranch) {
            branchData = fbBranch
          }
        }

        const branchEmail = branchData?.email?.trim()
        if (branchEmail && branchEmail.includes('@') && !extraCc.includes(branchEmail)) {
          extraCc.push(branchEmail)
        }

        const operationalInfo = {
          name: branchData?.name
            ? `${trip.companies?.name || 'AuditCargo'} - Filial ${branchData.name}`
            : (trip.companies?.name || 'AuditCargo'),
          contact: branchData?.contact || trip.companies?.contact || 'Atendimento Operacional',
          phone: branchData?.phone || trip.companies?.phone || undefined,
          email: branchEmail || trip.companies?.email || undefined,
          website: trip.companies?.website,
        }

        await sendCompletionEmail({
          toEmail: targetEmail,
          destinationName: destName,
          destinationCity: destCity,
          invoices: trip.invoices || [],
          arrivalTime: trip.arrival_time,
          departureTime: completionTime,
          cteNumber: trip.cte_number,
          driverName: trip.drivers?.name,
          serviceType: trip.service_type,
          sender: trip.sender,
          companyInfo: operationalInfo,
          extraCc,
        })
      }
    } catch (mailErr) {
      console.error('Erro em background ao processar e-mail de saída:', mailErr)
    }
  })

  revalidatePath(`/v/${data.token}`)
  revalidatePath('/')
  return {
    success: true,
    data,
    emailSent: true,
  }
}

export async function revertCheckin(tripId: string) {
  const supabase = await createClient()

  // 1. Verificação de integridade e autorização
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, token, arrival_time, sefaz_metadata, drivers(name)')
    .eq('id', tripId)
    .single()

  if (tripError || !trip) {
    return { error: 'Viagem não encontrada.' }
  }

  const cookieStore = await cookies()
  const isDriverAuth = cookieStore.get(`driver_auth_${trip.token.toUpperCase()}`)?.value === 'true'
  const user = await getCurrentUser().catch(() => null)

  if (!isDriverAuth && !user) {
    return { error: 'Acesso não autorizado para desfazer este registro.' }
  }

  // 2. Janela de tolerância para motoristas (15 minutos para evitar fraude em demurrage)
  if (!user && trip.arrival_time) {
    const elapsedMinutes = (Date.now() - new Date(trip.arrival_time).getTime()) / (1000 * 60)
    if (elapsedMinutes > 15) {
      return {
        error: 'O prazo de 15 minutos para desfazer o registro de chegada expirou. Em caso de engano, solicite a retificação à central de logística.'
      }
    }
  }

  const actorName = user ? (user.name || user.email || 'Operador') : ((trip.drivers as any)?.name || 'Motorista')
  const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
    type: 'ARRIVAL_REVERTED',
    title: 'Registro de chegada desfeito (Rollback)',
    description: `O check-in de chegada foi revertido para o status Em Trânsito por ${actorName}.`,
    channel: user ? 'painel_web' : 'motorista_web',
    actor: actorName,
  })

  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'in_transit',
      arrival_time: null,
      checkin_lat: null,
      checkin_lng: null,
      checkin_photo_url: null,
      sefaz_metadata: updatedMeta,
    })
    .eq('id', tripId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/v/${data.token}`)
  revalidatePath('/')
  return { success: true, data }
}

export async function revertCheckout(tripId: string) {
  const supabase = await createClient()

  // 1. Verificação de integridade e autorização
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('id, token, completion_time, sefaz_metadata, drivers(name)')
    .eq('id', tripId)
    .single()

  if (tripError || !trip) {
    return { error: 'Viagem não encontrada.' }
  }

  const cookieStore = await cookies()
  const isDriverAuth = cookieStore.get(`driver_auth_${trip.token.toUpperCase()}`)?.value === 'true'
  const user = await getCurrentUser().catch(() => null)

  if (!isDriverAuth && !user) {
    return { error: 'Acesso não autorizado para desfazer este registro.' }
  }

  // 2. Janela de tolerância para motoristas (15 minutos)
  if (!user && trip.completion_time) {
    const elapsedMinutes = (Date.now() - new Date(trip.completion_time).getTime()) / (1000 * 60)
    if (elapsedMinutes > 15) {
      return {
        error: 'O prazo de 15 minutos para desfazer a finalização expirou. Em caso de engano, solicite a retificação à central de logística.'
      }
    }
  }

  const actorName = user ? (user.name || user.email || 'Operador') : ((trip.drivers as any)?.name || 'Motorista')
  const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
    type: 'FINISH_REVERTED',
    title: 'Conclusão desfeita (Retorno para Portaria)',
    description: `A finalização da viagem foi desfeita e o veículo retornou para Na Portaria por ${actorName}.`,
    channel: user ? 'painel_web' : 'motorista_web',
    actor: actorName,
  })

  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'arrived',
      completion_time: null,
      sefaz_metadata: updatedMeta,
    })
    .eq('id', tripId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/v/${data.token}`)
  revalidatePath('/')
  return { success: true, data }
}

export async function verifyDriverPin(token: string, pin: string) {
  const tokenUpper = token.toUpperCase()
  const cookieStore = await cookies()

  // 1. Proteção de Força Bruta (Rate Limiting por Cookie de Bloqueio)
  const lockCookie = cookieStore.get(`pin_lock_${tokenUpper}`)
  if (lockCookie) {
    const unlockAt = parseInt(lockCookie.value, 10)
    const remainingSeconds = Math.ceil((unlockAt - Date.now()) / 1000)
    if (remainingSeconds > 0) {
      return {
        error: `Muitas tentativas incorretas. Acesso temporariamente bloqueado. Tente novamente em ${remainingSeconds} segundos.`
      }
    }
  }

  const supabase = await createClient()

  const { data: trip } = await supabase
    .from('trips')
    .select('id, sefaz_metadata, drivers(name, pin)')
    .eq('token', tokenUpper)
    .single()

  if (!trip) return { error: 'Viagem não encontrada.' }

  // @ts-ignore
  const driverPin = trip.drivers?.pin || '1234'

  if (pin !== driverPin) {
    const attemptsCookie = cookieStore.get(`pin_attempts_${tokenUpper}`)
    let attempts = attemptsCookie ? parseInt(attemptsCookie.value, 10) : 0
    attempts += 1

    if (attempts >= 5) {
      // Bloqueia tentativas por 5 minutos
      cookieStore.set(`pin_lock_${tokenUpper}`, (Date.now() + 5 * 60 * 1000).toString(), {
        maxAge: 5 * 60,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      })
      cookieStore.delete(`pin_attempts_${tokenUpper}`)
      return {
        error: 'Limite de 5 tentativas atingido. Acesso bloqueado por 5 minutos por segurança.'
      }
    } else {
      cookieStore.set(`pin_attempts_${tokenUpper}`, attempts.toString(), {
        maxAge: 15 * 60,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      })
      return {
        error: `PIN incorreto. Tentativa ${attempts} de 5.`
      }
    }
  }

  // Sucesso: remove bloqueios e registra sessão segura
  cookieStore.delete(`pin_attempts_${tokenUpper}`)
  cookieStore.delete(`pin_lock_${tokenUpper}`)
  cookieStore.set(`driver_auth_${tokenUpper}`, 'true', {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
  })

  try {
    const driverName = (trip.drivers as any)?.name || 'Motorista'
    const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
      type: 'DRIVER_AUTH',
      title: 'Motorista autenticado com PIN no Link da Viagem',
      description: `O motorista ${driverName} desbloqueou o painel de acompanhamento (/v/${tokenUpper}) utilizando PIN de segurança.`,
      channel: 'motorista_web',
      actor: driverName,
    })
    await supabase.from('trips').update({ sefaz_metadata: updatedMeta }).eq('id', trip.id)
  } catch {}

  revalidatePath(`/v/${token}`)
  revalidatePath('/')
  return { success: true }
}

/**
 * Rota de autoresgate do motorista:
 * Busca a viagem ativa do motorista através de seu CPF ou Telefone + PIN.
 * Inclui proteção contra força bruta (rate limiting) e consulta SQL indexada.
 */
export async function findActiveTripForDriver(identifier: string, pin: string) {
  const cleanId = identifier.replace(/\D/g, '')
  if (!cleanId || cleanId.length < 8) {
    return { error: 'Informe um CPF ou Telefone válido (apenas números).' }
  }

  const cookieStore = await cookies()
  const lockKey = `rescue_lock_${cleanId}`
  const attemptsKey = `rescue_attempts_${cleanId}`

  // 1. Proteção contra Força Bruta (Rate Limiting de 5 tentativas / 5 minutos)
  const lockCookie = cookieStore.get(lockKey)
  if (lockCookie) {
    const unlockAt = parseInt(lockCookie.value, 10)
    const remainingSeconds = Math.ceil((unlockAt - Date.now()) / 1000)
    if (remainingSeconds > 0) {
      return {
        error: `Muitas tentativas incorretas. Acesso bloqueado por segurança. Tente novamente em ${remainingSeconds} segundos.`
      }
    }
  }

  const supabase = await createClient()

  // 2. Consulta SQL filtrada diretamente no banco de dados (evita carregar tabela inteira em memória)
  const orFilters = [
    `cpf.eq.${cleanId}`,
    `phone.ilike.%${cleanId}%`
  ]

  if (cleanId.length === 11) {
    const formattedCpf = `${cleanId.slice(0, 3)}.${cleanId.slice(3, 6)}.${cleanId.slice(6, 9)}-${cleanId.slice(9)}`
    orFilters.push(`cpf.eq.${formattedCpf}`)
  }

  const last8 = cleanId.slice(-8)
  orFilters.push(`phone.ilike.%${last8}%`)

  const { data: matchedDrivers, error: driverErr } = await supabase
    .from('drivers')
    .select('id, name, pin, cpf, phone')
    .or(orFilters.join(','))
    .limit(5)

  if (driverErr || !matchedDrivers || matchedDrivers.length === 0) {
    return { error: 'Nenhum motorista encontrado com este documento ou telefone.' }
  }

  const matchedDriver = matchedDrivers.find((d: any) => {
    const dCpf = (d.cpf || '').replace(/\D/g, '')
    const dPhone = (d.phone || '').replace(/\D/g, '')
    return (
      (cleanId.length >= 11 && dCpf === cleanId) ||
      dPhone === cleanId ||
      dPhone.endsWith(last8)
    )
  })

  if (!matchedDriver) {
    return { error: 'Motorista não localizado no sistema.' }
  }

  const driverPin = matchedDriver.pin || '1234'
  if (pin !== driverPin) {
    const attemptsCookie = cookieStore.get(attemptsKey)
    let attempts = attemptsCookie ? parseInt(attemptsCookie.value, 10) : 0
    attempts += 1

    if (attempts >= 5) {
      cookieStore.set(lockKey, (Date.now() + 5 * 60 * 1000).toString(), {
        maxAge: 5 * 60,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      })
      cookieStore.delete(attemptsKey)
      return {
        error: 'Limite de 5 tentativas atingido. Acesso bloqueado por 5 minutos por segurança.'
      }
    } else {
      cookieStore.set(attemptsKey, attempts.toString(), {
        maxAge: 15 * 60,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      })
      return {
        error: `PIN incorreto. Tentativa ${attempts} de 5.`
      }
    }
  }

  // PIN correto: remove contadores de erro
  cookieStore.delete(attemptsKey)
  cookieStore.delete(lockKey)

  // 3. Busca viagem ativa para esse motorista
  const { data: activeTrip } = await supabase
    .from('trips')
    .select('token, status, created_at')
    .eq('driver_id', matchedDriver.id)
    .neq('status', 'finished')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!activeTrip) {
    return { error: `Olá, ${matchedDriver.name}! Não encontramos nenhuma viagem em andamento no momento.` }
  }

  // 4. Autoriza cookie preventivo de autenticação com atributos de segurança
  const tokenUpper = activeTrip.token.toUpperCase()
  cookieStore.set(`driver_auth_${tokenUpper}`, 'true', {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
  })

  return { success: true, token: activeTrip.token }
}

// ==========================================
// 🏢 REMETENTES
// ==========================================

export async function getSenders(organizationId?: string) {
  const user = await requireAuth().catch(() => null)
  if (!user) return []

  // Previne IDOR/BOLA: usuário comum só acessa a própria organização
  const targetOrgId = (user.is_super_admin && organizationId) ? organizationId : user.organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('senders')
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, franchise_hours, demurrage_hourly_rate, vehicle_franchises, company_id, created_at, companies(name), recipients(*)')
    .eq('organization_id', targetOrgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar remetentes:', error.message)
    return []
  }
  return data || []
}

export async function createSender(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const name = ((formData.get('name') as string) || '').trim()
  const address = ((formData.get('address') as string) || '').trim()
  const city = ((formData.get('city') as string) || '').trim()
  const zip_code = ((formData.get('zip_code') as string) || '').trim()
  const cnpj = ((formData.get('cnpj') as string) || '').trim()
  const ie = ((formData.get('ie') as string) || '').trim()
  const phone = ((formData.get('phone') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim().toLowerCase()
  const rawFranchise = formData.get('franchise_hours') ? parseFloat(formData.get('franchise_hours') as string) : 0
  const franchise_hours = isNaN(rawFranchise) || rawFranchise < 0 ? 0 : rawFranchise
  const rawDemurrage = formData.get('demurrage_hourly_rate') ? parseFloat(formData.get('demurrage_hourly_rate') as string) : 0
  const demurrage_hourly_rate = isNaN(rawDemurrage) || rawDemurrage < 0 ? 0 : rawDemurrage
  const rawVehicleFranchises = (formData.get('vehicle_franchises') as string) || ''
  let vehicle_franchises: any[] = []
  if (rawVehicleFranchises) {
    try {
      vehicle_franchises = JSON.parse(rawVehicleFranchises)
    } catch (e) {
      vehicle_franchises = []
    }
  }

  if (!name || name.length < 3) {
    return { error: 'Razão Social / Nome do Remetente deve ter pelo menos 3 caracteres.' }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Formato de e-mail inválido para o remetente.' }
  }

  const { data, error } = await supabase
    .from('senders')
    .insert([
      {
        company_id: company_id || null,
        name,
        address: address || null,
        city: city || null,
        zip_code: zip_code || null,
        cnpj: cnpj || null,
        ie: ie || null,
        phone: phone || null,
        email: email || null,
        franchise_hours,
        demurrage_hourly_rate,
        vehicle_franchises,
        organization_id: user.organization_id,
      },
    ])
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, franchise_hours, demurrage_hourly_rate, vehicle_franchises, company_id, created_at, companies(name), recipients(*)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function updateSender(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const name = ((formData.get('name') as string) || '').trim()
  const address = ((formData.get('address') as string) || '').trim()
  const city = ((formData.get('city') as string) || '').trim()
  const zip_code = ((formData.get('zip_code') as string) || '').trim()
  const cnpj = ((formData.get('cnpj') as string) || '').trim()
  const ie = ((formData.get('ie') as string) || '').trim()
  const phone = ((formData.get('phone') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim().toLowerCase()
  const rawFranchise = formData.get('franchise_hours') ? parseFloat(formData.get('franchise_hours') as string) : 0
  const franchise_hours = isNaN(rawFranchise) || rawFranchise < 0 ? 0 : rawFranchise
  const rawDemurrage = formData.get('demurrage_hourly_rate') ? parseFloat(formData.get('demurrage_hourly_rate') as string) : 0
  const demurrage_hourly_rate = isNaN(rawDemurrage) || rawDemurrage < 0 ? 0 : rawDemurrage
  const rawVehicleFranchises = (formData.get('vehicle_franchises') as string) || ''
  let vehicle_franchises: any[] = []
  if (rawVehicleFranchises) {
    try {
      vehicle_franchises = JSON.parse(rawVehicleFranchises)
    } catch (e) {
      vehicle_franchises = []
    }
  }

  if (!name || name.length < 3) {
    return { error: 'Razão Social / Nome do Remetente deve ter pelo menos 3 caracteres.' }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Formato de e-mail inválido para o remetente.' }
  }

  const { data, error } = await supabase
    .from('senders')
    .update({
      company_id: company_id || null,
      name,
      address: address || null,
      city: city || null,
      zip_code: zip_code || null,
      cnpj: cnpj || null,
      ie: ie || null,
      phone: phone || null,
      email: email || null,
      franchise_hours,
      demurrage_hourly_rate,
      vehicle_franchises,
    })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, franchise_hours, demurrage_hourly_rate, vehicle_franchises, company_id, created_at, companies(name), recipients(*)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function deleteSender(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('senders')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) return { error: error.message }
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true }
}

export interface SswClientImportDetail {
  name: string
  cnpj: string
  city: string
  phone?: string
  status: 'criado' | 'atualizado'
  note?: string
}

export interface SswClientImportSummary {
  success: boolean
  error?: string
  totalRecords: number
  createdCount: number
  updatedCount: number
  unchangedCount: number
  changedDetails: SswClientImportDetail[]
}

/**
 * Importação em massa de Remetentes a partir do relatório de clientes SSW.
 */
export async function importSswSendersAction(
  clients: Array<{
    name: string
    cnpj: string
    formattedCnpj?: string
    ie?: string | null
    address?: string | null
    city?: string | null
    zipCode?: string | null
    phone?: string | null
    email?: string | null
  }>,
  companyId?: string
): Promise<SswClientImportSummary> {
  const user = await requireAuth()
  const supabase = await createClient()

  if (!Array.isArray(clients) || clients.length === 0) {
    return {
      success: false,
      error: 'Nenhum remetente válido enviado para importação.',
      totalRecords: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      changedDetails: [],
    }
  }

  // Previne IDOR em company_id
  let targetCompanyId = (companyId || '').trim()
  if (targetCompanyId) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', targetCompanyId)
      .eq('organization_id', user.organization_id)
      .single()
    if (!comp) {
      targetCompanyId = ''
    }
  }
  if (!targetCompanyId && user.organization_id) {
    targetCompanyId = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  // Carrega remetentes existentes para deduplicação
  const { data: existingSenders, error: fetchErr } = await supabase
    .from('senders')
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, franchise_hours, demurrage_hourly_rate')
    .eq('organization_id', user.organization_id)

  if (fetchErr) {
    return {
      success: false,
      error: 'Erro ao consultar remetentes existentes: ' + fetchErr.message,
      totalRecords: clients.length,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      changedDetails: [],
    }
  }

  const byCnpj = new Map<string, any>()
  const byName = new Map<string, any>()

  for (const s of existingSenders || []) {
    const cleanCnpj = (s.cnpj || '').replace(/\D/g, '')
    if (cleanCnpj.length >= 11) {
      byCnpj.set(cleanCnpj, s)
    }
    const normName = (s.name || '').toUpperCase().replace(/\s+/g, ' ').trim()
    if (normName) {
      byName.set(normName, s)
    }
  }

  const toInsert: any[] = []
  const toUpdate: any[] = []
  let unchangedCount = 0
  const changedDetails: SswClientImportDetail[] = []
  const seenInBatch = new Set<string>()

  for (const item of clients) {
    const name = (item.name || '').trim()
    const cleanCnpj = (item.cnpj || '').replace(/\D/g, '')
    if (!name || name.length < 3 || cleanCnpj.length < 11) continue

    if (seenInBatch.has(cleanCnpj)) continue
    seenInBatch.add(cleanCnpj)

    const normName = name.toUpperCase().replace(/\s+/g, ' ').trim()
    const existing = byCnpj.get(cleanCnpj) || byName.get(normName)

    const formattedDoc = item.formattedCnpj || cleanCnpj

    if (!existing) {
      toInsert.push({
        company_id: targetCompanyId || null,
        name,
        cnpj: formattedDoc,
        ie: item.ie || null,
        address: item.address || null,
        city: item.city || null,
        zip_code: item.zipCode || null,
        phone: item.phone || null,
        email: item.email || null,
        franchise_hours: 5,
        demurrage_hourly_rate: 65.0,
        vehicle_franchises: [],
        organization_id: user.organization_id,
      })
      changedDetails.push({
        name,
        cnpj: formattedDoc,
        city: item.city || '',
        phone: item.phone || undefined,
        status: 'criado',
      })
    } else {
      // Verifica se houve mudança relevante
      const existingCleanPhone = (existing.phone || '').replace(/\D/g, '')
      const newCleanPhone = (item.phone || '').replace(/\D/g, '')
      const phoneChanged = newCleanPhone && existingCleanPhone !== newCleanPhone
      const addressChanged = item.address && existing.address !== item.address
      const cityChanged = item.city && existing.city !== item.city
      const ieChanged = item.ie && existing.ie !== item.ie
      const emailChanged = item.email && existing.email !== item.email

      if (!phoneChanged && !addressChanged && !cityChanged && !ieChanged && !emailChanged) {
        unchangedCount++
      } else {
        toUpdate.push({
          id: existing.id,
          name: existing.name || name,
          cnpj: existing.cnpj || formattedDoc,
          ie: item.ie || existing.ie || null,
          address: item.address || existing.address || null,
          city: item.city || existing.city || null,
          zip_code: item.zipCode || existing.zip_code || null,
          phone: item.phone || existing.phone || null,
          email: item.email || existing.email || null,
        })
        changedDetails.push({
          name: existing.name || name,
          cnpj: existing.cnpj || formattedDoc,
          city: item.city || existing.city || '',
          phone: item.phone || existing.phone || undefined,
          status: 'atualizado',
        })
      }
    }
  }

  // Executa inserções em chunks de 100
  const createdList: any[] = []
  const CHUNK_SIZE = 100
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { data: inserted, error: insErr } = await supabase
      .from('senders')
      .insert(chunk)
      .select('id, name, cnpj')
    if (insErr) {
      console.error('Erro ao inserir remetentes SSW:', insErr.message)
      return {
        success: false,
        error: 'Erro ao gravar remetentes no banco: ' + insErr.message,
        totalRecords: clients.length,
        createdCount: createdList.length,
        updatedCount: 0,
        unchangedCount,
        changedDetails,
      }
    }
    if (inserted) createdList.push(...inserted)
  }

  // Executa atualizações
  let updatedCount = 0
  const UPDATE_BATCH = 20
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH)
    const resList = await Promise.all(
      batch.map((up) =>
        supabase
          .from('senders')
          .update({
            ie: up.ie,
            address: up.address,
            city: up.city,
            zip_code: up.zip_code,
            phone: up.phone,
            email: up.email,
          })
          .eq('id', up.id)
          .eq('organization_id', user.organization_id)
      )
    )
    for (const r of resList) {
      if (!r.error) updatedCount++
    }
  }

  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')

  return {
    success: true,
    totalRecords: clients.length,
    createdCount: createdList.length,
    updatedCount,
    unchangedCount,
    changedDetails,
  }
}

// ==========================================
// 🏢 DESTINATÁRIOS
// ==========================================

export async function getRecipients(senderId?: string, organizationId?: string) {
  const user = await requireAuth().catch(() => null)
  if (!user) return []

  // Previne IDOR/BOLA: usuário comum só acessa a própria organização
  const targetOrgId = (user.is_super_admin && organizationId) ? organizationId : user.organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  let query = supabase
    .from('recipients')
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, company_id, sender_id, has_appointment_rule, appointment_notes, created_at, companies(name), senders(name, city)')
    .eq('organization_id', targetOrgId)
    .order('created_at', { ascending: false })

  if (senderId) {
    query = query.eq('sender_id', senderId)
  }

  const { data, error } = await query
  if (error) {
    console.error('Erro ao buscar destinatários:', error.message)
    return []
  }
  return data || []
}

export async function createRecipient(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const sender_id = ((formData.get('sender_id') as string) || '').trim() || null

  // Previne IDOR em sender_id: garante que o remetente pertence à organização
  if (sender_id) {
    const { data: senderCheck } = await supabase
      .from('senders')
      .select('id')
      .eq('id', sender_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!senderCheck) {
      return { error: 'Remetente vinculado inválido ou não pertence à sua organização.' }
    }
  }

  const name = ((formData.get('name') as string) || '').trim()
  const address = ((formData.get('address') as string) || '').trim()
  const city = ((formData.get('city') as string) || '').trim()
  const zip_code = ((formData.get('zip_code') as string) || '').trim()
  const cnpj = ((formData.get('cnpj') as string) || '').trim()
  const ie = ((formData.get('ie') as string) || '').trim()
  const phone = ((formData.get('phone') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim()
  const has_appointment_rule = formData.get('has_appointment_rule') === 'true'
  const appointment_notes = ((formData.get('appointment_notes') as string) || '').trim() || null

  if (!name || name.length < 3) {
    return { error: 'Nome do Destinatário deve ter pelo menos 3 caracteres.' }
  }

  const insertObj: any = {
    company_id: company_id || null,
    sender_id: sender_id || null,
    name,
    address: address || null,
    city: city || null,
    zip_code: zip_code || null,
    cnpj: cnpj || null,
    ie: ie || null,
    phone: phone || null,
    has_appointment_rule,
    appointment_notes,
    organization_id: user.organization_id,
  }

  if (email) {
    insertObj.email = email
  }

  let { data, error } = await supabase
    .from('recipients')
    .insert([insertObj])
    .select('*, companies(name), senders(name, city)')
    .single()

  if (error && error.message?.includes('email')) {
    delete insertObj.email
    const retry = await supabase
      .from('recipients')
      .insert([insertObj])
      .select('*, companies(name), senders(name, city)')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) return { error: error.message }
  revalidatePath('/destinatarios')
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function updateRecipient(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = ((formData.get('company_id') as string) || '').trim()

  // Previne IDOR em company_id
  if (company_id) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!comp) {
      return { error: 'Empresa vinculada inválida ou não pertence à sua organização.' }
    }
  } else if (user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const sender_id = ((formData.get('sender_id') as string) || '').trim() || null

  // Previne IDOR em sender_id
  if (sender_id) {
    const { data: senderCheck } = await supabase
      .from('senders')
      .select('id')
      .eq('id', sender_id)
      .eq('organization_id', user.organization_id)
      .single()

    if (!senderCheck) {
      return { error: 'Remetente vinculado inválido ou não pertence à sua organização.' }
    }
  }

  const name = ((formData.get('name') as string) || '').trim()
  const address = ((formData.get('address') as string) || '').trim()
  const city = ((formData.get('city') as string) || '').trim()
  const zip_code = ((formData.get('zip_code') as string) || '').trim()
  const cnpj = ((formData.get('cnpj') as string) || '').trim()
  const ie = ((formData.get('ie') as string) || '').trim()
  const phone = ((formData.get('phone') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim()
  const has_appointment_rule = formData.get('has_appointment_rule') === 'true'
  const appointment_notes = ((formData.get('appointment_notes') as string) || '').trim() || null

  if (!name || name.length < 3) {
    return { error: 'Nome do Destinatário deve ter pelo menos 3 caracteres.' }
  }

  const updateObj: any = {
    company_id: company_id || null,
    sender_id: sender_id || null,
    name,
    address: address || null,
    city: city || null,
    zip_code: zip_code || null,
    cnpj: cnpj || null,
    ie: ie || null,
    phone: phone || null,
    email: email || null,
    has_appointment_rule,
    appointment_notes,
  }

  let { data, error } = await supabase
    .from('recipients')
    .update(updateObj)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, company_id, sender_id, has_appointment_rule, appointment_notes, created_at, companies(name), senders(name, city)')
    .single()

  if (error && error.message?.includes('email')) {
    delete updateObj.email
    const retry = await supabase
      .from('recipients')
      .update(updateObj)
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .select('id, name, cnpj, ie, address, city, zip_code, phone, email, company_id, sender_id, has_appointment_rule, appointment_notes, created_at, companies(name), senders(name, city)')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) return { error: error.message }
  revalidatePath('/destinatarios')
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function deleteRecipient(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('recipients')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) return { error: error.message }
  revalidatePath('/destinatarios')
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true }
}

/**
 * Importação em massa de Destinatários a partir do relatório de clientes SSW.
 * Permite associar um Remetente padrão (opcional) e mapeia regras de agendamento automático.
 */
export async function importSswRecipientsAction(
  clients: Array<{
    name: string
    cnpj: string
    formattedCnpj?: string
    ie?: string | null
    address?: string | null
    city?: string | null
    zipCode?: string | null
    phone?: string | null
    email?: string | null
    hasAppointmentRule?: boolean
  }>,
  senderId?: string | null,
  companyId?: string
): Promise<SswClientImportSummary> {
  const user = await requireAuth()
  const supabase = await createClient()

  if (!Array.isArray(clients) || clients.length === 0) {
    return {
      success: false,
      error: 'Nenhum destinatário válido enviado para importação.',
      totalRecords: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      changedDetails: [],
    }
  }

  // Previne IDOR em company_id
  let targetCompanyId = (companyId || '').trim()
  if (targetCompanyId) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .eq('id', targetCompanyId)
      .eq('organization_id', user.organization_id)
      .single()
    if (!comp) {
      targetCompanyId = ''
    }
  }
  if (!targetCompanyId && user.organization_id) {
    targetCompanyId = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  // Previne IDOR em sender_id
  let targetSenderId: string | null = (senderId || '').trim() || null
  if (targetSenderId) {
    const { data: senderCheck } = await supabase
      .from('senders')
      .select('id')
      .eq('id', targetSenderId)
      .eq('organization_id', user.organization_id)
      .single()
    if (!senderCheck) {
      targetSenderId = null
    }
  }

  // Carrega destinatários existentes para deduplicação rápida
  const { data: existingRecipients, error: fetchErr } = await supabase
    .from('recipients')
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, has_appointment_rule, sender_id')
    .eq('organization_id', user.organization_id)

  if (fetchErr) {
    return {
      success: false,
      error: 'Erro ao consultar destinatários existentes: ' + fetchErr.message,
      totalRecords: clients.length,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      changedDetails: [],
    }
  }

  const byCnpj = new Map<string, any>()
  const byName = new Map<string, any>()

  for (const r of existingRecipients || []) {
    const cleanCnpj = (r.cnpj || '').replace(/\D/g, '')
    if (cleanCnpj.length >= 11) {
      byCnpj.set(cleanCnpj, r)
    }
    const normName = (r.name || '').toUpperCase().replace(/\s+/g, ' ').trim()
    if (normName) {
      byName.set(normName, r)
    }
  }

  const toInsert: any[] = []
  const toUpdate: any[] = []
  let unchangedCount = 0
  const changedDetails: SswClientImportDetail[] = []
  const seenInBatch = new Set<string>()

  for (const item of clients) {
    const name = (item.name || '').trim()
    const cleanCnpj = (item.cnpj || '').replace(/\D/g, '')
    if (!name || name.length < 3 || cleanCnpj.length < 11) continue

    if (seenInBatch.has(cleanCnpj)) continue
    seenInBatch.add(cleanCnpj)

    const normName = name.toUpperCase().replace(/\s+/g, ' ').trim()
    const existing = byCnpj.get(cleanCnpj) || byName.get(normName)

    const formattedDoc = item.formattedCnpj || cleanCnpj
    const hasAppt = Boolean(item.hasAppointmentRule)

    if (!existing) {
      toInsert.push({
        company_id: targetCompanyId || null,
        sender_id: targetSenderId || null,
        name,
        cnpj: formattedDoc,
        ie: item.ie || null,
        address: item.address || null,
        city: item.city || null,
        zip_code: item.zipCode || null,
        phone: item.phone || null,
        email: item.email || null,
        has_appointment_rule: hasAppt,
        appointment_notes: hasAppt ? 'Agendamento obrigatório conforme cadastro SSW' : null,
        organization_id: user.organization_id,
      })
      changedDetails.push({
        name,
        cnpj: formattedDoc,
        city: item.city || '',
        phone: item.phone || undefined,
        status: 'criado',
        note: hasAppt ? 'Com regra de agendamento' : undefined,
      })
    } else {
      const existingCleanPhone = (existing.phone || '').replace(/\D/g, '')
      const newCleanPhone = (item.phone || '').replace(/\D/g, '')
      const phoneChanged = newCleanPhone && existingCleanPhone !== newCleanPhone
      const addressChanged = item.address && existing.address !== item.address
      const cityChanged = item.city && existing.city !== item.city
      const ieChanged = item.ie && existing.ie !== item.ie
      const emailChanged = item.email && existing.email !== item.email
      const apptChanged = hasAppt && !existing.has_appointment_rule
      const senderChanged = targetSenderId && !existing.sender_id

      if (!phoneChanged && !addressChanged && !cityChanged && !ieChanged && !emailChanged && !apptChanged && !senderChanged) {
        unchangedCount++
      } else {
        toUpdate.push({
          id: existing.id,
          name: existing.name || name,
          cnpj: existing.cnpj || formattedDoc,
          ie: item.ie || existing.ie || null,
          address: item.address || existing.address || null,
          city: item.city || existing.city || null,
          zip_code: item.zipCode || existing.zip_code || null,
          phone: item.phone || existing.phone || null,
          email: item.email || existing.email || null,
          has_appointment_rule: existing.has_appointment_rule || hasAppt,
          sender_id: existing.sender_id || targetSenderId || null,
        })
        changedDetails.push({
          name: existing.name || name,
          cnpj: existing.cnpj || formattedDoc,
          city: item.city || existing.city || '',
          phone: item.phone || existing.phone || undefined,
          status: 'atualizado',
          note: apptChanged ? 'Regra de agendamento ativada' : undefined,
        })
      }
    }
  }

  // Executa inserções em chunks de 100
  const createdList: any[] = []
  const CHUNK_SIZE = 100
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { data: inserted, error: insErr } = await supabase
      .from('recipients')
      .insert(chunk)
      .select('id, name, cnpj')
    if (insErr) {
      console.error('Erro ao inserir destinatários SSW:', insErr.message)
      return {
        success: false,
        error: 'Erro ao gravar destinatários no banco: ' + insErr.message,
        totalRecords: clients.length,
        createdCount: createdList.length,
        updatedCount: 0,
        unchangedCount,
        changedDetails,
      }
    }
    if (inserted) createdList.push(...inserted)
  }

  // Executa atualizações
  let updatedCount = 0
  const UPDATE_BATCH = 20
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH)
    const resList = await Promise.all(
      batch.map((up) =>
        supabase
          .from('recipients')
          .update({
            ie: up.ie,
            address: up.address,
            city: up.city,
            zip_code: up.zip_code,
            phone: up.phone,
            email: up.email,
            has_appointment_rule: up.has_appointment_rule,
            sender_id: up.sender_id,
          })
          .eq('id', up.id)
          .eq('organization_id', user.organization_id)
      )
    )
    for (const r of resList) {
      if (!r.error) updatedCount++
    }
  }

  revalidatePath('/destinatarios')
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')

  return {
    success: true,
    totalRecords: clients.length,
    createdCount: createdList.length,
    updatedCount,
    unchangedCount,
    changedDetails,
  }
}

// ==========================================
// 📧 E-MAILS DE NOTIFICAÇÃO (CC)
// ==========================================

export async function getNotificationEmails(organizationId?: string) {
  const user = await requireAuth().catch(() => null)
  if (!user) return []

  // Previne IDOR/BOLA: usuário comum só acessa a própria organização
  const targetOrgId = (user.is_super_admin && organizationId) ? organizationId : user.organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('notification_emails')
      .select('id, name, email, active, created_at, organization_id')
      .eq('organization_id', targetOrgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar e-mails de notificação:', error.message)
      return []
    }
    return data || []
  } catch {
    return []
  }
}

async function getActiveCcEmails(organizationId?: string): Promise<string[]> {
  if (!organizationId) return []
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('notification_emails')
      .select('email')
      .eq('organization_id', organizationId)
      .eq('active', true)

    if (error || !data) return []
    return data.map((item: any) => item.email)
  } catch {
    return []
  }
}

export async function createNotificationEmail(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  const name = ((formData.get('name') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim().toLowerCase()
  const active = formData.get('active') !== 'false'

  if (!name || name.length < 2) {
    return { error: 'O nome ou setor responsável deve ter pelo menos 2 caracteres.' }
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    return { error: 'Por favor, informe um endereço de e-mail válido (ex: contato@empresa.com.br).' }
  }

  // Previne duplicidade de e-mail na mesma organização
  const { data: existing } = await supabase
    .from('notification_emails')
    .select('id')
    .eq('email', email)
    .eq('organization_id', user.organization_id)
    .maybeSingle()

  if (existing) {
    return { error: 'Este e-mail já está cadastrado em cópia na sua organização.' }
  }

  const { data, error } = await supabase
    .from('notification_emails')
    .insert([
      {
        name,
        email,
        active,
        organization_id: user.organization_id,
      },
    ])
    .select('id, name, email, active, created_at, organization_id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/emails')
  return { success: true, data }
}

export async function updateNotificationEmail(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  const name = ((formData.get('name') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim().toLowerCase()
  const active = formData.get('active') === 'true'

  if (!name || name.length < 2) {
    return { error: 'O nome ou setor responsável deve ter pelo menos 2 caracteres.' }
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    return { error: 'Por favor, informe um endereço de e-mail válido (ex: contato@empresa.com.br).' }
  }

  // Previne duplicidade com outro registro diferente do atual
  const { data: existing } = await supabase
    .from('notification_emails')
    .select('id')
    .eq('email', email)
    .eq('organization_id', user.organization_id)
    .neq('id', id)
    .maybeSingle()

  if (existing) {
    return { error: 'Já existe outro registro com este e-mail cadastrado na sua organização.' }
  }

  const { data, error } = await supabase
    .from('notification_emails')
    .update({ name, email, active })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, email, active, created_at, organization_id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/emails')
  return { success: true, data }
}

export async function toggleNotificationEmail(id: string, active: boolean) {
  const user = await requireAuth()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notification_emails')
    .update({ active })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, email, active, created_at, organization_id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/emails')
  return { success: true, data }
}

export async function deleteNotificationEmail(id: string) {
  const user = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('notification_emails')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) return { error: error.message }
  revalidatePath('/emails')
  return { success: true }
}

// ==========================================
// 👑 GESTÃO MASTER / TENANTS DO SAAS (/master)
// ==========================================

export async function getTenantsAction() {
  await requireSuperAdmin()
  const pool = getDbPool()
  let client
  try {
    client = await pool.connect()
    const query = `
      SELECT 
        o.id,
        o.name,
        o.cnpj,
        o.slug,
        o.active,
        o.created_at,
        o.logo_url,
        (SELECT COUNT(*)::int FROM public.profiles p WHERE p.organization_id = o.id) as user_count,
        (SELECT COUNT(*)::int FROM public.trips t WHERE t.organization_id = o.id) as trip_count,
        (
          SELECT json_build_object('name', p.name, 'email', p.email)
          FROM public.profiles p
          WHERE p.organization_id = o.id AND p.role = 'admin'
          ORDER BY p.created_at ASC
          LIMIT 1
        ) as admin_info
      FROM public.organizations o
      ORDER BY o.created_at DESC;
    `
    const res = await client.query(query)
    return res.rows
  } catch (err: any) {
    console.error('Erro ao buscar tenants:', err)
    return []
  } finally {
    if (client) client.release()
  }
}

export async function createTenantAction(formData: FormData) {
  await requireSuperAdmin()
  const companyName = (formData.get('companyName') as string)?.trim()
  const rawCnpj = (formData.get('cnpj') as string)?.trim() || ''
  const adminName = (formData.get('adminName') as string)?.trim()
  const adminEmail = (formData.get('adminEmail') as string)?.trim().toLowerCase()
  const adminPassword = formData.get('adminPassword') as string

  if (!companyName || companyName.length < 2) {
    return { error: 'O nome da empresa / organização é obrigatório (mínimo de 2 caracteres).' }
  }

  const cleanCnpj = rawCnpj.replace(/\D/g, '')
  if (cleanCnpj && cleanCnpj.length !== 14) {
    return { error: 'O CNPJ informado é inválido (deve conter 14 dígitos numéricos).' }
  }
  const formattedCnpj = cleanCnpj ? formatCNPJ(cleanCnpj) : null

  if (!adminName || adminName.length < 2) {
    return { error: 'O nome do administrador é obrigatório (mínimo de 2 caracteres).' }
  }
  if (!adminEmail || !EMAIL_REGEX.test(adminEmail)) {
    return { error: 'Por favor, informe um e-mail válido para o administrador.' }
  }
  if (!adminPassword || adminPassword.length < 6) {
    return { error: 'A senha provisória deve conter no mínimo 6 caracteres.' }
  }

  // Gera slug a partir do nome da empresa
  let slug = companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!slug) {
    slug = `org-${Math.random().toString(36).substring(2, 8)}`
  }

  const pool = getDbPool()
  let client

  try {
    client = await pool.connect()
    await client.query('BEGIN')

    // Checa se o e-mail de admin já existe no auth.users
    const emailCheck = await client.query('SELECT id FROM auth.users WHERE email = $1', [adminEmail])
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK')
      return { error: 'Já existe um usuário cadastrado com este e-mail na plataforma.' }
    }

    // Se o slug já existir, adiciona sufixo aleatório
    const slugCheck = await client.query('SELECT id FROM public.organizations WHERE slug = $1', [slug])
    if (slugCheck.rows.length > 0) {
      slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`
    }

    // 1. Cria a Organização (Tenant)
    const orgRes = await client.query(`
      INSERT INTO public.organizations (
        name,
        cnpj,
        slug,
        active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, true, now(), now())
      RETURNING id;
    `, [companyName, formattedCnpj, slug])
    const organizationId = orgRes.rows[0].id

    // 2. Cria a Empresa base vinculada para compatibilidade operacional imediata
    const compRes = await client.query(`
      INSERT INTO public.companies (
        organization_id,
        name,
        cnpj,
        created_at
      ) VALUES ($1::uuid, $2, $3, now())
      RETURNING id;
    `, [organizationId, companyName, formattedCnpj])
    const companyId = compRes.rows[0].id

    // 3. Cria a Filial padrão (Matriz)
    await client.query(`
      INSERT INTO public.branches (
        organization_id,
        company_id,
        name,
        code,
        created_at
      ) VALUES ($1::uuid, $2::uuid, 'Matriz', 'MTZ', now());
    `, [organizationId, companyId])

    // 4. Cria o Administrador da Organização em auth.users
    const userMetadata = JSON.stringify({
      name: adminName,
      email: adminEmail,
      email_verified: false,
      phone_verified: false,
    })

    const userRes = await client.query(`
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        invited_at,
        confirmation_token,
        confirmation_sent_at,
        recovery_token,
        recovery_sent_at,
        email_change_token_new,
        email_change,
        email_change_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        phone,
        phone_confirmed_at,
        phone_change,
        phone_change_token,
        phone_change_sent_at,
        email_change_token_current,
        email_change_confirm_status,
        banned_until,
        reauthentication_token,
        reauthentication_sent_at,
        is_sso_user,
        deleted_at,
        is_anonymous
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        $1,
        crypt($2, gen_salt('bf')),
        now(),
        null,
        '',
        null,
        '',
        null,
        '',
        '',
        null,
        null,
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        $3::jsonb,
        null,
        now(),
        now(),
        null,
        null,
        '',
        '',
        null,
        '',
        0,
        null,
        '',
        null,
        false,
        null,
        false
      )
      RETURNING id;
    `, [adminEmail, adminPassword, userMetadata])
    const userId = userRes.rows[0].id

    // 5. Cria identidade correspondente
    const identityData = JSON.stringify({
      sub: userId.toString(),
      email: adminEmail,
      name: adminName,
    })

    await client.query(`
      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1::uuid,
        $2,
        $3::jsonb,
        'email',
        now(),
        now()
      );
    `, [userId, userId.toString(), identityData])

    // 6. Cria profile associado ao novo tenant como admin (is_super_admin = false)
    await client.query(`
      INSERT INTO public.profiles (
        id,
        organization_id,
        name,
        email,
        role,
        active,
        is_super_admin
      ) VALUES ($1::uuid, $2::uuid, $3, $4, 'admin', true, false);
    `, [userId, organizationId, adminName, adminEmail])

    await client.query('COMMIT')
    revalidatePath('/master')
    return { success: true, data: { id: organizationId, slug, name: companyName, cnpj: formattedCnpj } }
  } catch (err: any) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch {}
    }
    console.error('Erro ao provisionar tenant:', err)
    return { error: err.message || 'Erro ao criar nova empresa cliente.' }
  } finally {
    if (client) client.release()
  }
}

export async function toggleTenantStatusAction(orgId: string, active: boolean) {
  const superAdmin = await requireSuperAdmin()
  if (!active && superAdmin.organization_id === orgId) {
    return { error: 'Operação não permitida: Você não pode desativar a organização raiz da sua própria sessão ativa de SuperAdmin.' }
  }

  const pool = getDbPool()
  let client
  try {
    client = await pool.connect()
    await client.query(`
      UPDATE public.organizations 
      SET active = $1, updated_at = now() 
      WHERE id = $2::uuid;
    `, [active, orgId])

    // Também atualiza o status de todos os perfis desse tenant
    await client.query(`
      UPDATE public.profiles
      SET active = $1, updated_at = now()
      WHERE organization_id = $2::uuid;
    `, [active, orgId])

    revalidatePath('/master')
    return { success: true }
  } catch (err: any) {
    console.error('Erro ao alterar status do tenant:', err)
    return { error: err.message || 'Erro ao alterar status do tenant.' }
  } finally {
    if (client) client.release()
  }
}

export async function updateTenantAction(orgId: string, formData: FormData) {
  await requireSuperAdmin()
  const companyName = (formData.get('companyName') as string)?.trim()
  const rawCnpj = (formData.get('cnpj') as string)?.trim() || ''
  const logoUrl = (formData.get('logoUrl') as string) || null

  if (!companyName || companyName.length < 2) {
    return { error: 'O nome da empresa / organização é obrigatório.' }
  }

  const cleanCnpj = rawCnpj.replace(/\D/g, '')
  if (cleanCnpj && cleanCnpj.length !== 14) {
    return { error: 'O CNPJ informado é inválido (deve conter 14 dígitos numéricos).' }
  }
  const formattedCnpj = cleanCnpj ? formatCNPJ(cleanCnpj) : null

  const pool = getDbPool()
  let client
  try {
    client = await pool.connect()
    await client.query(`
      UPDATE public.organizations 
      SET name = $1, cnpj = $2, logo_url = $3, updated_at = now() 
      WHERE id = $4::uuid;
    `, [companyName, formattedCnpj, logoUrl, orgId])

    await client.query(`
      UPDATE public.companies
      SET name = $1, cnpj = $2
      WHERE organization_id = $3::uuid;
    `, [companyName, formattedCnpj, orgId])

    revalidatePath('/master')
    return { success: true }
  } catch (err: any) {
    console.error('Erro ao atualizar tenant:', err)
    return { error: err.message || 'Erro ao atualizar dados do tenant.' }
  } finally {
    if (client) client.release()
  }
}

// ==========================================
// 📬 SINCRONIZAÇÃO DE XMLs DE CT-e VIA E-MAIL (SSW / Hostinger)
// ==========================================

export async function getSswSyncStatusAction(organizationId?: string) {
  let targetOrgId = organizationId
  if (!targetOrgId) {
    const user = await requireAuth().catch(() => null)
    targetOrgId = user?.organization_id
  }
  return getSswSyncHealth(targetOrgId)
}

export async function syncCteEmailsAction(): Promise<EmailSyncResult> {
  try {
    const user = await requireAuth()
    const orgId = user.organization_id

    const res = await syncCteEmailsFromMailbox(orgId)
    revalidatePath('/')
    revalidatePath('/novo-transporte')
    return res
  } catch (err: any) {
    console.error('Erro em syncCteEmailsAction:', err)
    const diag = classifyImapError(err)
    return {
      success: false,
      totalEmailsChecked: 0,
      ctesProcessed: 0,
      tripsCreated: 0,
      tripsUpdated: 0,
      details: [],
      error: err?.message || 'Falha ao sincronizar e-mails do SSW.',
      diagnostic: diag,
    }
  }
}

// ==========================================
// 📋 IMPORTAÇÃO DE EDI PROCEDA CONEMB 5.0 (Manifesto / Romaneio SSW)
// ==========================================

export async function importEdiConembAction(ediContent: string) {
  try {
    const user = await requireAuth()
    const orgId = user.organization_id
    if (!orgId) return { success: false, error: 'Organização do usuário não identificada.' }

    if (!ediContent || typeof ediContent !== 'string') {
      return { success: false, error: 'Conteúdo do arquivo EDI vazio ou inválido.' }
    }

    const parsedEdi = parseProcedaConemb(ediContent)
    if (!parsedEdi.isConemb || parsedEdi.totalCtes === 0) {
      return {
        success: false,
        error: 'O arquivo informado não é um EDI PROCEDA CONEMB válido ou não contém CT-es identificados.',
      }
    }

    const pool = getDbPool()
    const client = await pool.connect()

    try {
      const compRes = await client.query(
        `SELECT id FROM companies WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [orgId]
      )
      const companyId = compRes.rows[0]?.id || null

      const res = await processEdiLoteInDatabase(client, parsedEdi, orgId, companyId)

      revalidatePath('/')
      revalidatePath('/novo-transporte')

      return {
        success: true,
        transportadora: parsedEdi.transportadora,
        totalCtes: parsedEdi.totalCtes,
        created: res.created,
        updated: res.updated,
        details: res.details,
      }
    } finally {
      client.release()
    }
  } catch (err: any) {
    console.error('Erro em importEdiConembAction:', err)
    return { success: false, error: err?.message || 'Falha ao processar arquivo EDI do SSW.' }
  }
}

// ==========================================
// 🚚 ATRIBUIÇÃO RÁPIDA / SUGESTÃO DE MOTORISTA
// ==========================================

export async function assignDriverAction(tripId: string, driverId: string) {
  try {
    const user = await requireAuth()
    const orgId = user.organization_id
    if (!orgId) return { success: false, error: 'Sessão do usuário não identificada.' }

    if (!tripId || !driverId) {
      return { success: false, error: 'Identificadores de transporte e motorista são obrigatórios.' }
    }

    const supabase = await createClient()

    // 1. Verifica se o motorista pertence à organização
    const { data: driver, error: driverErr } = await supabase
      .from('drivers')
      .select('id, name, phone, default_plate, telegram_chat_id, telegram_username')
      .eq('id', driverId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (driverErr || !driver) {
      return { success: false, error: 'Motorista não encontrado na organização.' }
    }

    // 2. Busca metadados atuais da viagem e vincula o novo motorista
    const { data: existingTrip } = await supabase
      .from('trips')
      .select('sefaz_metadata')
      .eq('id', tripId)
      .eq('organization_id', orgId)
      .maybeSingle()

    const updatedMeta = appendTripAuditEvent(existingTrip?.sefaz_metadata, {
      type: 'DRIVER_ASSIGNED',
      title: `Motorista vinculado: ${driver.name}`,
      description: `Motorista ${driver.name}${driver.default_plate ? ` (Placa: ${driver.default_plate})` : ''} atribuído ao transporte no painel.`,
      channel: 'painel_web',
      actor: user.name || user.email || 'Operador',
    })

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .update({ driver_id: driverId, sefaz_metadata: updatedMeta })
      .eq('id', tripId)
      .eq('organization_id', orgId)
      .select('id, token, cte_number, sefaz_metadata')
      .maybeSingle()

    if (tripErr || !trip) {
      return { success: false, error: tripErr?.message || 'Transporte não encontrado ou não autorizado.' }
    }

    revalidatePath('/')
    revalidatePath('/novo-transporte')

    return {
      success: true,
      driver,
      trip,
    }
  } catch (err: any) {
    console.error('Erro em assignDriverAction:', err)
    return { success: false, error: err?.message || 'Falha ao vincular motorista ao transporte.' }
  }
}

// ==========================================
// ⚠️ GESTÃO DE IMPREVISTOS E SINISTROS OPERACIONAIS
// ==========================================

export async function reportTripIncidentAction(tripId: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const { data: currentTrip, error: tripErr } = await supabase
      .from('trips')
      .select('id, token, organization_id, sefaz_metadata, drivers(name)')
      .eq('id', tripId)
      .single()

    if (tripErr || !currentTrip) {
      return { error: 'Viagem não encontrada.' }
    }

    const cookieStore = await cookies()
    const isDriverAuth = cookieStore.get(`driver_auth_${currentTrip.token.toUpperCase()}`)?.value === 'true'
    const user = await getCurrentUser().catch(() => null)

    if (!isDriverAuth && !user) {
      return { error: 'Acesso não autorizado. Identifique-se com seu PIN ou faça login na central.' }
    }

    if (user && !user.is_super_admin && user.organization_id !== currentTrip.organization_id) {
      return { error: 'Acesso não autorizado para esta organização.' }
    }

    const rawCategory = ((formData.get('category') as string) || 'outros').trim() as IncidentCategory
    const validCategories = Object.keys(INCIDENT_CATEGORIES) as IncidentCategory[]
    const category: IncidentCategory = validCategories.includes(rawCategory) ? rawCategory : 'outros'

    const description = ((formData.get('description') as string) || '').trim()
    if (!description || description.length < 3) {
      return { error: 'Descreva brevemente o que aconteceu (mínimo de 3 caracteres).' }
    }

    const rawLat = formData.get('lat') ? parseFloat(formData.get('lat') as string) : null
    const rawLng = formData.get('lng') ? parseFloat(formData.get('lng') as string) : null
    const lat = rawLat && !isNaN(rawLat) ? rawLat : null
    const lng = rawLng && !isNaN(rawLng) ? rawLng : null

    let photoUrl: string | null = null
    const file = formData.get('photo') as File | null
    if (file && file.size > 0) {
      const MAX_FILE_SIZE = 10 * 1024 * 1024
      if (file.size > MAX_FILE_SIZE) {
        return { error: 'A foto excede o limite máximo permitido de 10MB.' }
      }

      const ALLOWED_MIME_TYPES: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      }
      const safeExt = ALLOWED_MIME_TYPES[file.type]
      if (!safeExt) {
        return { error: 'Formato de foto inválido. São permitidos apenas arquivos JPEG, PNG e WebP.' }
      }

      const fileName = `incident_${tripId}_${Date.now()}.${safeExt}`
      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('trip-photos')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage
            .from('trip-photos')
            .getPublicUrl(uploadData.path)
          photoUrl = urlData.publicUrl
        } else {
          const buffer = Buffer.from(await file.arrayBuffer())
          photoUrl = `data:${file.type};base64,${buffer.toString('base64')}`
        }
      } catch {
        const buffer = Buffer.from(await file.arrayBuffer())
        photoUrl = `data:${file.type};base64,${buffer.toString('base64')}`
      }
    }

    const isOperator = Boolean(user && !isDriverAuth)
    const channel = isOperator ? 'painel_web' : 'motorista_web'
    const reportedBy = isOperator
      ? (user?.name || user?.email || 'Central de Monitoramento')
      : ((currentTrip.drivers as any)?.name || 'Motorista')

    const { metadata: updatedMeta, incident } = appendTripIncident(currentTrip.sefaz_metadata, {
      category,
      description,
      channel,
      reportedBy,
      photoUrl,
      lat,
      lng,
    })

    const { data, error } = await supabase
      .from('trips')
      .update({ sefaz_metadata: updatedMeta })
      .eq('id', tripId)
      .select('id, token, sefaz_metadata')
      .single()

    if (error) {
      return { error: error.message }
    }

    revalidatePath(`/v/${currentTrip.token}`)
    revalidatePath('/')
    revalidatePath('/estadias')

    return {
      success: true,
      incident,
      sefaz_metadata: data.sefaz_metadata,
    }
  } catch (err: any) {
    console.error('Erro em reportTripIncidentAction:', err)
    return { error: err?.message || 'Falha ao registrar imprevisto na viagem.' }
  }
}

export async function resolveTripIncidentAction(
  tripId: string,
  incidentId: string,
  resolutionNotes?: string
) {
  try {
    const user = await requireAuth()
    const supabase = await createClient()

    const { data: currentTrip, error: tripErr } = await supabase
      .from('trips')
      .select('id, token, organization_id, sefaz_metadata')
      .eq('id', tripId)
      .eq('organization_id', user.organization_id)
      .single()

    if (tripErr || !currentTrip) {
      return { error: 'Viagem não encontrada na sua organização.' }
    }

    const resolvedBy = user.name || user.email || 'Central Operacional'
    const updatedMeta = resolveTripIncidentInMeta(
      currentTrip.sefaz_metadata,
      incidentId,
      resolvedBy,
      resolutionNotes
    )

    const { data, error } = await supabase
      .from('trips')
      .update({ sefaz_metadata: updatedMeta })
      .eq('id', tripId)
      .eq('organization_id', user.organization_id)
      .select('id, token, sefaz_metadata')
      .single()

    if (error) {
      return { error: error.message }
    }

    revalidatePath(`/v/${currentTrip.token}`)
    revalidatePath('/')
    revalidatePath('/estadias')

    return {
      success: true,
      sefaz_metadata: data.sefaz_metadata,
    }
  } catch (err: any) {
    console.error('Erro em resolveTripIncidentAction:', err)
    return { error: err?.message || 'Falha ao resolver imprevisto.' }
  }
}



