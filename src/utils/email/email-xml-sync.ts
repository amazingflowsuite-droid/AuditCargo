import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import crypto from 'crypto'
import pg from 'pg'
import { getDbPool } from '@/utils/db'
import { parseCTeXml } from '@/utils/sefaz/sync-service'
import { ParsedCTeData } from '@/utils/sefaz/types'
import { parseProcedaConemb, processEdiLoteInDatabase } from '@/utils/edi/conemb-parser'
import { appendTripAuditEvent } from '@/utils/trip-audit'

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

export interface SswSyncDiagnostic {
  code: 'AUTH_FAILED' | 'QUOTA_EXCEEDED' | 'QUOTA_WARNING' | 'CONNECTION_TIMEOUT' | 'CONFIG_MISSING' | 'PARSE_ERROR' | 'UNKNOWN_ERROR'
  title: string
  cause: string
  resolution: string
}

export interface SswSyncHealth {
  lastSyncAt: string | null
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  emailAccount: string
  totalEmailsChecked?: number
  tripsCreated?: number
  tripsUpdated?: number
  quotaUsagePercent?: number | null
  error?: string
  diagnostic?: SswSyncDiagnostic | null
}

export interface EmailSyncResult {
  success: boolean
  totalEmailsChecked: number
  ctesProcessed: number
  tripsCreated: number
  tripsUpdated: number
  details: EmailSyncDetail[]
  error?: string
  diagnostic?: SswSyncDiagnostic | null
  health?: SswSyncHealth
}

/**
 * Traduz erros técnicos de IMAP / Hostinger em diagnósticos acionáveis para o usuário final,
 * mitigando a necessidade de acionar suporte técnico.
 */
