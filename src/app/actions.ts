'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { sendArrivalEmail } from '@/utils/mailer'

// --- EMPRESAS ---
export async function getCompanies() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Erro ao buscar empresas:', error.message)
    return []
  }
  return data || []
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient()
  const name = formData.get('name') as string
  const cnpj = formData.get('cnpj') as string

  const { data, error } = await supabase
    .from('companies')
    .insert([{ name, cnpj }])
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/empresas')
  return { success: true, data }
}

export async function updateCompany(id: string, formData: FormData) {
  const supabase = await createClient()
  const name = formData.get('name') as string
  const cnpj = formData.get('cnpj') as string

  const { data, error } = await supabase
    .from('companies')
    .update({ name, cnpj })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/empresas')
  revalidatePath('/filiais')
  revalidatePath('/motoristas')
  return { success: true, data }
}

export async function deleteCompany(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('companies').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/empresas')
  revalidatePath('/filiais')
  revalidatePath('/motoristas')
  return { success: true }
}

// --- FILIAIS ---
export async function getBranches() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('branches')
    .select('*, companies(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar filiais:', error.message)
    return []
  }
  return data || []
}

export async function createBranch(formData: FormData) {
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string

  const { data, error } = await supabase
    .from('branches')
    .insert([{ company_id, name, code, city, state }])
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/filiais')
  return { success: true, data }
}

export async function updateBranch(id: string, formData: FormData) {
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string

  const { data, error } = await supabase
    .from('branches')
    .update({ company_id, name, code, city, state })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/filiais')
  return { success: true, data }
}

export async function deleteBranch(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('branches').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/filiais')
  return { success: true }
}

// --- MOTORISTAS ---
export async function getDrivers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('drivers')
    .select('*, companies(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar motoristas:', error.message)
    return []
  }
  return data || []
}

export async function createDriver(formData: FormData) {
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
  const name = formData.get('name') as string
  const cpf = formData.get('cpf') as string
  const phone = formData.get('phone') as string
  const default_plate = formData.get('default_plate') as string
  const pin = formData.get('pin') as string || '1234'

  const { data, error } = await supabase
    .from('drivers')
    .insert([{ company_id, name, cpf, phone, default_plate, pin }])
    .select('*, companies(name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/motoristas')
  return { success: true, data }
}

export async function updateDriver(id: string, formData: FormData) {
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
  const name = formData.get('name') as string
  const cpf = formData.get('cpf') as string
  const phone = formData.get('phone') as string
  const default_plate = formData.get('default_plate') as string
  const pin = formData.get('pin') as string

  const updatePayload: Record<string, any> = { company_id, name, cpf, phone, default_plate }
  if (pin) {
    updatePayload.pin = pin
  }

  const { data, error } = await supabase
    .from('drivers')
    .update(updatePayload)
    .eq('id', id)
    .select('*, companies(name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/motoristas')
  return { success: true, data }
}

export async function deleteDriver(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('drivers').delete().eq('id', id)

  if (error) {
    if (error.message.includes('foreign key') || error.code === '23503') {
      return { error: 'Não é possível excluir este motorista pois existem transportes vinculados a ele.' }
    }
    return { error: error.message }
  }

  revalidatePath('/motoristas')
  return { success: true }
}

// --- VIAGENS / TRANSPORTES ---
export async function getTrips() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      companies(name),
      branches(name, code, city),
      drivers(name, phone, default_plate)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar transportes:', error.message)
    return []
  }
  return data || []
}

