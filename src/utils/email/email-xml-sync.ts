import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import crypto from 'crypto'
import pg from 'pg'
import { getDbPool } from '@/utils/db'
import { parseCTeXml } from '@/utils/sefaz/sync-service'
import { ParsedCTeData } from '@/utils/sefaz/types'
import { parseProcedaConemb, processEdiLoteInDatabase } from '@/utils/edi/conemb-parser'

export interface EmailSyncDetail {
  subject: string
  from: string
  date?: string
  cteNumber?: string
  cteKey?: string
  sender?: string
  destination?: string
  status: 'criado' | 'existente' | 'sem_cte' | 'erro'
  error?: string
}

export interface EmailSyncResult {
  success: boolean
  totalEmailsChecked: number
  ctesProcessed: number
  tripsCreated: number
  tripsUpdated: number
  details: EmailSyncDetail[]
  error?: string
}

/**
 * Conecta na caixa IMAP do Hostinger (infoweb@ccargo.com.br),
 * lê os e-mails com XMLs de CT-e enviados pelo SSW e cria
 * as viagens correspondentes no banco de dados.
 */
export async function syncCteEmailsFromMailbox(targetOrgId?: string): Promise<EmailSyncResult> {
  const host = process.env.IMAP_HOST || 'imap.hostinger.com'
  const port = parseInt(process.env.IMAP_PORT || '993', 10)
  const user = process.env.IMAP_USER || 'infoweb@ccargo.com.br'
  const pass = process.env.IMAP_PASS || '@#$Cc2706*'
  const secure = process.env.IMAP_SECURE !== 'false'

  if (!pass) {
    return {
      success: false,
      totalEmailsChecked: 0,
      ctesProcessed: 0,
      tripsCreated: 0,
      tripsUpdated: 0,
      details: [],
      error: 'Senha do IMAP não configurada no servidor (IMAP_PASS ausente).',
    }
  }

  const db = getDbPool()
  const dbClient = await db.connect()

  const result: EmailSyncResult = {
    success: true,
    totalEmailsChecked: 0,
    ctesProcessed: 0,
    tripsCreated: 0,
    tripsUpdated: 0,
    details: [],
  }

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    logger: false,
  })

  try {
    // 1. Identifica a organização padrão (prioriza C Cargo / organização ativa com empresa vinculada)
    let orgId = targetOrgId
    if (!orgId) {
      const orgRes = await dbClient.query(`
        SELECT o.id 
        FROM organizations o
        LEFT JOIN companies c ON c.organization_id = o.id
        WHERE o.active = true
        ORDER BY 
          CASE WHEN o.name ILIKE '%C Cargo%' OR o.slug ILIKE '%c-cargo%' THEN 0 ELSE 1 END,
          CASE WHEN c.id IS NOT NULL THEN 0 ELSE 1 END,
          o.created_at DESC
        LIMIT 1
      `)
      orgId = orgRes.rows[0]?.id
    }

    if (!orgId) {
      throw new Error('Nenhuma organização encontrada no banco de dados para vincular os transportes.')
    }

    // 2. Busca empresa padrão para vinculação
    const compRes = await dbClient.query(
      `SELECT id FROM companies WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [orgId]
    )
    const companyId = compRes.rows[0]?.id || null

    // 3. Conecta no IMAP
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Busca mensagens não lidas (seen: false)
      const searchCriteria = { seen: false }
      const messagesToProcess: number[] = []

      for await (const msg of client.fetch(searchCriteria, { uid: true })) {
        messagesToProcess.push(msg.uid)
      }

      result.totalEmailsChecked = messagesToProcess.length

      if (messagesToProcess.length === 0) {
        return result
      }

      // Processa cada e-mail não lido usando UID explícito ({ uid: true })
      for (const uid of messagesToProcess) {
        try {
          const download = await client.download(String(uid), undefined, { uid: true })
          if (!download || !download.content) continue

          // Parser MIME completo do e-mail
          const parsed = await simpleParser(download.content)
          const subject = parsed.subject || 'Sem Assunto'
          const fromAddr = parsed.from?.text || 'Remetente Desconhecido'
          const emailDate = parsed.date ? parsed.date.toISOString() : undefined

          let foundCteInEmail = false
          let hasDatabaseError = false

          // Varre os anexos em busca de EDIs ou XMLs
          if (parsed.attachments && parsed.attachments.length > 0) {
            for (const att of parsed.attachments) {
              const filenameLower = (att.filename || '').toLowerCase()
              const isXmlName = filenameLower.endsWith('.xml')
              const isXmlType = att.contentType?.includes('xml')
              const isTxtName = filenameLower.endsWith('.txt') || filenameLower.endsWith('.edi')
              const contentStr = att.content ? att.content.toString('utf-8') : ''
              const trimmedContent = contentStr.trimStart()
              const hasXmlSignature = contentStr.includes('<cteProc') || contentStr.includes('<CTe')
              const hasEdiSignature =
                trimmedContent.startsWith('000') &&
                (trimmedContent.includes('CON50') || trimmedContent.includes('520') || trimmedContent.includes('522'))

              // 1. Processamento de EDI PROCEDA CONEMB (Manifesto / Romaneio SSW)
              if (isTxtName || hasEdiSignature) {
                const parsedEdi = parseProcedaConemb(trimmedContent)
                if (parsedEdi.isConemb && parsedEdi.totalCtes > 0) {
                  foundCteInEmail = true
                  const ediRes = await processEdiLoteInDatabase(dbClient, parsedEdi, orgId, companyId)
                  result.ctesProcessed += parsedEdi.totalCtes
                  result.tripsCreated += ediRes.created
                  result.tripsUpdated += ediRes.updated

                  for (const d of ediRes.details) {
                    if (d.status === 'erro') hasDatabaseError = true
                    result.details.push({
                      subject: `${subject} • EDI Placa ${d.plate}`,
                      from: fromAddr,
                      date: emailDate,
                      cteNumber: d.cteNumber,
                      sender: d.sender,
                      status: d.status,
                      error: d.error,
                    })
                  }
                  continue
                }
              }

              // 2. Processamento de XML do CT-e
              if (isXmlName || isXmlType || hasXmlSignature) {
                const cteData: ParsedCTeData | null = parseCTeXml(contentStr)
                if (cteData) {
                  foundCteInEmail = true
                  result.ctesProcessed++

                  // Processa a criação ou atualização da viagem no banco
                  const tripResult = await processCteTripInDatabase(dbClient, cteData, orgId, companyId)

                  if (tripResult.status === 'criado') {
                    result.tripsCreated++
                  } else if (tripResult.status === 'existente') {
                    result.tripsUpdated++
                  } else if (tripResult.status === 'erro') {
                    hasDatabaseError = true
                  }

                  result.details.push({
                    subject,
                    from: fromAddr,
                    date: emailDate,
                    cteNumber: cteData.nCT,
                    cteKey: cteData.chCTe,
                    sender: cteData.remNome,
                    destination: `${cteData.destCidade}/${cteData.destUf}`,
                    status: tripResult.status,
                    error: tripResult.error,
                  })
                }
              }
            }
          }

          // Fallback se o próprio corpo do e-mail contiver EDI ou XML colado
          if (!foundCteInEmail && parsed.text) {
            const trimmedText = parsed.text.trimStart()
            if (trimmedText.startsWith('000') && (trimmedText.includes('520') || trimmedText.includes('522'))) {
              const parsedEdi = parseProcedaConemb(trimmedText)
              if (parsedEdi.isConemb && parsedEdi.totalCtes > 0) {
                foundCteInEmail = true
                const ediRes = await processEdiLoteInDatabase(dbClient, parsedEdi, orgId, companyId)
                result.ctesProcessed += parsedEdi.totalCtes
                result.tripsCreated += ediRes.created
                result.tripsUpdated += ediRes.updated
                for (const d of ediRes.details) {
                  if (d.status === 'erro') hasDatabaseError = true
                  result.details.push({
                    subject: `${subject} • EDI Placa ${d.plate}`,
                    from: fromAddr,
                    date: emailDate,
                    cteNumber: d.cteNumber,
                    sender: d.sender,
                    status: d.status,
                    error: d.error,
                  })
                }
              }
            } else if (parsed.text.includes('<cteProc') || parsed.text.includes('<CTe')) {
              const cteData = parseCTeXml(parsed.text)
              if (cteData) {
                foundCteInEmail = true
                result.ctesProcessed++
                const tripResult = await processCteTripInDatabase(dbClient, cteData, orgId, companyId)
                if (tripResult.status === 'criado') result.tripsCreated++
                else if (tripResult.status === 'existente') result.tripsUpdated++
                else if (tripResult.status === 'erro') hasDatabaseError = true

                result.details.push({
                  subject,
                  from: fromAddr,
                  date: emailDate,
                  cteNumber: cteData.nCT,
                  cteKey: cteData.chCTe,
                  sender: cteData.remNome,
                  destination: `${cteData.destCidade}/${cteData.destUf}`,
                  status: tripResult.status,
                  error: tripResult.error,
                })
              }
            }
          }

          if (!foundCteInEmail) {
            result.details.push({
              subject,
              from: fromAddr,
              date: emailDate,
              status: 'sem_cte',
            })
          }

          // Marca o e-mail como LIDO (\Seen) usando { uid: true } apenas se não houve erro de gravação no banco
          if (!hasDatabaseError) {
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
          }
        } catch (msgErr: any) {
          console.error(`Erro ao processar e-mail UID ${uid}:`, msgErr)
          result.details.push({
            subject: `UID ${uid}`,
            from: 'Desconhecido',
            status: 'erro',
            error: msgErr?.message || 'Falha ao decodificar e-mail',
          })
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
    return result
  } catch (err: any) {
    console.error('Erro na sincronização de e-mails IMAP:', err)
    return {
      success: false,
      totalEmailsChecked: result.totalEmailsChecked,
      ctesProcessed: result.ctesProcessed,
      tripsCreated: result.tripsCreated,
      tripsUpdated: result.tripsUpdated,
      details: result.details,
      error: err?.message || 'Falha ao sincronizar e-mails do servidor Hostinger.',
    }
  } finally {
    dbClient.release()
  }
}

/**
 * Insere ou atualiza os dados da viagem a partir do CT-e parseado
 */
async function processCteTripInDatabase(
  dbClient: pg.PoolClient,
  cteData: ParsedCTeData,
  orgId: string,
  companyId: string | null
): Promise<{ status: 'criado' | 'existente' | 'erro'; error?: string }> {
  try {
    const destCity = `${cteData.destCidade || 'Cidade'}/${cteData.destUf || 'UF'}`
    const destDesc = cteData.destNome || 'Destinatário'

    // 1. Verifica duplicidade por chave ou número do CT-e
    const existingTrip = await dbClient.query(
      `SELECT id FROM trips WHERE (cte_key = $1 OR cte_number = $2) AND organization_id = $3 LIMIT 1`,
      [cteData.chCTe, cteData.nCT, orgId]
    )

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
      origin_city: `${cteData.remCidade}/${cteData.remUf}`,
      destination_city: destCity,
      source: 'email_ssw',
    }

    if (existingTrip.rows.length > 0) {
      // Atualiza metadados fiscais caso estejam vazios
      await dbClient.query(
        `UPDATE trips 
         SET sefaz_metadata = $1 
         WHERE id = $2 AND (sefaz_metadata IS NULL OR sefaz_metadata = '{}'::jsonb)`,
        [JSON.stringify(sefazMetadata), existingTrip.rows[0].id]
      )
      return { status: 'existente' }
    }

    // 2. Localiza ou cria Remetente (Senders)
    let senderId: string | null = null
    const cleanRemCnpj = (cteData.remCnpj || '').replace(/\D/g, '')
    if (cleanRemCnpj) {
      const senderRes = await dbClient.query(
        `SELECT id FROM senders 
         WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 
           AND organization_id = $2 LIMIT 1`,
        [cleanRemCnpj, orgId]
      )

      if (senderRes.rows.length > 0) {
        senderId = senderRes.rows[0].id
      } else {
        const newSender = await dbClient.query(
          `INSERT INTO senders (name, cnpj, address, city, phone, organization_id, company_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            cteData.remNome || 'Remetente CT-e',
            cteData.remCnpj,
            cteData.remEndereco || null,
            cteData.remCidade || null,
            cteData.remTelefone || null,
            orgId,
            companyId,
          ]
        )
        senderId = newSender.rows[0]?.id || null
      }
    }

    // 3. Localiza ou cria Destinatário (Recipients)
    const cleanDestCnpj = (cteData.destCnpj || '').replace(/\D/g, '')
    if (cleanDestCnpj && senderId) {
      const recRes = await dbClient.query(
        `SELECT id FROM recipients 
         WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 
           AND organization_id = $2 LIMIT 1`,
        [cleanDestCnpj, orgId]
      )
      if (recRes.rows.length === 0) {
        await dbClient.query(
          `INSERT INTO recipients (name, cnpj, address, city, phone, sender_id, organization_id, company_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            cteData.destNome || 'Destinatário CT-e',
            cteData.destCnpj,
            cteData.destEndereco || null,
            cteData.destCidade || null,
            cteData.destTelefone || null,
            senderId,
            orgId,
            companyId,
          ]
        )
      }
    }

    // 4. Vincula Motorista pela Placa (se presente no CT-e) ou primeiro motorista da empresa
    let driverId: string | null = null
    if (cteData.placa) {
      const cleanPlaca = cteData.placa.replace(/[-\s]/g, '').toUpperCase()
      const driverPlateRes = await dbClient.query(
        `SELECT id FROM drivers 
         WHERE organization_id = $1 
           AND UPPER(replace(replace(default_plate, '-', ''), ' ', '')) = $2 LIMIT 1`,
        [orgId, cleanPlaca]
      )
      if (driverPlateRes.rows.length > 0) {
        driverId = driverPlateRes.rows[0].id
      }
    }

    if (!driverId) {
      const driverRes = await dbClient.query(
        `SELECT id FROM drivers WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [orgId]
      )
      if (driverRes.rows.length > 0) {
        driverId = driverRes.rows[0].id
      } else {
        const newDriver = await dbClient.query(
          `INSERT INTO drivers (name, phone, pin, organization_id, company_id, default_plate)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          ['Motorista SSW', '', '0000', orgId, companyId, cteData.placa || null]
        )
        driverId = newDriver.rows[0]?.id || null
      }
    }

    // Formata o endereço e destinatário estruturado
    const formattedDestAddress = [cteData.destEndereco, destCity].filter(Boolean).join(', ')
    const recipientsArray = [
      {
        name: destDesc,
        destination: formattedDestAddress,
        invoices: cteData.invoices.join(', '),
      },
    ]

    const tripToken = crypto.randomBytes(4).toString('hex').toUpperCase()

    // Insere a nova viagem
    await dbClient.query(
      `INSERT INTO trips (
        company_id,
        driver_id,
        status,
        destination,
        invoices,
        token,
        cte_number,
        cte_key,
        sender,
        sender_id,
        recipients,
        organization_id,
        sefaz_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        companyId,
        driverId,
        'pending',
        destCity,
        cteData.invoices,
        tripToken,
        cteData.nCT,
        cteData.chCTe,
        cteData.remNome || 'Remetente CT-e',
        senderId,
        JSON.stringify(recipientsArray),
        orgId,
        JSON.stringify(sefazMetadata),
      ]
    )

    return { status: 'criado' }
  } catch (err: any) {
    console.error('Erro ao inserir viagem do CT-e:', err)
    return { status: 'erro', error: err?.message || 'Erro de banco de dados' }
  }
}