export function classifyImapError(err: any): SswSyncDiagnostic {
  const rawMsg = String(err?.message || err?.responseText || err || '').toLowerCase()
  const code = String(err?.code || err?.serverResponseCode || '').toUpperCase()

  if (rawMsg.includes('imap_pass ausente') || rawMsg.includes('não configurada')) {
    return {
      code: 'CONFIG_MISSING',
      title: 'Credencial de E-mail Não Configurada',
      cause: 'A senha de integração do e-mail SSW (IMAP_PASS) não está configurada no ambiente.',
      resolution: 'Verifique as variáveis de ambiente do servidor ou utilize a importação manual de arquivo EDI em "Novo Transporte".',
    }
  }

  if (
    code.includes('AUTHENTICATIONFAILED') ||
    code.includes('AUTH') ||
    rawMsg.includes('authentication') ||
    rawMsg.includes('invalid credentials') ||
    rawMsg.includes('login failed') ||
    rawMsg.includes('username or password') ||
    rawMsg.includes('command failed')
  ) {
    return {
      code: 'AUTH_FAILED',
      title: 'Senha do E-mail Alterada ou Inválida',
      cause: 'O servidor recusou o login da conta infoweb@ccargo.com.br. Alguém pode ter alterado a senha do e-mail ou desativado o acesso IMAP.',
      resolution: 'Confirme se a senha do e-mail infoweb@ccargo.com.br foi mudada no painel da Hostinger. Restaure a senha anterior ou atualize a configuração do sistema. Enquanto isso, importe o arquivo EDI manualmente em "Novo Transporte".',
    }
  }

  if (
    code.includes('OVERQUOTA') ||
    code.includes('QUOTA') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('mailbox is full') ||
    rawMsg.includes('storage') ||
    rawMsg.includes('disk full')
  ) {
    return {
      code: 'QUOTA_EXCEEDED',
      title: 'Capacidade da Caixa de E-mail Esgotada',
      cause: 'A caixa de e-mail infoweb@ccargo.com.br atingiu 100% do limite de espaço na Hostinger e não consegue receber novos arquivos do SSW.',
      resolution: 'Acesse o Webmail da Hostinger (infoweb@ccargo.com.br), limpe a Lixeira e apague e-mails antigos já lidos para liberar espaço imediatamente.',
    }
  }

  if (
    code.includes('ETIMEDOUT') ||
    code.includes('ECONNREFUSED') ||
    code.includes('ENOTFOUND') ||
    code.includes('ECONNRESET') ||
    rawMsg.includes('timeout') ||
    rawMsg.includes('socket') ||
    rawMsg.includes('connect') ||
    rawMsg.includes('network')
  ) {
    return {
      code: 'CONNECTION_TIMEOUT',
      title: 'Instabilidade na Conexão com Servidor de E-mail',
      cause: 'O servidor IMAP (imap.hostinger.com) demorou para responder ou está temporariamente indisponível.',
      resolution: 'Aguarde cerca de 2 minutos e clique em "Sincronizar SSW" novamente. Se precisar liberar um caminhão agora, importe o EDI manualmente em "Novo Transporte".',
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    title: 'Falha na Leitura da Caixa de E-mail SSW',
    cause: err?.message || 'Ocorreu um erro inesperado ao comunicar com o servidor de e-mail.',
    resolution: 'Tente sincronizar novamente em instantes. Caso o problema persista, verifique se o Webmail infoweb@ccargo.com.br está acessível ou faça a importação manual do EDI em "Novo Transporte".',
  }
}

async function persistSswSyncHealth(
  dbClient: pg.PoolClient,
  orgId: string,
  health: SswSyncHealth
): Promise<void> {
  try {
    await dbClient.query(`
      ALTER TABLE organizations 
      ADD COLUMN IF NOT EXISTS ssw_sync_status JSONB DEFAULT '{}'::jsonb
    `)
    await dbClient.query(
      `UPDATE organizations SET ssw_sync_status = $1 WHERE id = $2`,
      [JSON.stringify(health), orgId]
    )
  } catch (e) {
    console.warn('Aviso ao persistir ssw_sync_status:', e)
  }
}

/**
 * Consulta o status atual de saúde da sincronização SSW (E-mail) para exibição no Painel de Controle.
 */
export async function getSswSyncHealth(targetOrgId?: string): Promise<SswSyncHealth> {
  const emailAccount = process.env.IMAP_USER || 'infoweb@ccargo.com.br'
  const fallbackHealth: SswSyncHealth = {
    lastSyncAt: null,
    status: 'unknown',
    emailAccount,
    diagnostic: null,
  }

  const db = getDbPool()
  let dbClient: pg.PoolClient | null = null

  try {
    dbClient = await db.connect()

    let orgId = targetOrgId
    if (!orgId) {
      const orgRes = await dbClient.query(
        `SELECT id FROM organizations WHERE active = true ORDER BY created_at DESC LIMIT 1`
      )
      orgId = orgRes.rows[0]?.id
    }
    if (!orgId) return fallbackHealth

    // Verifica se a coluna ssw_sync_status existe e possui dados
    const colCheck = await dbClient.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'organizations' AND column_name = 'ssw_sync_status'`
    )

    if (colCheck.rows.length > 0) {
      const orgStatusRes = await dbClient.query(
        `SELECT ssw_sync_status FROM organizations WHERE id = $1 LIMIT 1`,
        [orgId]
      )
      const saved = orgStatusRes.rows[0]?.ssw_sync_status
      if (saved && typeof saved === 'object' && saved.lastSyncAt) {
        return {
          lastSyncAt: saved.lastSyncAt,
          status: saved.status || 'healthy',
          emailAccount: saved.emailAccount || emailAccount,
          totalEmailsChecked: saved.totalEmailsChecked ?? 0,
          tripsCreated: saved.tripsCreated ?? 0,
          tripsUpdated: saved.tripsUpdated ?? 0,
          quotaUsagePercent: saved.quotaUsagePercent ?? null,
          error: saved.error,
          diagnostic: saved.diagnostic || null,
        }
      }
    }

    // Fallback inteligente: busca a última viagem criada/atualizada via SSW no banco
    const lastTripRes = await dbClient.query(
      `SELECT created_at 
       FROM trips 
       WHERE organization_id = $1 
         AND (sefaz_metadata->>'source' IN ('edi_conemb_ssw_manifest', 'email_ssw'))
       ORDER BY created_at DESC 
       LIMIT 1`,
      [orgId]
    )

    if (lastTripRes.rows[0]?.created_at) {
      return {
        lastSyncAt: new Date(lastTripRes.rows[0].created_at).toISOString(),
        status: 'healthy',
        emailAccount,
        diagnostic: null,
      }
    }

    return fallbackHealth
  } catch (err) {
    console.warn('Erro ao consultar getSswSyncHealth:', err)
    return fallbackHealth
  } finally {
    if (dbClient) dbClient.release()
  }
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
    const diag = classifyImapError(new Error('IMAP_PASS ausente'))
    return {
      success: false,
      totalEmailsChecked: 0,
      ctesProcessed: 0,
      tripsCreated: 0,
      tripsUpdated: 0,
      details: [],
      error: 'Senha do IMAP não configurada no servidor (IMAP_PASS ausente).',
      diagnostic: diag,
      health: {
        lastSyncAt: new Date().toISOString(),
        status: 'error',
        emailAccount: user,
        error: 'Senha do IMAP não configurada no servidor (IMAP_PASS ausente).',
        diagnostic: diag,
      },
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

  let resolvedOrgId: string | undefined = targetOrgId

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
    resolvedOrgId = orgId

    // 2. Busca empresa padrão para vinculação
    const compRes = await dbClient.query(
      `SELECT id FROM companies WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [orgId]
    )
    const companyId = compRes.rows[0]?.id || null

    // 3. Conecta no IMAP
    await client.connect()

    // 3.1 Verifica capacidade / cota da caixa de e-mail preventivamente (quando suportado pelo servidor IMAP)
    let quotaUsagePercent: number | null = null
    let quotaDiagnostic: SswSyncDiagnostic | null = null
    try {
      const quotaInfo: any = await client.getQuota('INBOX')
      const storage = quotaInfo?.storage
      if (storage && typeof storage.usage === 'number' && typeof storage.limit === 'number' && storage.limit > 0) {
        quotaUsagePercent = Math.round((storage.usage / storage.limit) * 100)
        if (quotaUsagePercent >= 98) {
          quotaDiagnostic = {
            code: 'QUOTA_EXCEEDED',
            title: `Caixa de E-mail no Limite (${quotaUsagePercent}% ocupada)`,
            cause: `A conta ${user} atingiu ${quotaUsagePercent}% da capacidade máxima de armazenamento na Hostinger.`,
            resolution: `Acesse o Webmail (${user}) e exclua e-mails antigos ou esvazie a Lixeira para não bloquear o recebimento de novos EDIs do SSW.`,
          }
        } else if (quotaUsagePercent >= 85) {
          quotaDiagnostic = {
            code: 'QUOTA_WARNING',
            title: `Atenção: Caixa de E-mail com ${quotaUsagePercent}% de ocupação`,
            cause: `O armazenamento da conta ${user} está próximo do limite na Hostinger.`,
            resolution: `Recomendamos limpar e-mails antigos no Webmail (${user}) preventivamente.`,
          }
        }
      }
    } catch {
      // Servidor IMAP sem extensão QUOTA habilitada — segue normalmente
    }

    const lock = await client.getMailboxLock('INBOX')

    try {
      // Busca mensagens não lidas (seen: false)
      const searchCriteria = { seen: false }
      const messagesToProcess: number[] = []

      for await (const msg of client.fetch(searchCriteria, { uid: true })) {
        messagesToProcess.push(msg.uid)
      }

      result.totalEmailsChecked = messagesToProcess.length

      if (messagesToProcess.length > 0) {
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
                const isTxtName =
                  filenameLower.endsWith('.txt') ||
                  filenameLower.endsWith('.edi') ||
                  filenameLower.endsWith('.con') ||
                  filenameLower.endsWith('.rem') ||
                  filenameLower.endsWith('.dat')
                const contentStr = att.content ? att.content.toString('utf-8') : ''
                const trimmedContent = contentStr.trimStart()
                const hasXmlSignature = contentStr.includes('<cteProc') || contentStr.includes('<CTe')
                const hasEdiSignature =
                  trimmedContent.startsWith('000') &&
                  (
                    trimmedContent.includes('CON50') ||
                    trimmedContent.includes('520') ||
                    trimmedContent.includes('522') ||
                    trimmedContent.includes('CON31') ||
                    trimmedContent.includes('320') ||
                    trimmedContent.includes('321') ||
                    trimmedContent.includes('322') ||
                    trimmedContent.includes('CON')
                  )

                // 1. Processamento de EDI PROCEDA CONEMB (Manifesto / Romaneio SSW - Versões 5.0 e 3.1)
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
                      const plateOrLote = d.plate && d.plate !== 'SEM_PLACA' ? `Placa ${d.plate}` : `Lote ${parsedEdi.intercambioId || 'EDI'}`
                      result.details.push({
                        subject: `${subject} • EDI ${plateOrLote}`,
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
      }
    } finally {
      lock.release()
    }

    await client.logout()

    const nowIso = new Date().toISOString()
    const syncHealth: SswSyncHealth = {
      lastSyncAt: nowIso,
      status: quotaDiagnostic ? 'warning' : 'healthy',
      emailAccount: user,
      totalEmailsChecked: result.totalEmailsChecked,
      tripsCreated: result.tripsCreated,
      tripsUpdated: result.tripsUpdated,
      quotaUsagePercent,
      diagnostic: quotaDiagnostic,
    }

    await persistSswSyncHealth(dbClient, orgId, syncHealth)

    result.diagnostic = quotaDiagnostic
    result.health = syncHealth
    return result
  } catch (err: any) {
    console.error('Erro na sincronização de e-mails IMAP:', err)
    const diag = classifyImapError(err)
    const errorMsg = err?.message || 'Falha ao sincronizar e-mails do servidor Hostinger.'
    const failedHealth: SswSyncHealth = {
      lastSyncAt: new Date().toISOString(),
      status: 'error',
      emailAccount: user,
      totalEmailsChecked: result.totalEmailsChecked,
      tripsCreated: result.tripsCreated,
      tripsUpdated: result.tripsUpdated,
      error: errorMsg,
      diagnostic: diag,
    }

    if (resolvedOrgId) {
      await persistSswSyncHealth(dbClient, resolvedOrgId, failedHealth)
    }

    return {
      success: false,
      totalEmailsChecked: result.totalEmailsChecked,
      ctesProcessed: result.ctesProcessed,
      tripsCreated: result.tripsCreated,
      tripsUpdated: result.tripsUpdated,
      details: result.details,
      error: errorMsg,
      diagnostic: diag,
      health: failedHealth,
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

    const sefazMetadata = appendTripAuditEvent(
      {
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
      },
      {
        type: 'CREATED',
        title: `Viagem importada via XML de CT-e (${cteData.nCT})`,
        description: `XML do CT-e ${cteData.nCT} recebido via e-mail SSW. Origem: ${cteData.remNome} -> Destino: ${destDesc} (${destCity}).`,
        channel: 'email_ssw',
        actor: 'Sincronizador E-mail SSW',
      }
    )

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
