import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/utils/db'
import {
  sendTelegramTextMessage,
  sendTripTelegramPrompt,
  answerTelegramCallbackQuery,
  getTelegramFileDirectUrl,
} from '@/utils/telegram'
import { sendArrivalEmail, sendCompletionEmail } from '@/utils/mailer'

export const dynamic = 'force-dynamic'

/**
 * GET: Verificação de status do Webhook do Telegram
 */
export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'AuditCargo Telegram Webhook',
    timestamp: new Date().toISOString(),
  })
}

/**
 * POST: Recebe eventos do Telegram Bot (Updates)
 * Tipos de update: message (texto, location, photo) e callback_query (cliques em botões inline)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // ========================================================
    // 1. PROCESSAMENTO DE CLIQUES EM BOTÕES INLINE (CALLBACK)
    // ========================================================
    if (body.callback_query) {
      const callback = body.callback_query
      const callbackId = callback.id
      const data = (callback.data || '') as string
      const fromChatId = callback.message?.chat?.id || callback.from?.id

      console.log(`🔘 [Telegram Webhook] Callback: ${data} de Chat ID ${fromChatId}`)

      if (data.startsWith('ARRIVED_')) {
        const tripId = data.replace('ARRIVED_', '')
        await answerTelegramCallbackQuery(callbackId)
        
        await sendTelegramTextMessage(
          fromChatId,
          'Você tem algum Canhoto/Comprovante de Portaria para anexar agora? (A chegada só é confirmada após essa etapa)',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Sim, anexar foto agora', callback_data: `ATTACH_CANHOTO_${tripId}` }
                ],
                [
                  { text: '➡️ Não, confirmar chegada sem foto', callback_data: `CONFIRM_ARRIVE_${tripId}` }
                ]
              ]
            }
          }
        )
      } else if (data.startsWith('ATTACH_CANHOTO_')) {
        await answerTelegramCallbackQuery(callbackId)
        await sendTelegramTextMessage(
          fromChatId,
          '📷 Por favor, envie a foto nítida do canhoto aqui no chat. Assim que recebermos, confirmaremos sua chegada automaticamente!'
        )
      } else if (data.startsWith('CONFIRM_ARRIVE_')) {
        const tripId = data.replace('CONFIRM_ARRIVE_', '')
        await answerTelegramCallbackQuery(callbackId, 'Registrando chegada no destino...')
        await handleArrivedAction(tripId, fromChatId)
      } else if (data.startsWith('ROLLBACK_ARRIVE_')) {
        const tripId = data.replace('ROLLBACK_ARRIVE_', '')
        await answerTelegramCallbackQuery(callbackId, 'Desfazendo chegada...')
        await handleRollbackAction(tripId, fromChatId)
      } else if (data.startsWith('FINISH_DISCHARGE_')) {
        const tripId = data.replace('FINISH_DISCHARGE_', '')
        await answerTelegramCallbackQuery(callbackId, 'Finalizando descarga...')
        await handleFinishDischargeAction(tripId, fromChatId)
      } else if (data.startsWith('ROLLBACK_FINISH_')) {
        const tripId = data.replace('ROLLBACK_FINISH_', '')
        await answerTelegramCallbackQuery(callbackId, 'Desfazendo finalização...')
        await handleRollbackFinishAction(tripId, fromChatId)
      } else if (data.startsWith('TRANSIT_')) {
        await answerTelegramCallbackQuery(callbackId, 'Viagem em trânsito!')
        await sendTelegramTextMessage(
          fromChatId,
          '👍 <b>AuditCargo:</b> Perfeito! Viagem confirmada em trânsito. Dirija com atenção e nos avise assim que encostar no destino.'
        )
      } else if (data.startsWith('ISSUE_')) {
        await answerTelegramCallbackQuery(callbackId, 'Alerta de imprevisto registrado!')
        await sendTelegramTextMessage(
          fromChatId,
          '⚠️ <b>AuditCargo:</b> Alerta de imprevisto registrado! Nossa equipe de logística foi notificada. Se desejar, descreva aqui em poucas palavras o que ocorreu.'
        )
      } else if (data.startsWith('REQ_LOCATION_')) {
        await answerTelegramCallbackQuery(callbackId)
        await sendTelegramTextMessage(
          fromChatId,
          '📍 <b>AuditCargo:</b> Para enviar sua localização atual:\n\n' +
            '1. Toque no ícone de <b>anexo (clipe 📎)</b> aqui no chat.\n' +
            '2. Selecione a opção <b>Localização</b> e envie.'
        )
      } else if (data.startsWith('REQ_PHOTO_')) {
        await answerTelegramCallbackQuery(callbackId)
        await sendTelegramTextMessage(
          fromChatId,
          '📷 <b>AuditCargo:</b> Por favor, tire uma foto nítida do canhoto assinado ou comprovante de entrega e envie diretamente aqui nesta conversa.'
        )
      } else {
        await answerTelegramCallbackQuery(callbackId)
      }

      return NextResponse.json({ ok: true })
    }

    // ========================================================
    // 2. PROCESSAMENTO DE MENSAGENS (TEXTO, LOCALIZAÇÃO, FOTO)
    // ========================================================
    const message = body.message
    if (!message) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat?.id
    const fromUser = message.from || {}
    const telegramUsername = fromUser.username ? `@${fromUser.username}` : ''

    // 2.1. RECEBIMENTO DE LOCALIZAÇÃO GPS
    if (message.location) {
      const { latitude, longitude } = message.location
      console.log(`📍 [Telegram Webhook] Localização recebida de ${chatId}: ${latitude}, ${longitude}`)

      const pool = getDbPool()
      const updateRes = await pool.query(
        `
        UPDATE trips
        SET last_driver_latitude = $1,
            last_driver_longitude = $2
        WHERE telegram_chat_id = $3 AND status != 'finished'
        RETURNING id, token, destination
        `,
        [latitude, longitude, String(chatId)]
      )

      if (updateRes.rows.length > 0) {
        const trip = updateRes.rows[0]
        await sendTelegramTextMessage(
          chatId,
          `📍 <b>AuditCargo:</b> Localização GPS registrada com sucesso para a Viagem <b>#${trip.token}</b>!\n` +
            `Coordenadas: <code>${latitude.toFixed(5)}, ${longitude.toFixed(5)}</code>`
        )
      } else {
        await sendTelegramTextMessage(
          chatId,
          '📍 <b>AuditCargo:</b> Localização recebida! Porém nenhuma viagem ativa vinculada foi encontrada para este chat.'
        )
      }

      return NextResponse.json({ ok: true })
    }

    // 2.2. RECEBIMENTO DE FOTO (CANHOTO / COMPROVANTE)
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
      const bestPhoto = message.photo[message.photo.length - 1]
      const fileId = bestPhoto.file_id
      console.log(`📷 [Telegram Webhook] Foto recebida de ${chatId}: ${fileId}`)

      const fileUrl = await getTelegramFileDirectUrl(fileId)

      if (fileUrl) {
        const activeTrip = await findActiveTripByChatId(String(chatId))

        if (activeTrip) {
          const pool = getDbPool()
          await pool.query(
            `
            UPDATE trips
            SET checkin_photo_url = $1, delivery_receipt_url = $1
            WHERE id = $2
            `,
            [fileUrl, activeTrip.id]
          )

          const trip = activeTrip
          
          if (trip.status === 'in_progress' || trip.status === 'pending' || trip.status === 'in_transit') {
            await sendTelegramTextMessage(
              chatId,
              `📸 <b>AuditCargo:</b> Foto recebida! Confirmando sua chegada automaticamente...`
            )
            await handleArrivedAction(trip.id, chatId)
          } else {
            await sendTelegramTextMessage(
              chatId,
              `📸 <b>AuditCargo:</b> Foto do comprovante/canhoto recebida e vinculada com sucesso à Viagem <b>#${trip.token}</b>!`
            )
          }
        } else {
          await sendTelegramTextMessage(
            chatId,
            '📸 <b>AuditCargo:</b> Foto recebida, mas não encontramos uma viagem ativa em andamento para este chat.'
          )
        }
      }

      return NextResponse.json({ ok: true })
    }

    // 2.3. PROCESSAMENTO DE TEXTO E COMANDOS
    const text = (message.text || '').trim()

    // Comando /start com Deep Link (ex: /start trip_ZNGG4J)
    if (text.startsWith('/start')) {
      const parts = text.split(' ')
      const param = parts[1] || ''

      if (param.startsWith('trip_')) {
        const token = param.replace('trip_', '').toUpperCase().trim()
        const trip = await linkTelegramTripByToken(token, String(chatId), telegramUsername)

        if (trip) {
          await sendTripTelegramPrompt(chatId, {
            id: trip.id,
            token: trip.token,
            destination: trip.destination,
            status: trip.status,
            cte_number: trip.cte_number,
            service_type: trip.service_type,
            drivers: { name: trip.driver_name, phone: trip.driver_phone },
          })
          return NextResponse.json({ ok: true })
        } else {
          await sendTelegramTextMessage(
            chatId,
            `⚠️ Viagem com código <b>${token}</b> não encontrada ou já finalizada.`
          )
          return NextResponse.json({ ok: true })
        }
      }

      // Boas-vindas sem token de viagem
      await sendTelegramTextMessage(
        chatId,
        '👋 Olá! Sou o assistente automático do <b>AuditCargo</b>.\n\n' +
          'Para acompanhar sua viagem, abra o link enviado pela transportadora ou digite aqui o <b>Token da Viagem</b> (ex: <code>ZNGG4J</code>).'
      )
      return NextResponse.json({ ok: true })
    }

    // Caso o motorista digite o token avulso diretamente (ex: 6 a 8 caracteres alfanuméricos)
    const tokenMatch = text.toUpperCase()
    if (tokenMatch.length >= 6 && tokenMatch.length <= 8 && /^[A-Z0-9]{6,8}$/.test(tokenMatch)) {
      const trip = await linkTelegramTripByToken(tokenMatch, String(chatId), telegramUsername)
      if (trip) {
        await sendTripTelegramPrompt(chatId, {
          id: trip.id,
          token: trip.token,
          destination: trip.destination,
          status: trip.status,
          cte_number: trip.cte_number,
          service_type: trip.service_type,
          drivers: { name: trip.driver_name, phone: trip.driver_phone },
        })
        return NextResponse.json({ ok: true })
      }
    }

    // Caso digite "cheguei" no texto
    if (text.toLowerCase().includes('cheguei') || text === '1') {
      const activeTrip = await findActiveTripByChatId(String(chatId))
      if (activeTrip) {
        await handleArrivedAction(activeTrip.id, chatId)
        return NextResponse.json({ ok: true })
      }
    }

    // Tenta encontrar uma viagem ativa para o motorista pelo chatId
    const activeTripForChat = await findActiveTripByChatId(String(chatId))
    if (activeTripForChat) {
      await sendTripTelegramPrompt(chatId, {
        id: activeTripForChat.id,
        token: activeTripForChat.token,
        destination: activeTripForChat.destination,
        status: activeTripForChat.status,
        cte_number: activeTripForChat.cte_number,
        service_type: activeTripForChat.service_type,
        drivers: { name: activeTripForChat.driver_name, phone: activeTripForChat.driver_phone },
      })
      return NextResponse.json({ ok: true })
    }

    // Resposta padrão caso nenhuma viagem seja identificada
    await sendTelegramTextMessage(
      chatId,
      'ℹ️ <b>AuditCargo Bot:</b> Não identificamos uma viagem ativa no momento. Digite o código/token da sua viagem para consultar o status.'
    )

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('❌ [Telegram Webhook Error]:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  }
}

/**
 * Localiza e vincula a viagem ao chatId do Telegram do motorista
 */