export async function createTrip(payload: {
  company_id: string
  branch_id?: string
  driver_id: string
  cte_number?: string
  service_type: string
  status: string
  sender?: string
  destination: string
  invoices: string[]
  recipient_email?: string
  recipients?: Array<{ name: string; destination: string; invoices: string; email?: string }>
}) {
  const supabase = await createClient()

  const token = Math.random().toString(36).substring(2, 8).toUpperCase()

  const insertObj: any = {
    company_id: payload.company_id,
    branch_id: payload.branch_id || null,
    driver_id: payload.driver_id,
    cte_number: payload.cte_number || null,
    service_type: payload.service_type || 'Estadia',
    status: payload.status || 'in_transit',
    sender: payload.sender || null,
    destination: payload.destination,
    invoices: payload.invoices || [],
    recipients: payload.recipients || [],
    token,
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

  // Se der erro por coluna recipient_email nÃ£o existir no banco, tenta sem a coluna
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

// --- TELEMETRIA DO MOTORISTA ---
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
      try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const fileExt = file.name.split('.').pop() || 'jpg'
        const fileName = `${tripId}_checkin_${Date.now()}.${fileExt}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('proofs')
          .upload(fileName, buffer, {
            contentType: file.type || 'image/jpeg',
            upsert: true,
          })

        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('proofs')
            .getPublicUrl(fileName)
          photoUrl = publicUrlData.publicUrl
        } else {
          // Fallback base64
          const base64 = buffer.toString('base64')
          photoUrl = `data:${file.type || 'image/jpeg'};base64,${base64}`
        }
      } catch (err) {
        console.error('Erro ao processar foto:', err)
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
      drivers(name, phone)
    `)
    .single()

  if (error) {
    return { error: error.message }
  }

  // --- DISPARO DE E-MAIL AUTOMÃTICO DE CHEGADA AO DESTINATÃRIO ---
  let emailSent = false
  let recipientEmailTarget: string | undefined = undefined
  let emailSimulated = false

  try {
    const trip = data
    if (trip) {
      // 1. Tenta pegar de recipient_email direto na trip
      let targetEmail = trip.recipient_email || null

      // 2. Tenta pegar do array de destinatÃ¡rios salvo na viagem
      if (!targetEmail && Array.isArray(trip.recipients)) {
        const found = trip.recipients.find((r: any) => r.email && r.email.includes('@'))
        if (found) targetEmail = found.email
      }

      // 3. Tenta buscar pelo cadastro de destinatÃ¡rios no banco
      if (!targetEmail) {
        const { data: recList } = await supabase
          .from('recipients')
          .select('name, city, email')
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
      }

      if (targetEmail) {
        recipientEmailTarget = targetEmail
        let destName = trip.destination || 'DestinatÃ¡rio'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        const mailRes = await sendArrivalEmail({
          toEmail: targetEmail,
          destinationName: destName,
          destinationCity: destCity,
          invoices: trip.invoices || [],
          arrivalTime: arrivalTime,
          cteNumber: trip.cte_number,
          driverName: trip.drivers?.name,
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

  const { data, error } = await supabase
    .from('trips')
    .update({
      status: 'finished',
      completion_time: new Date().toISOString(),
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

// --- REMETENTES ---
export async function getSenders() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('senders')
    .select('*, companies(name), recipients(*)')
    .order('created_at', { ascending: false })

  if (error) {
    const fallback = await supabase
      .from('senders')
      .select('*, companies(name)')
      .order('created_at', { ascending: false })
    return fallback.data || []
  }
  return data || []
}

export async function createSender(formData: FormData) {
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const zip_code = formData.get('zip_code') as string
  const cnpj = formData.get('cnpj') as string
  const ie = formData.get('ie') as string
  const phone = formData.get('phone') as string

  const { data, error } = await supabase
    .from('senders')
    .insert([{ company_id, name, address, city, zip_code, cnpj, ie, phone }])
    .select('*, companies(name), recipients(*)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function updateSender(id: string, formData: FormData) {
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const zip_code = formData.get('zip_code') as string
  const cnpj = formData.get('cnpj') as string
  const ie = formData.get('ie') as string
  const phone = formData.get('phone') as string

  const { data, error } = await supabase
    .from('senders')
    .update({ company_id, name, address, city, zip_code, cnpj, ie, phone })
    .eq('id', id)
    .select('*, companies(name), recipients(*)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true, data }
}

export async function deleteSender(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('senders').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true }
}

// --- DESTINATÃRIOS ---
export async function getRecipients(senderId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('recipients')
    .select('*, companies(name), senders(name, city)')
    .order('created_at', { ascending: false })

  if (senderId) {
    query = query.eq('sender_id', senderId)
  }

  const { data, error } = await query

  if (error) {
    const fallback = await supabase
      .from('recipients')
      .select('*, companies(name)')
      .order('created_at', { ascending: false })
    return fallback.data || []
  }
  return data || []
}

export async function createRecipient(formData: FormData) {
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
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
    company_id,
    sender_id: sender_id || null,
    name,
    address,
    city,
    zip_code,
    cnpj,
    ie,
    phone,
  }

  if (email) {
    insertObj.email = email
  }

  let { data, error } = await supabase
    .from('recipients')
    .insert([insertObj])
    .select('*, companies(name), senders(name, city)')
    .single()

  // Se falhar porque a coluna email ainda nÃ£o existe na tabela, tenta sem email
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
  const supabase = await createClient()
  const company_id = formData.get('company_id') as string
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
    company_id,
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
    .select('*, companies(name), senders(name, city)')
    .single()

  if (error && error.message?.includes('email')) {
    delete updateObj.email
    const retry = await supabase
      .from('recipients')
      .update(updateObj)
      .eq('id', id)
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
  const supabase = await createClient()
  const { error } = await supabase.from('recipients').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/destinatarios')
  revalidatePath('/remetentes')
  revalidatePath('/novo-transporte')
  return { success: true }
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
  cookieStore.set(`driver_auth_${token}`, 'true', { maxAge: 60 * 60 * 24 * 7, httpOnly: true })
  
  revalidatePath(`/v/${token}`)
  return { success: true }
}

