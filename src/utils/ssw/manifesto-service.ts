import crypto from 'crypto'
import { getDbPool } from '@/utils/db'
import { SSWManifestoPayload, SSWWebhookResponse } from './types'
import { sendTripWhatsAppPrompt } from '@/utils/whatsapp'

/**
 * Normaliza CNPJ ou CPF mantendo apenas dígitos numéricos
 */
function cleanDigits(value?: string | null): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

/**
 * Processa a ingestão de um Manifesto emitido no SSW (EDI ssw2498)
 * Cria ou atualiza registros de motorista, remetente e a viagem com múltiplos destinatários.
 */
export async function processSSWManifesto(
  payload: SSWManifestoPayload,
  explicitOrgId?: string
): Promise<SSWWebhookResponse> {
  const pool = getDbPool()

  // 1. Validações preliminares do payload
  if (!payload || !payload.manifestoSSW) {
    return {
      sucesso: false,
      mensagem: 'Payload inválido: manifestoSSW é obrigatório.',
      protocolo: '',
    }
  }

  if (!payload.motorista || !payload.motorista.cpf) {
    return {
      sucesso: false,
      mensagem: 'Payload inválido: dados do motorista com CPF são obrigatórios.',
      protocolo: '',
    }
  }

  if (!payload.ctes || !Array.isArray(payload.ctes) || payload.ctes.length === 0) {
    return {
      sucesso: false,
      mensagem: 'Payload inválido: lista de CT-es vazia no manifesto.',
      protocolo: '',
    }
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 2. Identificação da Organização (Tenant) e Empresa
    let organizationId = explicitOrgId
    let companyId: string | null = null

    // A. Tenta identificar por CNPJ do emitente contido no primeiro CTe
    const emitenteCnpj = cleanDigits(payload.ctes[0]?.emitente?.cpfCNPJ)
    if (emitenteCnpj) {
      const compRes = await client.query(
        `SELECT id, organization_id FROM companies WHERE replace(replace(replace(replace(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = $1 LIMIT 1`,
        [emitenteCnpj]
      )
      if (compRes.rows.length > 0) {
        companyId = compRes.rows[0].id
        if (!organizationId) {
          organizationId = compRes.rows[0].organization_id
        }
      }
    }

    // B. Se ainda não localizou empresa por CNPJ, tenta pela organização explícita
    if (!companyId && organizationId) {
      const compOrgRes = await client.query(
        `SELECT id FROM companies WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [organizationId]
      )
      if (compOrgRes.rows.length > 0) {
        companyId = compOrgRes.rows[0].id
      }
    }

    // C. Fallback geral: seleciona a primeira empresa cadastrada no sistema e adota seu tenant
    if (!companyId) {
      const defaultCompRes = await client.query(
        `SELECT id, organization_id FROM companies ORDER BY created_at ASC LIMIT 1`
      )
      if (defaultCompRes.rows.length > 0) {
        companyId = defaultCompRes.rows[0].id
        if (!organizationId) {
          organizationId = defaultCompRes.rows[0].organization_id
        }
      }
    }

    if (!organizationId || !companyId) {
      await client.query('ROLLBACK')
      return {
        sucesso: false,
        mensagem: 'Nenhuma empresa ou organização cadastrada no AuditCargo para vincular o transporte.',
        protocolo: '',
      }
    }

    // 3. Idempotência: verifica se este manifesto já foi importado anteriormente
    const cteIdentifier = payload.manifestoSSW.trim()
    const existingTripRes = await client.query(
      `SELECT id, token FROM trips WHERE cte_number = $1 AND organization_id = $2 LIMIT 1`,
      [cteIdentifier, organizationId]
    )

    if (existingTripRes.rows.length > 0) {
      await client.query('COMMIT')
      const existingTrip = existingTripRes.rows[0]
      return {
        sucesso: true,
        mensagem: `Manifesto ${cteIdentifier} já havia sido importado previamente (Idempotência).`,
        protocolo: existingTrip.id,
      }
    }

    // 4. Tratativa do Motorista (Identificação por CPF ou Auto-cadastro)
    const driverCpf = cleanDigits(payload.motorista.cpf)
    let driverId: string | null = null
    let driverPhone: string | null = null
    let driverName = payload.motorista.nome?.trim() || 'Motorista'

    const driverQuery = await client.query(
      `SELECT id, name, phone FROM drivers WHERE replace(replace(cpf, '.', ''), '-', '') = $1 AND organization_id = $2 LIMIT 1`,
      [driverCpf, organizationId]
    )

    let isNewDriverWithoutPhone = false

    if (driverQuery.rows.length > 0) {
      driverId = driverQuery.rows[0].id
      driverPhone = driverQuery.rows[0].phone
      driverName = driverQuery.rows[0].name || driverName
    } else {
      // Auto-cadastra motorista com os dados do SSW (telefone fica vazio e PIN temporário)
      isNewDriverWithoutPhone = true
      const newDriverRes = await client.query(
        `INSERT INTO drivers (name, cpf, phone, default_plate, pin, company_id, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          driverName,
          driverCpf,
          '', // Sem telefone inicial
          payload.placa?.trim()?.toUpperCase() || null,
          '0000', // PIN temporário de 4 dígitos
          companyId,
          organizationId,
        ]
      )
      driverId = newDriverRes.rows[0].id
    }

    // 5. Tratativa do Remetente (Identificação ou Auto-cadastro)
    const primarySender = payload.ctes[0].remetente
    const senderCnpj = cleanDigits(primarySender.cpfCNPJ)
    let senderId: string | null = null
    let senderName = primarySender.nome?.trim() || 'Remetente'
    let senderEmail: string | null = null

    if (senderCnpj) {
      const senderQuery = await client.query(
        `SELECT id, name, email FROM senders WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 AND organization_id = $2 LIMIT 1`,
        [senderCnpj, organizationId]
      )

      if (senderQuery.rows.length > 0) {
        senderId = senderQuery.rows[0].id
        senderEmail = senderQuery.rows[0].email
        senderName = senderQuery.rows[0].name || senderName
      } else {
        const senderAddress = [
          primarySender.endereco?.rua,
          primarySender.endereco?.numero,
          primarySender.endereco?.bairro,
        ]
          .filter(Boolean)
          .join(', ')

        const newSenderRes = await client.query(
          `INSERT INTO senders (name, cnpj, address, phone, organization_id, company_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, email`,
          [
            senderName,
            senderCnpj,
            senderAddress || null,
            primarySender.telefone || primarySender.celular || null,
            organizationId,
            companyId,
          ]
        )
        senderId = newSenderRes.rows[0].id
        senderEmail = newSenderRes.rows[0].email
      }
    }

    // 6. Montagem dos N Destinatários e Lista Agregada de Notas Fiscais
    const recipientsList: Array<{
      name: string
      destination: string
      invoices: string
      email?: string
    }> = []

    const allInvoices: string[] = []
    const distinctDestinations: string[] = []

    for (const cte of payload.ctes) {
      const dest = cte.destinatario
      const destName = dest.nome?.trim() || 'Destinatário'

      // Notas deste CT-e
      const cteInvoices = (cte.notasFiscais || []).map((nf) => String(nf.nroNFe).trim())
      allInvoices.push(...cteInvoices)

      const destAddressParts = [
        dest.endereco?.rua,
        dest.endereco?.numero ? `nº ${dest.endereco.numero}` : '',
        dest.endereco?.bairro,
        cte.cidadeDestino ? `${cte.cidadeDestino}/${cte.ufDestino}` : '',
      ].filter(Boolean)

      const formattedDest = destAddressParts.length > 0
        ? destAddressParts.join(', ')
        : `${cte.cidadeDestino}/${cte.ufDestino}`

      const cityState = `${cte.cidadeDestino}/${cte.ufDestino}`
      if (!distinctDestinations.includes(cityState)) {
        distinctDestinations.push(cityState)
      }

      recipientsList.push({
        name: destName,
        destination: formattedDest,
        invoices: cteInvoices.join(', '),
      })
    }

    // Destino geral resumido para visualização rápida no dashboard
    const generalDestination = distinctDestinations.join(' | ') || 'Destino conforme notas'

    // 7. Token único de 8 caracteres hexadecimais para acompanhamento
    const tripToken = crypto.randomBytes(4).toString('hex').toUpperCase()

    // 8. Inserção do Registro de Viagem (trips)
    const insertTripRes = await client.query(
      `INSERT INTO trips (
        company_id,
        driver_id,
        destination,
        invoices,
        token,
        status,
        cte_number,
        service_type,
        sender,
        sender_id,
        sender_email,
        recipients,
        organization_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, token`,
      [
        companyId,
        driverId,
        generalDestination,
        allInvoices,
        tripToken,
        'in_transit',
        cteIdentifier,
        'Estadia',
        senderName,
        senderId,
        senderEmail,
        JSON.stringify(recipientsList),
        organizationId,
      ]
    )

    await client.query('COMMIT')

    const createdTrip = insertTripRes.rows[0]

    // 9. Disparo de WhatsApp se o motorista possuir telefone cadastrado
    const hasValidPhone = Boolean(driverPhone && driverPhone.replace(/\D/g, '').length >= 10)
    if (hasValidPhone) {
      sendTripWhatsAppPrompt({
        id: createdTrip.id,
        token: createdTrip.token,
        destination: generalDestination,
        cte_number: cteIdentifier,
        service_type: 'Estadia',
        drivers: {
          name: driverName,
          phone: driverPhone!,
        },
      }).catch((err) => {
        console.warn('⚠️ [SSW Ingestão] Aviso ao disparar WhatsApp inicial da viagem:', err)
      })
    } else {
      console.info(
        `ℹ️ [SSW Ingestão] Viagem #${createdTrip.token} criada com motorista ${driverName} (CPF: ${driverCpf}) sem WhatsApp. Notificação pendente.`
      )
    }

    const warningMsg = !hasValidPhone
      ? ' (Aviso: Motorista novo cadastrado sem telefone. É necessário completar o cadastro para disparo do WhatsApp)'
      : ''

    return {
      sucesso: true,
      mensagem: `Manifesto ${cteIdentifier} importado com sucesso no AuditCargo com ${recipientsList.length} destinatário(s) e ${allInvoices.length} nota(s) fiscal(is).${warningMsg}`,
      protocolo: createdTrip.id,
    }
  } catch (err: any) {
    await client.query('ROLLBACK')
    console.error('❌ [SSW Ingestão] Erro durante o processamento do manifesto:', err)
    return {
      sucesso: false,
      mensagem: `Erro interno no processamento: ${err.message || 'Erro inesperado'}`,
      protocolo: '',
    }
  } finally {
    client.release()
  }
}
