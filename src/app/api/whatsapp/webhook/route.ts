import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/utils/db'
import {
  sendWhatsAppTextMessage,
  sendTripWhatsAppPrompt,
  normalizeWhatsAppNumber,
} from '@/utils/whatsapp'
import { sendArrivalEmail } from '@/utils/mailer'

export const dynamic = 'force-dynamic'

/**
 * GET: Validação do Webhook pela Meta
 * A Meta faz uma requisição GET para confirmar o webhook com hub.verify_token e responde com hub.challenge
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'auditcargo_webhook_token'

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ [WhatsApp Webhook] Verificação da Meta realizada com sucesso!')
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('⚠️ [WhatsApp Webhook] Tentativa de verificação com token inválido.')
  return new Response('Forbidden', { status: 403 })
}

/**
 * POST: Recebe eventos de mensagens, status de entrega e cliques de botão
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Valida se o payload é da conta do WhatsApp Business
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }

    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const message = value?.messages?.[0]

    // Se for apenas notificação de entrega/leitura de mensagem (statuses), confirma recebimento
    if (!message) {
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }

    const fromRaw = message.from as string
    const from = normalizeWhatsAppNumber(fromRaw)
    const msgType = message.type as string

    console.log(`📩 [WhatsApp Webhook] Mensagem recebida de ${from} (Tipo: ${msgType})`)

    // ========================================================
    // 1. PROCESSAMENTO DE CLIQUES EM BOTÕES INTERATIVOS
    // ========================================================
    if (msgType === 'interactive' && message.interactive?.type === 'button_reply') {
      const buttonId = message.interactive.button_reply?.id as string
      const buttonTitle = message.interactive.button_reply?.title as string

      console.log(`🔘 [WhatsApp Webhook] Botão clicado: ${buttonId} (${buttonTitle})`)

      if (buttonId.startsWith('ARRIVED_')) {
        const tripId = buttonId.replace('ARRIVED_', '')
        await handleArrivedAction(tripId, from)
      } else if (buttonId.startsWith('TRANSIT_')) {
        await sendWhatsAppTextMessage(
          from,
          '👍 *AuditCargo:* Perfeito! Viagem confirmada em trânsito. Dirija com atenção e nos avise assim que encostar no destino.'
        )
      } else if (buttonId.startsWith('ISSUE_')) {
        await sendWhatsAppTextMessage(
          from,
          '⚠️ *AuditCargo:* Alerta de imprevisto registrado! Nossa equipe de logística foi notificada. Se desejar, descreva aqui em poucas palavras o que ocorreu.'
        )
      }

      return NextResponse.json({ status: 'processed' }, { status: 200 })
    }

    // ========================================================
    // 2. PROCESSAMENTO DE MENSAGENS DE TEXTO
    // ========================================================
    if (msgType === 'text') {
      const text = (message.text?.body || '').trim()
      const textUpper = text.toUpperCase()

      // Caso o motorista tenha digitado o Token da viagem (ex: ZNGG4J)
      if (textUpper.length === 6 && /^[A-Z0-9]{6}$/.test(textUpper)) {
        const trip = await findTripByToken(textUpper)
        if (trip) {
          await sendTripWhatsAppPrompt({
            id: trip.id,
            token: trip.token,
            destination: trip.destination,
            cte_number: trip.cte_number,
            service_type: trip.service_type,
            drivers: { name: trip.driver_name, phone: from },
          })
          return NextResponse.json({ status: 'token_prompt_sent' }, { status: 200 })
        }
      }

      // Caso digite "cheguei", "cheguei na portaria" ou "1"
      if (
        text.toLowerCase().includes('cheguei') ||
        text === '1' ||
        text.toLowerCase() === 'chegada'
      ) {
        const activeTrip = await findActiveTripByPhone(from)
        if (activeTrip) {
          await handleArrivedAction(activeTrip.id, from)
          return NextResponse.json({ status: 'arrival_registered' }, { status: 200 })
        }
      }

      // Mensagem padrão: tenta localizar viagem ativa pelo número do celular
      const activeTrip = await findActiveTripByPhone(from)
      if (activeTrip) {
        await sendTripWhatsAppPrompt({
          id: activeTrip.id,
          token: activeTrip.token,
          destination: activeTrip.destination,
          cte_number: activeTrip.cte_number,
          service_type: activeTrip.service_type,
          drivers: { name: activeTrip.driver_name, phone: from },
        })
      } else {
        await sendWhatsAppTextMessage(
          from,
          '👋 Olá! Sou o assistente automático do *AuditCargo*.\n\n' +
            'Não localizamos nenhuma viagem em andamento para este número de telefone.\n\n' +
            '💡 Se você recebeu um código da viagem (Token de 6 caracteres, ex: *ZNGG4J*), digite-o aqui para iniciar o acompanhamento.'
        )
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (error: any) {
    console.error('❌ [WhatsApp Webhook Error]:', error)
    // Retorna 200 mesmo em caso de erro interno para evitar re-tentativas infinitas da Meta
    return NextResponse.json({ error: error.message }, { status: 200 })
  }
}

/**
 * Registra a chegada da viagem e responde no WhatsApp
 */
