import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/utils/db'
import {
  sendTelegramTextMessage,
  sendTripTelegramPrompt,
  answerTelegramCallbackQuery,
  getTelegramFileDirectUrl,
} from '@/utils/telegram'
import { sendArrivalEmail, sendCompletionEmail } from '@/utils/mailer'
import {
  appendTripAuditEvent,
  appendTripIncident,
  updatePendingTelegramIncident,
  parseSafeMetadata,
  INCIDENT_CATEGORIES,
  IncidentCategory,
} from '@/utils/trip-audit'

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
        const tripId = data.replace('TRANSIT_', '')
        await answerTelegramCallbackQuery(callbackId, 'Viagem em trânsito!')
        try {
          const pool = getDbPool()
          const tRes = await pool.query(
            `SELECT t.sefaz_metadata, d.name as driver_name FROM trips t LEFT JOIN drivers d ON t.driver_id = d.id WHERE t.id = $1`,
            [tripId]
          )
          if (tRes.rows.length > 0) {
            const updatedMeta = appendTripAuditEvent(tRes.rows[0].sefaz_metadata, {
              type: 'IN_TRANSIT_CONFIRMED',
              title: 'Motorista confirmou viagem Em Trânsito',
              description: 'Confirmação de deslocamento normal enviada pelo motorista via Bot Telegram.',
              channel: 'telegram',
              actor: tRes.rows[0].driver_name || 'Motorista (Telegram)',
            })
            await pool.query(`UPDATE trips SET sefaz_metadata = $1 WHERE id = $2`, [JSON.stringify(updatedMeta), tripId])
          }
        } catch {}
        await sendTelegramTextMessage(
          fromChatId,
          '👍 <b>AuditCargo:</b> Perfeito! Viagem confirmada em trânsito. Dirija com atenção e nos avise assim que encostar no destino.'
        )
      } else if (data.startsWith('IC|') || data.startsWith('ISSUE_CAT|')) {
        const parts = data.split('|')
        const codeOrCat = parts[1] || 'outros'
        const tripId = parts[2] || ''
        const shortCodeMap: Record<string, IncidentCategory> = {
          nf: 'nf_fiscal',
          rd: 'recusa_divergencia',
          fa: 'fila_atraso',
          vm: 'veiculo_mecanico',
          ot: 'outros',
        }
        const rawCategory: IncidentCategory =
          shortCodeMap[codeOrCat] ||
          (codeOrCat in INCIDENT_CATEGORIES ? (codeOrCat as IncidentCategory) : 'outros')
        const catInfo = INCIDENT_CATEGORIES[rawCategory] || INCIDENT_CATEGORIES.outros

        await answerTelegramCallbackQuery(callbackId, `Imprevisto: ${catInfo.shortLabel}`)

        try {
          const pool = getDbPool()
          const tRes = await pool.query(
            `SELECT t.id, t.token, t.destination, t.sefaz_metadata, d.name as driver_name
             FROM trips t
             LEFT JOIN drivers d ON t.driver_id = d.id
             WHERE t.id = $1 LIMIT 1`,
            [tripId]
          )

          if (tRes.rows.length > 0) {
            const trip = tRes.rows[0]
            const { metadata: updatedMeta } = appendTripIncident(trip.sefaz_metadata, {
              category: rawCategory,
              description: `Imprevisto sinalizado pelo motorista via Bot Telegram (${catInfo.label}). Aguardando relato ou foto detalhada.`,
              channel: 'telegram',
              reportedBy: trip.driver_name || 'Motorista (Telegram)',
              awaitingTelegramDetails: true,
            })

            await pool.query(`UPDATE trips SET sefaz_metadata = $1 WHERE id = $2`, [
              JSON.stringify(updatedMeta),
              trip.id,
            ])

            await sendTelegramTextMessage(
              fromChatId,
              `⚠️ <b>Imprevisto Registrado: ${catInfo.label}</b>\n\n` +
                `A central de monitoramento já recebeu o alerta na Viagem <b>#${trip.token}</b> (${trip.destination}).\n\n` +
                `💬 <b>Agora, digite uma mensagem aqui no chat explicando o que aconteceu</b> (ex: número da NF vencida, motivo da recusa ou tempo de fila) ou envie uma <b>foto</b> para anexarmos ao chamado:`
            )
          } else {
            await sendTelegramTextMessage(
              fromChatId,
              '⚠️ Não foi possível localizar a viagem para vincular o imprevisto.'
            )
          }
        } catch (err) {
          console.error('❌ [Telegram Webhook] Erro ao registrar ISSUE_CAT:', err)
          await sendTelegramTextMessage(
            fromChatId,
            '⚠️ Ocorreu um erro ao salvar a categoria do imprevisto. Tente novamente.'
          )
        }
      } else if (data.startsWith('ISSUE_')) {
        const tripId = data.replace('ISSUE_', '')
        await answerTelegramCallbackQuery(callbackId)
        await sendTelegramTextMessage(
          fromChatId,
          '⚠️ <b>Reportar Imprevisto / Sinistro na Viagem</b>\n\n' +
            'Qual o tipo de problema que você está enfrentando agora? Toque em uma das opções abaixo:',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '📄 Nota Fiscal Vencida / Problema Fiscal',
                    callback_data: `IC|nf|${tripId}`,
                  },
                ],
                [
                  {
                    text: '📦 Recusa / Divergência de Mercadoria',
                    callback_data: `IC|rd|${tripId}`,
                  },
                ],
                [
                  {
                    text: '⏳ Fila Grande / Demora na Descarga',
                    callback_data: `IC|fa|${tripId}`,
                  },
                ],
                [
                  {
                    text: '🔧 Problema Mecânico / Veículo',
                    callback_data: `IC|vm|${tripId}`,
                  },
                ],
                [
                  {
                    text: '⚠️ Outro Imprevisto Operacional',
                    callback_data: `IC|ot|${tripId}`,
                  },
                ],
              ],
            },
          }
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
      const activeTrip = await findActiveTripByChatId(String(chatId))

      if (activeTrip) {
        const updatedMeta = appendTripAuditEvent(activeTrip.sefaz_metadata, {
          type: 'GPS_UPDATED',
          title: 'Localização GPS compartilhada pelo motorista',
          description: `Coordenadas enviadas via Telegram: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}.`,
          channel: 'telegram',
          actor: activeTrip.driver_name || 'Motorista (Telegram)',
          lat: latitude,
          lng: longitude,
        })

        await pool.query(
          `
          UPDATE trips
          SET last_driver_latitude = $1,
              last_driver_longitude = $2,
              sefaz_metadata = $3
          WHERE id = $4
          `,
          [latitude, longitude, JSON.stringify(updatedMeta), activeTrip.id]
        )

        await sendTelegramTextMessage(
          chatId,
          `📍 <b>AuditCargo:</b> Localização GPS registrada com sucesso para a Viagem <b>#${activeTrip.token}</b>!\n` +
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

    // 2.2. RECEBIMENTO DE FOTO (CANHOTO / COMPROVANTE OU FOTO DE IMPREVISTO)
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
      const bestPhoto = message.photo[message.photo.length - 1]
      const fileId = bestPhoto.file_id
      const caption = (message.caption || '').trim()
      console.log(`📷 [Telegram Webhook] Foto recebida de ${chatId}: ${fileId}`)

      const fileUrl = await getTelegramFileDirectUrl(fileId)

      if (fileUrl) {
        const activeTrip = await findActiveTripByChatId(String(chatId))

        if (activeTrip) {
          const pool = getDbPool()
          const currentMeta = parseSafeMetadata(activeTrip.sefaz_metadata)

          // Verifica se há um imprevisto aguardando complemento/foto no Telegram
          if (currentMeta.pending_telegram_incident_id) {
            const { metadata: updatedMeta, updatedIncident } = updatePendingTelegramIncident(
              activeTrip.sefaz_metadata,
              {
                description: caption || undefined,
                photoUrl: fileUrl,
                actor: activeTrip.driver_name || 'Motorista (Telegram)',
              }
            )

            await pool.query(`UPDATE trips SET sefaz_metadata = $1 WHERE id = $2`, [
              JSON.stringify(updatedMeta),
              activeTrip.id,
            ])

            await sendTelegramTextMessage(
              chatId,
              `📸 <b>AuditCargo:</b> Foto${caption ? ' e relato' : ''} anexada(s) com sucesso ao imprevisto <b>(${updatedIncident?.categoryLabel || 'Ocorrência'})</b> da Viagem <b>#${activeTrip.token}</b>!\n\nNossa central já possui a evidência registrada no histórico da viagem.`
            )
            return NextResponse.json({ ok: true })
          }

          const updatedMeta = appendTripAuditEvent(activeTrip.sefaz_metadata, {
            type: 'PHOTO_UPLOADED',
            title: 'Foto de comprovante / canhoto enviada',
            description: caption
              ? `Foto enviada pelo motorista via Telegram: "${caption}".`
              : 'Foto de canhoto ou comprovante de entrega enviada via Bot Telegram.',
            channel: 'telegram',
            actor: activeTrip.driver_name || 'Motorista (Telegram)',
            photoUrl: fileUrl,
          })

          await pool.query(
            `
            UPDATE trips
            SET checkin_photo_url = $1, delivery_receipt_url = $1, sefaz_metadata = $2
            WHERE id = $3
            `,
            [fileUrl, JSON.stringify(updatedMeta), activeTrip.id]
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
      const currentMeta = parseSafeMetadata(activeTripForChat.sefaz_metadata)

      // Se o motorista acabou de clicar em uma categoria de imprevisto e enviou o texto detalhando o problema
      if (currentMeta.pending_telegram_incident_id && text.length >= 2) {
        const pool = getDbPool()
        const { metadata: updatedMeta, updatedIncident } = updatePendingTelegramIncident(
          activeTripForChat.sefaz_metadata,
          {
            description: text,
            actor: activeTripForChat.driver_name || 'Motorista (Telegram)',
          }
        )

        await pool.query(`UPDATE trips SET sefaz_metadata = $1 WHERE id = $2`, [
          JSON.stringify(updatedMeta),
          activeTripForChat.id,
        ])

        await sendTelegramTextMessage(
          chatId,
          `✅ <b>Relato do imprevisto salvo com sucesso na Viagem #${activeTripForChat.token}!</b>\n\n` +
            `📌 <b>Categoria:</b> ${updatedIncident?.categoryLabel || 'Imprevisto'}\n` +
            `📝 <b>Descrição:</b> <i>"${text}"</i>\n\n` +
            `Nossa equipe de logística já está visualizando sua ocorrência no Painel de Controle. Se desejar, você também pode enviar uma <b>foto</b> do problema aqui no chat.`
        )
        return NextResponse.json({ ok: true })
      }

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

    const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
      type: 'TELEGRAM_LINKED',
      title: 'Viagem vinculada ao Bot Telegram do motorista',
      description: `Motorista ${trip.driver_name || 'Condutor'}${telegramUsername ? ` (${telegramUsername})` : ''} iniciou acompanhamento pelo Telegram.`,
      channel: 'telegram',
      actor: trip.driver_name || 'Motorista (Telegram)',
    })

    // Atualiza o telegram_chat_id e auditoria na viagem
    await pool.query('UPDATE trips SET telegram_chat_id = $1, sefaz_metadata = $2 WHERE id = $3', [
      chatId,
      JSON.stringify(updatedMeta),
      trip.id,
    ])

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
    const driverInfo = await pool.query('SELECT name, phone FROM drivers WHERE id = $1', [trip.driver_id])
    const driver = driverInfo.rows[0] || {}

    try {
      const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
        type: 'ARRIVED',
        title: 'Chegada confirmada no destino via Bot Telegram',
        description: `Motorista ${driver.name || 'Condutor'} confirmou chegada na portaria (${trip.destination}).`,
        channel: 'telegram',
        actor: driver.name || 'Motorista (Telegram)',
        photoUrl: trip.checkin_photo_url || null,
      })
      await pool.query('UPDATE trips SET sefaz_metadata = $1 WHERE id = $2', [
        JSON.stringify(updatedMeta),
        trip.id,
      ])
    } catch {}

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

    try {
      const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
        type: 'ARRIVAL_REVERTED',
        title: 'Chegada desfeita pelo motorista (Rollback Telegram)',
        description: `O motorista ${driver.name || 'Condutor'} desfez a chegada pelo Bot Telegram.`,
        channel: 'telegram',
        actor: driver.name || 'Motorista (Telegram)',
      })
      await pool.query('UPDATE trips SET sefaz_metadata = $1 WHERE id = $2', [
        JSON.stringify(updatedMeta),
        trip.id,
      ])
    } catch {}

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

    try {
      const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
        type: 'FINISH_REVERTED',
        title: 'Finalização desfeita pelo motorista (Rollback Telegram)',
        description: `O motorista ${driver.name || 'Condutor'} reabriu a descarga pelo Bot Telegram.`,
        channel: 'telegram',
        actor: driver.name || 'Motorista (Telegram)',
      })
      await pool.query('UPDATE trips SET sefaz_metadata = $1 WHERE id = $2', [
        JSON.stringify(updatedMeta),
        trip.id,
      ])
    } catch {}

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

    try {
      const updatedMeta = appendTripAuditEvent(trip.sefaz_metadata, {
        type: 'FINISHED',
        title: 'Descarga concluída via Bot Telegram',
        description: `Motorista ${driver.name || 'Condutor'} finalizou a descarga e liberou o veículo via Bot Telegram.`,
        channel: 'telegram',
        actor: driver.name || 'Motorista (Telegram)',
      })
      await pool.query('UPDATE trips SET sefaz_metadata = $1 WHERE id = $2', [
        JSON.stringify(updatedMeta),
        trip.id,
      ])
    } catch {}

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

