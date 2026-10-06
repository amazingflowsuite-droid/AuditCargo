'use server'

import { createClient } from '@/utils/supabase/server'
import { getCurrentUser, requireAuth, requireAdmin, requireSuperAdmin } from '@/utils/supabase/auth'
import { getDbPool } from '@/utils/db'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sendArrivalEmail, sendCompletionEmail } from '@/utils/mailer'

// ==========================================
// 🔐 AUTENTICAÇÃO E SESSÃO DO SISTEMA (SAAS)
// ==========================================

export async function signInAction(formData: FormData) {
  const supabase = await createClient()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Por favor, informe e-mail e senha.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'E-mail ou senha incorretos.' }
    }
    return { error: error.message }
  }

  if (data?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('active, role')
      .eq('id', data.user.id)
      .single()

    if (profile && !profile.active) {
      await supabase.auth.signOut()
      return { error: 'Acesso bloqueado: este usuário foi inativado pelo administrador.' }
    }
  }

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
  const role = ((formData.get('role') as string) || 'operator') as 'admin' | 'operator'

  if (!name) {
    return { error: 'Nome do colaborador é obrigatório.' }
  }
  if (!email || !email.includes('@')) {
    return { error: 'E-mail inválido.' }
  }
  if (!password || password.length < 6) {
    return { error: 'A senha provisória deve conter no mínimo 6 caracteres.' }
  }

  const pool = getDbPool()
  let client

  try {
    client = await pool.connect()
    await client.query('BEGIN')

    // Checa se já existe usuário com esse e-mail em auth.users
    const userCheck = await client.query('SELECT id FROM auth.users WHERE email = $1', [email])
    if (userCheck.rows.length > 0) {
      await client.query('ROLLBACK')
      return { error: 'Já existe um usuário cadastrado com este e-mail na plataforma.' }
    }

    // Insere novo usuário em auth.users com todas as colunas de texto GoTrue inicializadas (evitando null)
    const userMetadata = JSON.stringify({
      name,
      email,
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
    `, [email, password, userMetadata])

    const userId = userRes.rows[0].id

    // Insere identity correspondente
    const identityData = JSON.stringify({
      sub: userId.toString(),
      email,
      name,
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

    // Insere profile na organização do admin
    await client.query(`
      INSERT INTO public.profiles (
        id,
        organization_id,
        name,
        email,
        role,
        active
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, true);
    `, [userId, admin.organization_id, name, email, role])

    await client.query('COMMIT')
    revalidatePath('/usuarios')
    return { success: true }
  } catch (err: any) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch {}
    }
    console.error('Erro ao criar usuário:', err)
    return { error: err.message || 'Erro ao registrar usuário.' }
  } finally {
    if (client) client.release()
  }
}

export async function toggleUserStatusAction(userId: string, active: boolean) {
  const admin = await requireAdmin()
  if (admin.id === userId) {
    return { error: 'Você não pode inativar sua própria conta.' }
  }

  const supabase = await createClient()
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

  const pool = getDbPool()
  let client
  try {
    client = await pool.connect()
    await client.query(`DELETE FROM auth.users WHERE id = $1::uuid`, [userId])
    revalidatePath('/usuarios')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  } finally {
    if (client) client.release()
  }
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

export async function getCompanies() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  let query = supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (user?.organization_id) {
    query = query.eq('organization_id', user.organization_id)
  }

  const { data, error } = await query
  if (error) {
    console.error('Erro ao buscar empresas:', error.message)
    return []
  }

  if ((!data || data.length === 0) && user?.organization_id) {
    const defaultId = await getOrCreateTenantCompanyId(supabase, user.organization_id)
    if (defaultId) {
      const { data: refreshed } = await supabase
        .from('companies')
        .select('*')
        .eq('id', defaultId)
      return refreshed || []
    }
  }

  return data || []
}

export async function createCompany(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  const name = formData.get('name') as string
  const cnpj = formData.get('cnpj') as string
  const contact = (formData.get('contact') as string) || null
  const phone = (formData.get('phone') as string) || null
  const email = (formData.get('email') as string) || null
  const website = (formData.get('website') as string) || null

  const insertObj: any = {
    name,
    cnpj,
    contact,
    phone,
    email,
    website,
    organization_id: user.organization_id,
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
  const user = await requireAuth()
  const supabase = await createClient()
  const name = formData.get('name') as string
  const cnpj = formData.get('cnpj') as string
  const contact = (formData.get('contact') as string) || null
  const phone = (formData.get('phone') as string) || null
  const email = (formData.get('email') as string) || null
  const website = (formData.get('website') as string) || null

  const { data, error } = await supabase
    .from('companies')
    .update({ name, cnpj, contact, phone, email, website })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
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
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) return { error: error.message }
  revalidatePath('/empresas')
  revalidatePath('/filiais')
  revalidatePath('/motoristas')
  return { success: true }
}

// ==========================================
// 📍 FILIAIS
// ==========================================

export async function getBranches() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  let query = supabase
    .from('branches')
    .select('*, companies(name)')
    .order('created_at', { ascending: false })

  if (user?.organization_id) {
    query = query.eq('organization_id', user.organization_id)
  }

  const { data, error } = await query
  if (error) {
    console.error('Erro ao buscar filiais:', error.message)
    return []
  }
  return data || []
}

export async function createBranch(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  if (!company_id && user.organization_id) {
    const { data: c } = await supabase
      .from('companies')
      .select('id')
      .eq('organization_id', user.organization_id)
      .limit(1)
      .maybeSingle()
    if (c?.id) company_id = c.id
  }

  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const email = (formData.get('email') as string)?.trim() || null
  const phone = (formData.get('phone') as string)?.trim() || null
  const contact = (formData.get('contact') as string)?.trim() || null

  if (!name || name.trim() === '') {
    return { error: 'O nome da filial é obrigatório.' }
  }

  const { data, error } = await supabase
    .from('branches')
    .insert([
      {
        company_id: company_id || null,
        name,
        code,
        city,
        state,
        email,
        phone,
        contact,
        organization_id: user.organization_id,
      },
    ])
    .select('*, companies(name)')
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
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }
  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const email = (formData.get('email') as string)?.trim() || null
  const phone = (formData.get('phone') as string)?.trim() || null
  const contact = (formData.get('contact') as string)?.trim() || null

  const { data, error } = await supabase
    .from('branches')
    .update({ company_id: company_id || null, name, code, city, state, email, phone, contact })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('*, companies(name)')
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

  if (error) return { error: error.message }
  revalidatePath('/filiais')
  return { success: true }
}

// ==========================================
// 🚛 MOTORISTAS
// ==========================================

export async function getDrivers() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  let query = supabase
    .from('drivers')
    .select('*, companies(name)')
    .order('created_at', { ascending: false })

  if (user?.organization_id) {
    query = query.eq('organization_id', user.organization_id)
  }

  const { data, error } = await query
  if (error) {
    console.error('Erro ao buscar motoristas:', error.message)
    return []
  }
  return data || []
}

export async function createDriver(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }
  const name = formData.get('name') as string
  const cpf = formData.get('cpf') as string
  const phone = formData.get('phone') as string
  const default_plate = formData.get('default_plate') as string
  const pin = (formData.get('pin') as string) || '1234'

  const { data, error } = await supabase
    .from('drivers')
    .insert([
      {
        company_id: company_id || null,
        name,
        cpf,
        phone,
        default_plate,
        pin,
        organization_id: user.organization_id,
      },
    ])
    .select('*, companies(name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/motoristas')
  return { success: true, data }
}

export async function updateDriver(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }
  const name = formData.get('name') as string
  const cpf = formData.get('cpf') as string
  const phone = formData.get('phone') as string
  const default_plate = formData.get('default_plate') as string
  const pin = formData.get('pin') as string

  const updatePayload: Record<string, any> = { company_id: company_id || null, name, cpf, phone, default_plate }
  if (pin) {
    updatePayload.pin = pin
  }

  const { data, error } = await supabase
    .from('drivers')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('*, companies(name)')
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

export async function getTrips() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  let query = supabase
    .from('trips')
    .select(`
      *,
      companies(name),
      branches(name, code, city),
      drivers(name, phone, default_plate)
    `)
    .order('created_at', { ascending: false })

  if (user?.organization_id) {
    query = query.eq('organization_id', user.organization_id)
  }

  const { data, error } = await query
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

  let company_id = payload.company_id
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }

  const token = Math.random().toString(36).substring(2, 8).toUpperCase()

  const insertObj: any = {
    company_id: company_id || null,
    branch_id: payload.branch_id || null,
    driver_id: payload.driver_id,
    cte_number: payload.cte_number || null,
    service_type: payload.service_type || 'Estadia',
    status: payload.status || 'in_transit',
    sender: payload.sender || null,
    sender_id: payload.sender_id || null,
    destination: payload.destination,
    invoices: payload.invoices || [],
    recipients: payload.recipients || [],
    token,
    organization_id: user.organization_id,
  }

  if (payload.recipient_email) {
    insertObj.recipient_email = payload.recipient_email
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

  revalidatePath('/')
  revalidatePath('/novo-transporte')
  return { success: true, data }
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
  const supabase = await createClient()
  const updateData: any = {}
  if (payload.cte_number !== undefined) updateData.cte_number = payload.cte_number || null
  if (payload.service_type !== undefined) updateData.service_type = payload.service_type
  if (payload.sender !== undefined) updateData.sender = payload.sender || null
  if (payload.destination !== undefined) updateData.destination = payload.destination
  if (payload.invoices !== undefined) updateData.invoices = payload.invoices
  if (payload.driver_id !== undefined) updateData.driver_id = payload.driver_id
  if (payload.status !== undefined) updateData.status = payload.status

  const { data, error } = await supabase
    .from('trips')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select(`
      *,
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
  let photoUrl: string | null = null

  if (formData) {
    const file = formData.get('photo') as File | null
    if (file && file.size > 0) {
      const ext = file.name ? file.name.split('.').pop() : 'jpg'
      const fileName = `checkin_${tripId}_${Date.now()}.${ext}`

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
        console.warn('Erro ao subir foto no Supabase Storage:', uploadError?.message)
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

  // Disparo de e-mail de chegada
  let emailSent = false
  let recipientEmailTarget: string | undefined = undefined
  let emailSimulated = false

  try {
    const trip = data
    if (trip) {
      let targetEmail: string | null = null
      // Tenta buscar do cadastro atualizado de Destinatários primeiro
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

      // Fallback para o e-mail salvo na viagem na hora da criação
      if (!targetEmail) {
        targetEmail = trip.recipient_email || null
      }
      if (!targetEmail && Array.isArray(trip.recipients)) {
        const found = trip.recipients.find((r: any) => r.email && r.email.includes('@'))
        if (found) targetEmail = found.email
      }

      if (targetEmail) {
        recipientEmailTarget = targetEmail
        let destName = trip.destination || 'Destinatário'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        const extraCc = await getActiveCcEmails()

        // Busca filial vinculada ou usa a filial padrão do tenant/empresa como fallback
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

        // Adiciona e-mail operacional da filial se cadastrado
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

        const mailRes = await sendArrivalEmail({
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
          extraCc,
        })

        emailSent = mailRes.success
        emailSimulated = !!mailRes.simulated
      }
    }
  } catch (mailErr) {
    console.error('Erro ao processar disparo de e-mail de chegada:', mailErr)
  }

  revalidatePath(`/v/${data.token}`)
  revalidatePath('/')
  return {
    success: true,
    data,
    emailSent,
    recipientEmail: recipientEmailTarget,
    simulated: emailSimulated,
  }
}

export async function registerCheckout(tripId: string) {
  const supabase = await createClient()
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

  let emailSent = false
  let recipientEmailTarget: string | undefined = undefined
  let emailSimulated = false

  try {
    const trip = data
    if (trip) {
      let targetEmail: string | null = null
      
      // Tenta buscar do cadastro atualizado de Destinatários primeiro
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

      // Fallback para o e-mail salvo na viagem na hora da criação
      if (!targetEmail) {
        targetEmail = trip.recipient_email || null
      }
      if (!targetEmail && Array.isArray(trip.recipients)) {
        const found = trip.recipients.find((r: any) => r.email && r.email.includes('@'))
        if (found) targetEmail = found.email
      }

      if (targetEmail) {
        recipientEmailTarget = targetEmail
        let destName = trip.destination || 'Destinatário'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        const extraCc = await getActiveCcEmails()

        // Busca filial vinculada ou usa a filial padrão do tenant/empresa como fallback
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

        // Adiciona e-mail operacional da filial se cadastrado
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

        const mailRes = await sendCompletionEmail({
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

        emailSent = mailRes.success
        emailSimulated = !!mailRes.simulated
      }
    }
  } catch (mailErr) {
    console.error('Erro ao processar disparo de e-mail de saída:', mailErr)
  }

  revalidatePath(`/v/${data.token}`)
  revalidatePath('/')
  return {
    success: true,
    data,
    emailSent,
    recipientEmail: recipientEmailTarget,
    simulated: emailSimulated,
  }
}

export async function revertCheckin(tripId: string) {
  const supabase = await createClient()

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
  const supabase = await createClient()

  const { data: trip } = await supabase
    .from('trips')
    .select('id, drivers(pin)')
    .eq('token', token.toUpperCase())
    .single()

  if (!trip) return { error: 'Viagem não encontrada.' }

  // @ts-ignore
  const driverPin = trip.drivers?.pin || '1234'

  if (pin !== driverPin) {
    return { error: 'PIN incorreto. Tente novamente.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(`driver_auth_${token.toUpperCase()}`, 'true', {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    path: '/',
  })

  revalidatePath(`/v/${token}`)
  return { success: true }
}

/**
 * Rota de autoresgate do motorista:
 * Busca a viagem ativa do motorista através de seu CPF ou Telefone + PIN.
 */
export async function findActiveTripForDriver(identifier: string, pin: string) {
  const cleanId = identifier.replace(/\D/g, '')
  if (!cleanId || cleanId.length < 8) {
    return { error: 'Informe um CPF ou Telefone válido (apenas números).' }
  }

  const supabase = await createClient()

  // Busca motorista com esse CPF ou Telefone
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, pin, cpf, phone')

  if (!drivers || drivers.length === 0) {
    return { error: 'Nenhum motorista encontrado com este documento ou telefone.' }
  }

  const matchedDriver = drivers.find((d: any) => {
    const dCpf = (d.cpf || '').replace(/\D/g, '')
    const dPhone = (d.phone || '').replace(/\D/g, '')
    return dCpf.includes(cleanId) || cleanId.includes(dCpf) || dPhone.includes(cleanId) || cleanId.includes(dPhone)
  })

  if (!matchedDriver) {
    return { error: 'Motorista não localizado no sistema.' }
  }

  if ((matchedDriver.pin || '1234') !== pin) {
    return { error: 'PIN incorreto. Verifique com a central.' }
  }

  // Busca viagem ativa para esse motorista
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

  // Autoriza cookie preventivo
  const cookieStore = await cookies()
  cookieStore.set(`driver_auth_${activeTrip.token.toUpperCase()}`, 'true', {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    path: '/',
  })

  return { success: true, token: activeTrip.token }
}

// ==========================================
// 🏢 REMETENTES
// ==========================================

export async function getSenders() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  let query = supabase
    .from('senders')
    .select('*, companies(name), recipients(*)')
    .order('created_at', { ascending: false })

  if (user?.organization_id) {
    query = query.eq('organization_id', user.organization_id)
  }

  const { data, error } = await query
  if (error) {
    return []
  }
  return data || []
}

export async function createSender(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }
  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const zip_code = formData.get('zip_code') as string
  const cnpj = formData.get('cnpj') as string
  const ie = formData.get('ie') as string
  const phone = formData.get('phone') as string
  const franchise_hours = formData.get('franchise_hours') ? parseFloat(formData.get('franchise_hours') as string) : 0
  const demurrage_hourly_rate = formData.get('demurrage_hourly_rate') ? parseFloat(formData.get('demurrage_hourly_rate') as string) : 0

  const { data, error } = await supabase
    .from('senders')
    .insert([
      {
        company_id: company_id || null,
        name,
        address,
        city,
        zip_code,
        cnpj,
        ie,
        phone,
        franchise_hours,
        demurrage_hourly_rate,
        organization_id: user.organization_id,
      },
    ])
    .select('*, companies(name), recipients(*)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function updateSender(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }
  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const zip_code = formData.get('zip_code') as string
  const cnpj = formData.get('cnpj') as string
  const ie = formData.get('ie') as string
  const phone = formData.get('phone') as string
  const franchise_hours = formData.get('franchise_hours') ? parseFloat(formData.get('franchise_hours') as string) : 0
  const demurrage_hourly_rate = formData.get('demurrage_hourly_rate') ? parseFloat(formData.get('demurrage_hourly_rate') as string) : 0

  const { data, error } = await supabase
    .from('senders')
    .update({ company_id: company_id || null, name, address, city, zip_code, cnpj, ie, phone, franchise_hours, demurrage_hourly_rate })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('*, companies(name), recipients(*)')
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

export async function getRecipients(senderId?: string) {
  const user = await getCurrentUser()
  const supabase = await createClient()
  let query = supabase
    .from('recipients')
    .select('*, companies(name), senders(name, city)')
    .order('created_at', { ascending: false })

  if (user?.organization_id) {
    query = query.eq('organization_id', user.organization_id)
  }

  if (senderId) {
    query = query.eq('sender_id', senderId)
  }

  const { data, error } = await query
  if (error) {
    return []
  }
  return data || []
}

export async function createRecipient(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }
  const sender_id = (formData.get('sender_id') as string) || null
  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const zip_code = formData.get('zip_code') as string
  const cnpj = formData.get('cnpj') as string
  const ie = formData.get('ie') as string
  const phone = formData.get('phone') as string
  const email = (formData.get('email') as string) || ''

  const insertObj: any = {
    company_id: company_id || null,
    sender_id: sender_id || null,
    name,
    address,
    city,
    zip_code,
    cnpj,
    ie,
    phone,
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
  let company_id = formData.get('company_id') as string
  if (!company_id && user.organization_id) {
    company_id = (await getOrCreateTenantCompanyId(supabase, user.organization_id)) || ''
  }
  const sender_id = (formData.get('sender_id') as string) || null
  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const zip_code = formData.get('zip_code') as string
  const cnpj = formData.get('cnpj') as string
  const ie = formData.get('ie') as string
  const phone = formData.get('phone') as string
  const email = (formData.get('email') as string) || ''

  const updateObj: any = {
    company_id: company_id || null,
    sender_id: sender_id || null,
    name,
    address,
    city,
    zip_code,
    cnpj,
    ie,
    phone,
  }

  if (email !== undefined) {
    updateObj.email = email || null
  }

  let { data, error } = await supabase
    .from('recipients')
    .update(updateObj)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select('*, companies(name), senders(name, city)')
    .single()

  if (error && error.message?.includes('email')) {
    delete updateObj.email
    const retry = await supabase
      .from('recipients')
      .update(updateObj)
      .eq('id', id)
      .eq('organization_id', user.organization_id)
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

export async function getNotificationEmails() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  try {
    let query = supabase
      .from('notification_emails')
      .select('*')
      .order('created_at', { ascending: false })

    if (user?.organization_id) {
      query = query.eq('organization_id', user.organization_id)
    }

    const { data, error } = await query
    if (error) {
      return []
    }
    return data || []
  } catch {
    return []
  }
}

async function getActiveCcEmails(): Promise<string[]> {
  try {
    const emails = await getNotificationEmails()
    return emails.filter((item: any) => item.active).map((item: any) => item.email)
  } catch {
    return []
  }
}

export async function createNotificationEmail(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  const name = formData.get('name') as string
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const active = formData.get('active') !== 'false'

  if (!email || !email.includes('@')) {
    return { error: 'E-mail inválido.' }
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
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/emails')
  return { success: true, data }
}

export async function updateNotificationEmail(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  const name = formData.get('name') as string
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const active = formData.get('active') === 'true'

  const { data, error } = await supabase
    .from('notification_emails')
    .update({ name, email, active })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .select()
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
    .select()
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
  const cnpj = (formData.get('cnpj') as string)?.trim() || null
  const adminName = (formData.get('adminName') as string)?.trim()
  const adminEmail = (formData.get('adminEmail') as string)?.trim().toLowerCase()
  const adminPassword = formData.get('adminPassword') as string

  if (!companyName) {
    return { error: 'O nome da empresa / organização é obrigatório.' }
  }
  if (!adminName) {
    return { error: 'O nome do administrador é obrigatório.' }
  }
  if (!adminEmail || !adminEmail.includes('@')) {
    return { error: 'E-mail do administrador inválido.' }
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
    `, [companyName, cnpj, slug])
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
    `, [organizationId, companyName, cnpj])
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
    return { success: true }
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
  await requireSuperAdmin()
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
  const cnpj = (formData.get('cnpj') as string)?.trim() || null
  const logoUrl = (formData.get('logoUrl') as string) || null

  if (!companyName) {
    return { error: 'O nome da empresa / organização é obrigatório.' }
  }

  const pool = getDbPool()
  let client
  try {
    client = await pool.connect()
    await client.query(`
      UPDATE public.organizations 
      SET name = $1, cnpj = $2, logo_url = $3, updated_at = now() 
      WHERE id = $4::uuid;
    `, [companyName, cnpj, logoUrl, orgId])

    await client.query(`
      UPDATE public.companies
      SET name = $1, cnpj = $2
      WHERE organization_id = $3::uuid;
    `, [companyName, cnpj, orgId])

    revalidatePath('/master')
    return { success: true }
  } catch (err: any) {
    console.error('Erro ao atualizar tenant:', err)
    return { error: err.message || 'Erro ao atualizar dados do tenant.' }
  } finally {
    if (client) client.release()
  }
}