async function handleArrivedAction(tripId: string, driverPhone: string) {
  const pool = getDbPool()
  const now = new Date()

  try {
    // Atualiza status e arrival_time caso não esteja finalizada
    const updateRes = await pool.query(
      `
      UPDATE trips
      SET status = 'arrived',
          arrival_time = COALESCE(arrival_time, NOW())
      WHERE id = $1 AND status != 'finished'
      RETURNING *
    `,
      [tripId]
    )

    if (updateRes.rows.length === 0) {
      await sendWhatsAppTextMessage(
        driverPhone,
        'ℹ️ Esta viagem já foi finalizada ou não pôde ser atualizada.'
      )
      return
    }

    const trip = updateRes.rows[0]
    const timeFormatted = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    // Confirmação para o motorista no WhatsApp
    await sendWhatsAppTextMessage(
      driverPhone,
      `✅ *Chegada confirmada com sucesso às ${timeFormatted}!* \n\n` +
        `Destino: *${trip.destination}*\n` +
        `A sua franquia de estadia foi iniciada oficialmente no sistema.\n\n` +
        `O destinatário foi notificado por e-mail. Bom trabalho!`
    )

    // Disparo de e-mail de aviso para o destinatário (em segundo plano)
    try {
      const emailTarget = trip.recipient_email
      if (emailTarget) {
        let destName = trip.destination || 'Destinatário'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        const driverInfo = await pool.query('SELECT name, phone FROM drivers WHERE id = $1', [
          trip.driver_id,
        ])
        const driver = driverInfo.rows[0] || {}

        await sendArrivalEmail({
          toEmail: emailTarget,
          cteNumber: trip.cte_number || undefined,
          driverName: driver.name || 'Motorista',
          destinationName: destName,
          destinationCity: destCity,
          arrivalTime: now.toISOString(),
          invoices: trip.invoices || [],
        })
      }
    } catch (emailErr) {
      console.error('⚠️ [WhatsApp Webhook] Erro ao enviar e-mail de chegada:', emailErr)
    }
  } catch (err) {
    console.error('❌ [WhatsApp Webhook] Erro ao processar chegada:', err)
    await sendWhatsAppTextMessage(
      driverPhone,
      'Desculpe, ocorreu um erro ao registrar sua chegada. Por favor, tente novamente ou contate a base.'
    )
  }
}

/**
 * Busca viagem pelo Token de 6 caracteres
 */
async function findTripByToken(token: string) {
  const pool = getDbPool()
  const res = await pool.query(
    `
    SELECT t.*, d.name as driver_name, d.phone as driver_phone
    FROM trips t
    LEFT JOIN drivers d ON t.driver_id = d.id
    WHERE UPPER(t.token) = $1 AND t.status != 'cancelled'
    LIMIT 1
  `,
    [token.toUpperCase()]
  )
  return res.rows[0] || null
}

/**
 * Busca a viagem ativa mais recente do motorista pelo telefone
 */
async function findActiveTripByPhone(phone: string) {
  const pool = getDbPool()
  // Tenta match exato ou pelos últimos 8 ou 9 dígitos (DDD + número)
  const cleanDigits = phone.replace(/\D/g, '')
  const last8 = cleanDigits.slice(-8)

  const res = await pool.query(
    `
    SELECT t.*, d.name as driver_name, d.phone as driver_phone
    FROM trips t
    JOIN drivers d ON t.driver_id = d.id
    WHERE (regexp_replace(d.phone, '[^0-9]', '', 'g') LIKE '%' || $1)
      AND t.status IN ('in_transit', 'pending', 'arrived')
    ORDER BY t.created_at DESC
    LIMIT 1
  `,
    [last8]
  )
  return res.rows[0] || null
}