async function linkTelegramTripByToken(token: string, chatId: string, telegramUsername: string) {
  const pool = getDbPool()
  try {
    const res = await pool.query(
      `
      SELECT t.*, d.name as driver_name, d.phone as driver_phone
      FROM trips t
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE UPPER(t.token) = $1 AND t.status != 'finished'
      LIMIT 1
      `,
      [token]
    )

    if (res.rows.length === 0) return null

    const trip = res.rows[0]

    // Atualiza o telegram_chat_id na viagem
    await pool.query('UPDATE trips SET telegram_chat_id = $1 WHERE id = $2', [chatId, trip.id])

    // Atualiza também no cadastro do motorista para futuros envios proativos
    if (trip.driver_id) {
      await pool.query(
        `
        UPDATE drivers 
        SET telegram_chat_id = $1,
            telegram_username = COALESCE(NULLIF($2, ''), telegram_username)
        WHERE id = $3
        `,
        [chatId, telegramUsername, trip.driver_id]
      )
    }

    return trip
  } catch (err) {
    console.error('❌ [Telegram] Erro ao vincular viagem por token:', err)
    return null
  }
}

/**
 * Localiza viagem ativa vinculada ao chatId
 */
async function findActiveTripByChatId(chatId: string) {
  const pool = getDbPool()
  try {
    const res = await pool.query(
      `
      SELECT t.*, d.name as driver_name, d.phone as driver_phone
      FROM trips t
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE (t.telegram_chat_id = $1 OR d.telegram_chat_id = $1)
        AND t.status NOT IN ('finished', 'cancelled')
      ORDER BY t.created_at DESC
      LIMIT 1
      `,
      [chatId]
    )
    return res.rows[0] || null
  } catch (err) {
    console.error('❌ [Telegram] Erro ao buscar viagem ativa por chatId:', err)
    return null
  }
}

