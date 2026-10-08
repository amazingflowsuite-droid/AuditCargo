/**
 * Utilitário de Integração Oficial do Telegram Bot API
 * Documentação: https://core.telegram.org/bots/api
 */

export interface TelegramApiResult {
  success: boolean
  skipped?: boolean
  error?: string
  data?: any
}

export function getTelegramBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN
}

export function getTelegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME || 'AuditCargo_bot'
}

/**
 * Retorna o link de Deep Link do Telegram para conectar o motorista à viagem
 * Formato: https://t.me/AuditCargo_bot?start=trip_TOKEN123
 */
export function getTelegramTripDeepLink(tripToken: string): string {
  const username = getTelegramBotUsername().replace('@', '')
  return `https://t.me/${username}?start=trip_${encodeURIComponent(tripToken)}`
}

/**
 * Envia mensagem arbitrária usando a Telegram Bot API
 */
export async function sendTelegramPayload(
  method: string,
  payload: Record<string, any>
): Promise<TelegramApiResult> {
  const token = getTelegramBotToken()

  if (!token) {
    console.warn('⚠️ [Telegram Bot] TELEGRAM_BOT_TOKEN não configurado no .env.local.')
    return {
      success: false,
      skipped: true,
      error: 'Telegram Bot não configurado no ambiente (.env).',
    }
  }

  try {
    const url = `https://api.telegram.org/bot${token}/${method}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const json = await response.json()

    if (!response.ok || !json.ok) {
      console.error('❌ [Telegram Bot Error]:', json)
      return {
        success: false,
        error: json?.description || `Erro HTTP ${response.status} na API do Telegram`,
        data: json,
      }
    }

    return { success: true, data: json.result }
  } catch (err: any) {
    console.error('❌ [Telegram Bot Exception]:', err)
    return { success: false, error: err?.message || 'Falha de comunicação com a API do Telegram' }
  }
}

/**
 * Envia uma mensagem de texto simples formatada em HTML
 */
export async function sendTelegramTextMessage(
  chatId: string | number,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'MarkdownV2'
    reply_markup?: any
  }
): Promise<TelegramApiResult> {
  return sendTelegramPayload('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options?.parse_mode || 'HTML',
    reply_markup: options?.reply_markup,
  })
}

/**
 * Responde a um clique de botão (callback query) para fechar o loader no app do Telegram
 */
export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false
): Promise<TelegramApiResult> {
  return sendTelegramPayload('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  })
}

/**
 * Envia a mensagem interativa de acompanhamento de viagem com botões para o motorista
 */
export async function sendTripTelegramPrompt(
  chatId: string | number,
  trip: {
    id: string
    token: string
    destination: string
    status?: string
    cte_number?: string | null
    service_type?: string | null
    drivers?: { name?: string; phone?: string } | null
  }
): Promise<TelegramApiResult> {
  const driverName = trip.drivers?.name || 'Motorista'
  const cteStr = trip.cte_number ? ` (CT-e: <b>${trip.cte_number}</b>)` : ''

  const messageText =
    `🚚 <b>AuditCargo - Status de Viagem</b>\n\n` +
    `Olá, <b>${driverName}</b>!\n` +
    `Acompanhamento da Viagem <b>#${trip.token}</b>${cteStr}.\n` +
    `Destino: <b>${trip.destination}</b>\n\n` +
    `Por favor, informe seu status ou envie dados da viagem pelos botões abaixo:`

  const replyMarkup: any = { inline_keyboard: [] }

  if (trip.status === 'finished') {
    replyMarkup.inline_keyboard = [
      [
        {
          text: '🔙 Desfazer Finalização (Rollback)',
          callback_data: `ROLLBACK_FINISH_${trip.id}`,
        },
      ],
      [
        {
          text: '📷 Enviar Canhoto / Foto',
          callback_data: `REQ_PHOTO_${trip.id}`,
        },
      ],
    ]
  } else if (trip.status === 'arrived' || trip.status === 'unloading') {
    replyMarkup.inline_keyboard = [
      [
        {
          text: '✅ Finalizar Descarga',
          callback_data: `FINISH_DISCHARGE_${trip.id}`,
        },
      ],
      [
        {
          text: '🔙 Desfazer Chegada (Rollback)',
          callback_data: `ROLLBACK_ARRIVE_${trip.id}`,
        },
      ],
      [
        {
          text: '📷 Enviar Canhoto / Foto',
          callback_data: `REQ_PHOTO_${trip.id}`,
        },
      ],
    ]
  } else {
    // Default in_progress / pending behavior
    replyMarkup.inline_keyboard = [
      [
        {
          text: '📍 Cheguei no Destino',
          callback_data: `ARRIVED_${trip.id}`,
        },
      ],
      [
        {
          text: '⏳ Em Trânsito',
          callback_data: `TRANSIT_${trip.id}`,
        },
        {
          text: '⚠️ Imprevisto',
          callback_data: `ISSUE_${trip.id}`,
        },
      ],
      [
        {
          text: '📷 Enviar Canhoto / Foto',
          callback_data: `REQ_PHOTO_${trip.id}`,
        },
      ],
    ]
  }

  return sendTelegramTextMessage(chatId, messageText, {
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  })
}

/**
 * Obtém a URL pública direta de um arquivo enviado no Telegram (ex: foto de comprovante)
 */
export async function getTelegramFileDirectUrl(fileId: string): Promise<string | null> {
  const token = getTelegramBotToken()
  if (!token) return null

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)
    const json = await res.json()

    if (json.ok && json.result?.file_path) {
      return `https://api.telegram.org/file/bot${token}/${json.result.file_path}`
    }
  } catch (err) {
    console.error('❌ [Telegram] Erro ao obter caminho do arquivo:', err)
  }

  return null
}
