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

export async function getDrivers(organizationId?: string) {
  const user = await requireAuth().catch(() => null)
  if (!user) return []

  // Previne IDOR/BOLA: usuário comum só acessa a própria organização
  const targetOrgId = (user.is_super_admin && organizationId) ? organizationId : user.organization_id
  if (!targetOrgId) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('drivers')
    .select('id, name, cpf, phone, default_plate, pin, company_id, telegram_chat_id, telegram_username, created_at, companies(name)')
    .eq('organization_id', targetOrgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar motoristas:', error.message)
    return []
  }
  return data || []
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

// ==========================================
// 📦 VIAGENS / TRANSPORTES
// ==========================================

export async function getTrips(organizationId?: string) {
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
  const { data, error } = await supabase
    .from('trips')
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
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Erro ao buscar transportes:', error.message)
    return []
  }
  return data || []
}

export async function createTrip(payload: {
  company_id?: string
  branch_id?: string
  driver_id: string
  cte_number?: string
  service_type: string
  status: string
  sender?: string
  sender_id?: string
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

  const insertObj: any = {
    company_id,
    branch_id,
    driver_id: payload.driver_id,
    cte_number: payload.cte_number?.trim() || null,
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

  const updateData: any = {}
  if (payload.cte_number !== undefined) updateData.cte_number = payload.cte_number?.trim() || null
  if (payload.service_type !== undefined) updateData.service_type = payload.service_type
  if (payload.sender !== undefined) updateData.sender = payload.sender?.trim() || null
  if (payload.destination !== undefined) updateData.destination = payload.destination?.trim() || null
  if (payload.invoices !== undefined) updateData.invoices = payload.invoices
  if (payload.driver_id !== undefined) updateData.driver_id = payload.driver_id
  if (payload.status !== undefined) updateData.status = payload.status

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
  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'cancelled' })
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
    .select('id, token, status, arrival_time')
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
  const updatePayload: any = {
    status: 'arrived',
    arrival_time: arrivalTime,
    checkin_lat: lat || null,
    checkin_lng: lng || null,
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
      branches(name, code, city, state, email, phone, contact)
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

      const { data: recList } = await supabase
        .from('recipients')
        .select('name, email')
        .not('email', 'is', null)

      if (recList && recList.length > 0) {
        const destLower = (trip.destination || '').toLowerCase()
        const matched = recList.find((r: any) => {
          if (!r.email) return false
          const rNameLower = (r.name || '').toLowerCase()
          return destLower.includes(rNameLower) || rNameLower.includes(destLower)
        })
        if (matched?.email) {
          targetEmail = matched.email
        }
      }

      if (!targetEmail) {
        targetEmail = trip.recipient_email || null
      }
      if (!targetEmail && Array.isArray(trip.recipients)) {
        const found = trip.recipients.find((r: any) => r.email && r.email.includes('@'))
        if (found) targetEmail = found.email
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
    .select('id, token, status, arrival_time')
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

  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'finished',
      completion_time: completionTime,
    })
    .eq('id', tripId)
    .select(`
      *,
      drivers(name, phone),
      companies(name, contact, phone, email, website),
      branches(name, code, city, state, email, phone, contact)
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

      const { data: recList } = await supabase
        .from('recipients')
        .select('name, email')
        .not('email', 'is', null)

      if (recList && recList.length > 0) {
        const destLower = (trip.destination || '').toLowerCase()
        const matched = recList.find((r: any) => {
          if (!r.email) return false
          const rNameLower = (r.name || '').toLowerCase()
          return destLower.includes(rNameLower) || rNameLower.includes(destLower)
        })
        if (matched?.email) {
          targetEmail = matched.email
        }
      }

      if (!targetEmail) {
        targetEmail = trip.recipient_email || null
      }
      if (!targetEmail && Array.isArray(trip.recipients)) {
        const found = trip.recipients.find((r: any) => r.email && r.email.includes('@'))
        if (found) targetEmail = found.email
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
    .select('id, token, arrival_time')
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

  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'in_transit',
      arrival_time: null,
      checkin_lat: null,
      checkin_lng: null,
      checkin_photo_url: null,
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
    .select('id, token, completion_time')
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

  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'arrived',
      completion_time: null,
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
    .select('id, drivers(pin)')
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

  revalidatePath(`/v/${token}`)
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
    .select('id, name, cnpj, ie, address, city, zip_code, phone, franchise_hours, demurrage_hourly_rate, company_id, created_at, companies(name), recipients(*)')
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
  const rawFranchise = formData.get('franchise_hours') ? parseFloat(formData.get('franchise_hours') as string) : 0
  const franchise_hours = isNaN(rawFranchise) || rawFranchise < 0 ? 0 : rawFranchise
  const rawDemurrage = formData.get('demurrage_hourly_rate') ? parseFloat(formData.get('demurrage_hourly_rate') as string) : 0
  const demurrage_hourly_rate = isNaN(rawDemurrage) || rawDemurrage < 0 ? 0 : rawDemurrage

  if (!name || name.length < 3) {
    return { error: 'Razão Social / Nome do Remetente deve ter pelo menos 3 caracteres.' }
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
        franchise_hours,
        demurrage_hourly_rate,
        organization_id: user.organization_id,
      },
    ])
    .select('id, name, cnpj, ie, address, city, zip_code, phone, franchise_hours, demurrage_hourly_rate, company_id, created_at, companies(name), recipients(*)')
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
  const rawFranchise = formData.get('franchise_hours') ? parseFloat(formData.get('franchise_hours') as string) : 0
  const franchise_hours = isNaN(rawFranchise) || rawFranchise < 0 ? 0 : rawFranchise
  const rawDemurrage = formData.get('demurrage_hourly_rate') ? parseFloat(formData.get('demurrage_hourly_rate') as string) : 0
  const demurrage_hourly_rate = isNaN(rawDemurrage) || rawDemurrage < 0 ? 0 : rawDemurrage

  if (!name || name.length < 3) {
    return { error: 'Razão Social / Nome do Remetente deve ter pelo menos 3 caracteres.' }
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
      franchise_hours,
      demurrage_hourly_rate,
    })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, cnpj, ie, address, city, zip_code, phone, franchise_hours, demurrage_hourly_rate, company_id, created_at, companies(name), recipients(*)')
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
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, company_id, sender_id, created_at, companies(name), senders(name, city)')
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
  }

  let { data, error } = await supabase
    .from('recipients')
    .update(updateObj)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('id, name, cnpj, ie, address, city, zip_code, phone, email, company_id, sender_id, created_at, companies(name), senders(name, city)')
    .single()

  if (error && error.message?.includes('email')) {
    delete updateObj.email
    const retry = await supabase
      .from('recipients')
      .update(updateObj)
      .eq('id', id)
      .eq('organization_id', user.organization_id)
      .select('id, name, cnpj, ie, address, city, zip_code, phone, email, company_id, sender_id, created_at, companies(name), senders(name, city)')
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