/**
 * Recupera contexto completo para disparo de e-mails (empresa, filial, motorista, remetente e CCs)
 * Idêntico à lógica das Server Actions disparadas via tela web (/v/[token])
 */
async function getTripEmailContext(pool: any, trip: any) {
  // 1. Motorista
  let driverName = 'Motorista'
  if (trip.driver_id) {
    const dRes = await pool.query('SELECT name, phone FROM drivers WHERE id = $1', [trip.driver_id])
    if (dRes.rows[0]?.name) driverName = dRes.rows[0].name
  }

  // 2. Filial
  let branchData: any = null
  if (trip.branch_id) {
    const bRes = await pool.query(
      'SELECT name, code, city, state, email, phone, contact FROM branches WHERE id = $1',
      [trip.branch_id]
    )
    branchData = bRes.rows[0] || null
  }
  if (!branchData && trip.organization_id) {
    const bRes = await pool.query(
      'SELECT name, code, city, state, email, phone, contact FROM branches WHERE organization_id = $1 LIMIT 1',
      [trip.organization_id]
    )
    branchData = bRes.rows[0] || null
  }
  if (!branchData && trip.company_id) {
    const bRes = await pool.query(
      'SELECT name, code, city, state, email, phone, contact FROM branches WHERE company_id = $1 LIMIT 1',
      [trip.company_id]
    )
    branchData = bRes.rows[0] || null
  }

  // 3. Empresa transportadora
  let companyData: any = null
  if (trip.company_id) {
    const cRes = await pool.query(
      'SELECT name, contact, phone, email, website FROM companies WHERE id = $1',
      [trip.company_id]
    )
    companyData = cRes.rows[0] || null
  }
  if (!companyData && trip.organization_id) {
    const cRes = await pool.query(
      'SELECT name, contact, phone, email, website FROM companies WHERE organization_id = $1 LIMIT 1',
      [trip.organization_id]
    )
    companyData = cRes.rows[0] || null
  }

  // 4. E-mails em cópia (extraCc)
  const extraCc: string[] = []
  if (trip.organization_id) {
    try {
      const ccRes = await pool.query(
        'SELECT email FROM notification_emails WHERE organization_id = $1 AND active = true',
        [trip.organization_id]
      )
      for (const r of ccRes.rows) {
        if (r.email && !extraCc.includes(r.email)) {
          extraCc.push(r.email)
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar CCs da organização:', err)
    }
  }

  const branchEmail = branchData?.email?.trim() || null
  if (branchEmail && branchEmail.includes('@') && !extraCc.includes(branchEmail)) {
    extraCc.push(branchEmail)
  }

  // 5. Assinatura Operacional da Empresa / Filial
  const operationalInfo = {
    name: branchData?.name
      ? `${companyData?.name || 'AuditCargo'} - Filial ${branchData.name}`
      : (companyData?.name || 'AuditCargo'),
    contact: branchData?.contact || companyData?.contact || 'Atendimento Operacional',
    phone: branchData?.phone || companyData?.phone || undefined,
    email: branchEmail || companyData?.email || undefined,
    website: companyData?.website,
  }

  // 6. Nome do Remetente
  let senderName = trip.sender
  if (!senderName && trip.sender_id) {
    const sRes = await pool.query('SELECT name, city FROM senders WHERE id = $1', [trip.sender_id])
    if (sRes.rows[0]?.name) {
      senderName = `${sRes.rows[0].name}${sRes.rows[0].city ? ` (${sRes.rows[0].city})` : ''}`
    }
  }

  // 7. E-mail de destino (Prioridade para o Remetente)
  let emailTarget = trip.sender_email
  if (!emailTarget && trip.sender_id) {
    const senderInfo = await pool.query('SELECT email FROM senders WHERE id = $1', [trip.sender_id])
    emailTarget = senderInfo.rows[0]?.email
  }
  if (!emailTarget && senderName) {
    const senderInfo = await pool.query(
      "SELECT email FROM senders WHERE ($1 ILIKE '%' || name || '%' OR name ILIKE '%' || $1 || '%') AND email IS NOT NULL LIMIT 1",
      [senderName]
    )
    emailTarget = senderInfo.rows[0]?.email
  }
  if (!emailTarget) {
    emailTarget = trip.recipient_email
  }

  return {
    driverName,
    senderName,
    emailTarget,
    operationalInfo,
    extraCc,
  }
}

/**
 * Registra a chegada da viagem e responde no Telegram
 */
async function handleArrivedAction(tripId: string, chatId: string | number) {
  const pool = getDbPool()
  const now = new Date()

  try {
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
      await sendTelegramTextMessage(
        chatId,
        'ℹ️ Esta viagem já foi finalizada ou não pôde ser atualizada.'
      )
      return
    }

    const trip = updateRes.rows[0]
    const timeFormatted = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    // Confirmação para o motorista no Telegram
    await sendTelegramTextMessage(
      chatId,
      `✅ <b>Chegada confirmada com sucesso às ${timeFormatted}!</b>\n\n` +
        `Destino: <b>${trip.destination}</b>\n` +
        `Sua franquia de estadia foi iniciada oficialmente no sistema.\n\n` +
        `O remetente foi notificado por e-mail. Bom trabalho!`
    )

    // Disparo de e-mail de aviso para o remetente
    try {
      const emailCtx = await getTripEmailContext(pool, trip)

      if (emailCtx.emailTarget) {
        let destName = trip.destination || 'Destinatário'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        await sendArrivalEmail({
          toEmail: emailCtx.emailTarget,
          destinationName: destName,
          destinationCity: destCity,
          invoices: trip.invoices || [],
          arrivalTime: trip.arrival_time || now.toISOString(),
          cteNumber: trip.cte_number || undefined,
          driverName: emailCtx.driverName,
          serviceType: trip.service_type || 'Estadia',
          sender: emailCtx.senderName,
          companyInfo: emailCtx.operationalInfo,
          checkinPhotoUrl: trip.checkin_photo_url,
          extraCc: emailCtx.extraCc,
        })
      }
    } catch (emailErr) {
      console.error('⚠️ [Telegram Webhook] Erro ao enviar e-mail de chegada:', emailErr)
    }

    // Atualiza o menu do telegram
    const driverInfo = await pool.query('SELECT name, phone FROM drivers WHERE id = $1', [trip.driver_id])
    const driver = driverInfo.rows[0] || {}

    await sendTripTelegramPrompt(chatId, {
      id: trip.id,
      token: trip.token,
      destination: trip.destination,
      status: trip.status,
      cte_number: trip.cte_number,
      service_type: trip.service_type,
      drivers: { name: driver.name, phone: driver.phone },
    })

  } catch (err) {
    console.error('❌ [Telegram Webhook] Erro ao processar chegada:', err)
    await sendTelegramTextMessage(
      chatId,
      'Desculpe, ocorreu um erro ao registrar sua chegada. Por favor, tente novamente.'
    )
  }
}

async function handleRollbackAction(tripId: string, chatId: string | number) {
  const pool = getDbPool()
  try {
    const updateRes = await pool.query(
      `
      UPDATE trips
      SET status = 'in_transit', arrival_time = NULL, checkin_photo_url = NULL, delivery_receipt_url = NULL
      WHERE id = $1 AND status = 'arrived'
      RETURNING *
      `,
      [tripId]
    )

    if (updateRes.rows.length === 0) {
      await sendTelegramTextMessage(chatId, 'ℹ️ Não foi possível desfazer. A viagem pode já estar finalizada ou ainda em trânsito.')
      return
    }

    const trip = updateRes.rows[0]
    await sendTelegramTextMessage(chatId, '🔙 <b>Chegada desfeita!</b> A viagem voltou para o status "Em Trânsito".')
    
    const driverInfo = await pool.query('SELECT name, phone FROM drivers WHERE id = $1', [trip.driver_id])
    const driver = driverInfo.rows[0] || {}

    await sendTripTelegramPrompt(chatId, {
      id: trip.id,
      token: trip.token,
      destination: trip.destination,
      status: trip.status,
      cte_number: trip.cte_number,
      service_type: trip.service_type,
      drivers: { name: driver.name, phone: driver.phone },
    })
  } catch (err) {
    console.error('❌ [Telegram Webhook] Erro ao desfazer chegada:', err)
  }
}

async function handleRollbackFinishAction(tripId: string, chatId: string | number) {
  const pool = getDbPool()
  try {
    const updateRes = await pool.query(
      `
      UPDATE trips
      SET status = 'arrived', completion_time = NULL
      WHERE id = $1 AND status = 'finished'
      RETURNING *
      `,
      [tripId]
    )

    if (updateRes.rows.length === 0) {
      await sendTelegramTextMessage(chatId, 'ℹ️ Não foi possível desfazer a finalização.')
      return
    }

    const trip = updateRes.rows[0]
    await sendTelegramTextMessage(chatId, '🔙 <b>Finalização desfeita!</b> A viagem voltou para o status "Chegou no Destino".')
    
    const driverInfo = await pool.query('SELECT name, phone FROM drivers WHERE id = $1', [trip.driver_id])
    const driver = driverInfo.rows[0] || {}

    await sendTripTelegramPrompt(chatId, {
      id: trip.id,
      token: trip.token,
      destination: trip.destination,
      status: trip.status,
      cte_number: trip.cte_number,
      service_type: trip.service_type,
      drivers: { name: driver.name, phone: driver.phone },
    })
  } catch (err) {
    console.error('❌ [Telegram Webhook] Erro ao desfazer finalização:', err)
  }
}

async function handleFinishDischargeAction(tripId: string, chatId: string | number) {
  const pool = getDbPool()
  const now = new Date()

  try {
    const updateRes = await pool.query(
      `
      UPDATE trips
      SET status = 'finished', completion_time = COALESCE(completion_time, NOW())
      WHERE id = $1 AND status IN ('arrived', 'unloading')
      RETURNING *
      `,
      [tripId]
    )

    if (updateRes.rows.length === 0) {
      await sendTelegramTextMessage(chatId, 'ℹ️ Não foi possível finalizar. Verifique o status da viagem.')
      return
    }

    const trip = updateRes.rows[0]
    await sendTelegramTextMessage(
      chatId,
      '🎉 <b>Descarga finalizada com sucesso!</b> Viagem concluída.\nObrigado pelo seu trabalho e tenha um excelente dia!\n\n<i>(Se você finalizou por engano, use o botão de desfazer no menu abaixo)</i>'
    )

    const driverInfo = await pool.query('SELECT name, phone FROM drivers WHERE id = $1', [trip.driver_id])
    const driver = driverInfo.rows[0] || {}

    await sendTripTelegramPrompt(chatId, {
      id: trip.id,
      token: trip.token,
      destination: trip.destination,
      status: trip.status,
      cte_number: trip.cte_number,
      service_type: trip.service_type,
      drivers: { name: driver.name, phone: driver.phone },
    })

    try {
      const emailCtx = await getTripEmailContext(pool, trip)

      if (emailCtx.emailTarget) {
        let destName = trip.destination || 'Destinatário'
        let destCity = ''
        if (destName.includes('-')) {
          const parts = destName.split('-')
          destName = parts[0].trim()
          destCity = parts.slice(1).join('-').trim()
        }

        await sendCompletionEmail({
          toEmail: emailCtx.emailTarget,
          destinationName: destName,
          destinationCity: destCity,
          invoices: trip.invoices || [],
          arrivalTime: trip.arrival_time,
          departureTime: trip.completion_time || now.toISOString(),
          cteNumber: trip.cte_number || undefined,
          driverName: emailCtx.driverName,
          serviceType: trip.service_type || 'Estadia',
          sender: emailCtx.senderName,
          companyInfo: emailCtx.operationalInfo,
          checkinPhotoUrl: trip.checkin_photo_url,
          extraCc: emailCtx.extraCc,
        })
      }
    } catch (emailErr) {
      console.error('⚠️ [Telegram Webhook] Erro ao enviar e-mail de finalização:', emailErr)
    }
  } catch (err) {
    console.error('❌ [Telegram Webhook] Erro ao processar finalização:', err)
  }
}

