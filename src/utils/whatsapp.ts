/**
 * Cliente de Integração com a WhatsApp Cloud API Oficial da Meta
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

// Limpa e normaliza o número de telefone para o padrão E.164 aceito pela Meta (ex: 5511999999999)
export function normalizeWhatsAppNumber(rawPhone: string): string {
  if (!rawPhone) return ''
  const digits = rawPhone.replace(/\D/g, '')
  if (!digits) return ''

  // Se já tem código do Brasil (55)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }

  // Se tem DDD + Número (10 ou 11 dígitos, ex: 11987654321 ou 1187654321)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  return digits
}

interface MetaApiResult {
  success: boolean
  skipped?: boolean
  error?: string
  data?: any
}

/**
 * Envia uma mensagem arbitrária usando a Meta Cloud API
 */
export async function sendMetaWhatsAppPayload(
  toPhone: string,
  messagePayload: Record<string, any>
): Promise<MetaApiResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn(
      '⚠️ [WhatsApp Meta] Credenciais WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN não configuradas.'
    )
    return {
      success: false,
      skipped: true,
      error: 'WhatsApp Meta Cloud API não configurado no ambiente (.env).',
    }
  }

  const normalizedTo = normalizeWhatsAppNumber(toPhone)
  if (!normalizedTo) {
    return { success: false, error: 'Número de telefone do motorista inválido ou ausente.' }
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      ...messagePayload,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const json = await response.json()

    if (!response.ok) {
      console.error('❌ [WhatsApp Meta Error]:', json)
      return {
        success: false,
        error: json?.error?.message || `Erro HTTP ${response.status} na API da Meta`,
        data: json,
      }
    }

    return { success: true, data: json }
  } catch (err: any) {
    console.error('❌ [WhatsApp Meta Exception]:', err)
    return { success: false, error: err?.message || 'Falha de comunicação com a API da Meta' }
  }
}

/**
 * Envia uma mensagem de texto simples
 */
export async function sendWhatsAppTextMessage(toPhone: string, text: string): Promise<MetaApiResult> {
  return sendMetaWhatsAppPayload(toPhone, {
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  })
}

/**
 * Envia a mensagem interativa de acompanhamento de viagem com botões para o motorista
 * Botões:
 * 1. [ 📍 Cheguei no Destino ]
 * 2. [ ⏳ Em Trânsito ]
 * 3. [ ⚠️ Imprevisto ]
 */
export async function sendTripWhatsAppPrompt(trip: {
  id: string
  token: string
  destination: string
  cte_number?: string | null
  service_type?: string | null
  drivers?: { name?: string; phone?: string } | null
}): Promise<MetaApiResult> {
  const driverPhone = trip.drivers?.phone
  if (!driverPhone) {
    return { success: false, error: 'Motorista sem telefone cadastrado.' }
  }

  const driverName = trip.drivers?.name || 'Motorista'
  const cteStr = trip.cte_number ? ` (CT-e: ${trip.cte_number})` : ''

  // Limite da Meta: botões com no máximo 20 caracteres cada no título
  const payload = {
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '🚚 AuditCargo - Status de Viagem',
      },
      body: {
        text:
          `Olá, ${driverName}!\n\n` +
          `Acompanhamento da Viagem #${trip.token}${cteStr}.\n` +
          `Destino: *${trip.destination}*\n\n` +
          `Você já chegou na portaria do cliente para descarga?`,
      },
      footer: {
        text: 'Selecione uma opção abaixo:',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: `ARRIVED_${trip.id}`,
              title: '📍 Cheguei na Portaria',
            },
          },
          {
            type: 'reply',
            reply: {
              id: `TRANSIT_${trip.id}`,
              title: '⏳ Em Trânsito',
            },
          },
          {
            type: 'reply',
            reply: {
              id: `ISSUE_${trip.id}`,
              title: '⚠️ Imprevisto',
            },
          },
        ],
      },
    },
  }

  return sendMetaWhatsAppPayload(driverPhone, payload)
}
