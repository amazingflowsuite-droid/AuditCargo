import fs from 'fs'
import path from 'path'
import https from 'https'
import zlib from 'zlib'
import crypto from 'crypto'
import forge from 'node-forge'
import { getDbPool } from '@/utils/db'
import { ParsedCTeData, SefazSyncResult } from './types'

const CNPJ_MATRIZ = '07546152000133'
const CUF_SP = '35'

/**
 * Normaliza valores mantendo apenas dígitos numéricos
 */
function cleanDigits(value?: string | null): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

/**
 * Decodifica XML de CT-e e extrai campos essenciais de transporte
 */
export function parseCTeXml(xmlContent: string): ParsedCTeData | null {
  try {
    const chCTe = xmlContent.match(/Id="CTe(\d+)"/i)?.[1] || xmlContent.match(/<(?:\w+:)?chCTe>(\d+)<\/(?:\w+:)?chCTe>/i)?.[1]
    const nCT = xmlContent.match(/<(?:\w+:)?nCT>(.*?)<\/(?:\w+:)?nCT>/i)?.[1]

    if (!chCTe || !nCT) return null

    const serie = xmlContent.match(/<(?:\w+:)?serie>(.*?)<\/(?:\w+:)?serie>/i)?.[1]
    const dhEmi = xmlContent.match(/<(?:\w+:)?dhEmi>(.*?)<\/(?:\w+:)?dhEmi>/i)?.[1]

    // 1. Isolação estrita do bloco EMITENTE (<emit>...</emit>)
    const emitBlock = xmlContent.match(/<(?:\w+:)?emit\b[^>]*>([\s\S]*?)<\/(?:\w+:)?emit>/i)?.[1] || ''
    const emitCnpj = cleanDigits(emitBlock.match(/<(?:\w+:)?CNPJ>(.*?)<\/(?:\w+:)?CNPJ>/i)?.[1])
    const emitNome = emitBlock.match(/<(?:\w+:)?xNome>(.*?)<\/(?:\w+:)?xNome>/i)?.[1]

    // 2. Isolação estrita do bloco REMETENTE (<rem>...</rem>)
    const remBlock = xmlContent.match(/<(?:\w+:)?rem\b[^>]*>([\s\S]*?)<\/(?:\w+:)?rem>/i)?.[1] || ''
    // Fallback para Expedidor (<exped>) se <rem> não existir
    const expedBlock = xmlContent.match(/<(?:\w+:)?exped\b[^>]*>([\s\S]*?)<\/(?:\w+:)?exped>/i)?.[1] || ''
    const activeRemBlock = remBlock || expedBlock

    const remCnpj = cleanDigits(
      activeRemBlock.match(/<(?:\w+:)?CNPJ>(.*?)<\/(?:\w+:)?CNPJ>/i)?.[1] ||
      activeRemBlock.match(/<(?:\w+:)?CPF>(.*?)<\/(?:\w+:)?CPF>/i)?.[1]
    )
    const remNome = activeRemBlock.match(/<(?:\w+:)?xNome>(.*?)<\/(?:\w+:)?xNome>/i)?.[1]
    const remLgr = activeRemBlock.match(/<(?:\w+:)?xLgr>(.*?)<\/(?:\w+:)?xLgr>/i)?.[1] || ''
    const remNro = activeRemBlock.match(/<(?:\w+:)?nro>(.*?)<\/(?:\w+:)?nro>/i)?.[1] || ''
    const remBairro = activeRemBlock.match(/<(?:\w+:)?xBairro>(.*?)<\/(?:\w+:)?xBairro>/i)?.[1] || ''
    const remCidade = activeRemBlock.match(/<(?:\w+:)?xMun>(.*?)<\/(?:\w+:)?xMun>/i)?.[1] || ''
    const remUf = activeRemBlock.match(/<(?:\w+:)?UF>(.*?)<\/(?:\w+:)?UF>/i)?.[1] || ''
    const remTelefone = activeRemBlock.match(/<(?:\w+:)?fone>(.*?)<\/(?:\w+:)?fone>/i)?.[1] || ''

    // 3. Isolação estrita do bloco DESTINATÁRIO (<dest>...</dest>)
    const destBlock = xmlContent.match(/<(?:\w+:)?dest\b[^>]*>([\s\S]*?)<\/(?:\w+:)?dest>/i)?.[1] || ''
    const recebBlock = xmlContent.match(/<(?:\w+:)?receb\b[^>]*>([\s\S]*?)<\/(?:\w+:)?receb>/i)?.[1] || ''
    const activeDestBlock = destBlock || recebBlock

    const destCnpj = cleanDigits(
      activeDestBlock.match(/<(?:\w+:)?CNPJ>(.*?)<\/(?:\w+:)?CNPJ>/i)?.[1] ||
      activeDestBlock.match(/<(?:\w+:)?CPF>(.*?)<\/(?:\w+:)?CPF>/i)?.[1]
    )
    const destNome = activeDestBlock.match(/<(?:\w+:)?xNome>(.*?)<\/(?:\w+:)?xNome>/i)?.[1]
    const destLgr = activeDestBlock.match(/<(?:\w+:)?xLgr>(.*?)<\/(?:\w+:)?xLgr>/i)?.[1] || ''
    const destNro = activeDestBlock.match(/<(?:\w+:)?nro>(.*?)<\/(?:\w+:)?nro>/i)?.[1] || ''
    const destBairro = activeDestBlock.match(/<(?:\w+:)?xBairro>(.*?)<\/(?:\w+:)?xBairro>/i)?.[1] || ''
    const destCidade = activeDestBlock.match(/<(?:\w+:)?xMun>(.*?)<\/(?:\w+:)?xMun>/i)?.[1] || ''
    const destUf = activeDestBlock.match(/<(?:\w+:)?UF>(.*?)<\/(?:\w+:)?UF>/i)?.[1] || ''
    const destTelefone = activeDestBlock.match(/<(?:\w+:)?fone>(.*?)<\/(?:\w+:)?fone>/i)?.[1] || ''

    // 4. Tomador do serviço (<toma3> ou <toma4>)
    const tomadorTipo = xmlContent.match(/<(?:\w+:)?toma3>[\s\S]*?<(?:\w+:)?toma>(\d+)<\/(?:\w+:)?toma>/i)?.[1]
    let tomadorNome = ''
    let tomadorCnpj = ''
    if (tomadorTipo === '0') {
      tomadorNome = remNome || ''
      tomadorCnpj = remCnpj || ''
    } else if (tomadorTipo === '3') {
      tomadorNome = destNome || ''
      tomadorCnpj = destCnpj || ''
    } else {
      const toma4Block = xmlContent.match(/<(?:\w+:)?toma4\b[^>]*>([\s\S]*?)<\/(?:\w+:)?toma4>/i)?.[1]
      if (toma4Block) {
        tomadorCnpj = cleanDigits(toma4Block.match(/<(?:\w+:)?CNPJ>(.*?)<\/(?:\w+:)?CNPJ>/i)?.[1])
        tomadorNome = toma4Block.match(/<(?:\w+:)?xNome>(.*?)<\/(?:\w+:)?xNome>/i)?.[1] || ''
      }
    }

    // 5. Frete
    const vRecStr = xmlContent.match(/<(?:\w+:)?vTPrest>[\s\S]*?<(?:\w+:)?vRec>(.*?)<\/(?:\w+:)?vRec>/i)?.[1] ||
                    xmlContent.match(/<(?:\w+:)?vTPrest>(.*?)<\/(?:\w+:)?vTPrest>/i)?.[1]
    const vFrete = vRecStr ? parseFloat(vRecStr) : undefined

    // 6. Notas Fiscais
    const invoices: string[] = []
    const chNFeMatches = [...xmlContent.matchAll(/<(?:\w+:)?chave>(.*?)<\/(?:\w+:)?chave>/gi)].map((m) => m[1])
    for (const key of chNFeMatches) {
      if (key.length === 44) {
        const nfNum = parseInt(key.slice(25, 34), 10)
        invoices.push(String(nfNum))
      } else {
        invoices.push(key)
      }
    }

    const nNfMatches = [...xmlContent.matchAll(/<(?:\w+:)?nNF>(.*?)<\/(?:\w+:)?nNF>/gi)].map((m) => m[1])
    for (const nf of nNfMatches) {
      if (!invoices.includes(nf)) invoices.push(nf)
    }

    // 7. Placa
    let placa = xmlContent.match(/<(?:\w+:)?placa>(.*?)<\/(?:\w+:)?placa>/i)?.[1]?.toUpperCase()
    if (!placa) {
      placa = xmlContent.match(/xCampo="PLACA"[\s\S]*?<(?:\w+:)?xTexto>(.*?)<\/(?:\w+:)?xTexto>/i)?.[1]?.toUpperCase()
    }

    // 8. Peso Real da Carga (busca especificamente PESO REAL ou PESO BRUTO ou unidade de peso cUnid 01)
    let weightKg: number | undefined
    const pesoRealMatch = xmlContent.match(/<(?:\w+:)?tpMed>(?:PESO REAL|PESO BRUTO|PESO BASE DE CALCULO)<\/(?:\w+:)?tpMed>[\s\S]*?<(?:\w+:)?qCarga>(.*?)<\/(?:\w+:)?qCarga>/i)
    if (pesoRealMatch) {
      weightKg = parseFloat(pesoRealMatch[1])
    } else {
      const cUnid01Match = xmlContent.match(/<(?:\w+:)?cUnid>01<\/(?:\w+:)?cUnid>[\s\S]*?<(?:\w+:)?qCarga>(.*?)<\/(?:\w+:)?qCarga>/i)
      if (cUnid01Match) {
        weightKg = parseFloat(cUnid01Match[1])
      } else {
        const anyQCarga = xmlContent.match(/<(?:\w+:)?qCarga>(.*?)<\/(?:\w+:)?qCarga>/i)?.[1]
        if (anyQCarga) weightKg = parseFloat(anyQCarga)
      }
    }

    const vCargaStr = xmlContent.match(/<(?:\w+:)?vCarga>(.*?)<\/(?:\w+:)?vCarga>/i)?.[1]
    const cargoValue = vCargaStr ? parseFloat(vCargaStr) : undefined
    const cargoType = xmlContent.match(/<(?:\w+:)?proPred>(.*?)<\/(?:\w+:)?proPred>/i)?.[1]
    const rntrc = xmlContent.match(/<(?:\w+:)?RNTRC>(.*?)<\/(?:\w+:)?RNTRC>/i)?.[1]
    const observations = xmlContent.match(/<(?:\w+:)?xObs>([\s\S]*?)<\/(?:\w+:)?xObs>/i)?.[1]?.trim()

    const remEndereco = [remLgr, remNro ? `nº ${remNro}` : '', remBairro].filter(Boolean).join(', ')
    const destEndereco = [destLgr, destNro ? `nº ${destNro}` : '', destBairro].filter(Boolean).join(', ')

    return {
      chCTe,
      nCT,
      serie,
      dhEmi,
      emitCnpj,
      emitNome,
      remCnpj,
      remNome,
      remEndereco,
      remCidade,
      remUf,
      remTelefone,
      destCnpj,
      destNome,
      destEndereco,
      destCidade,
      destUf,
      destTelefone,
      tomadorTipo,
      tomadorNome,
      tomadorCnpj,
      vFrete,
      invoices,
      placa,
      weightKg,
      cargoValue,
      cargoType,
      rntrc,
      observations,
    }
  } catch (err) {
    console.warn('⚠️ [Parser CT-e] Falha ao processar XML de CT-e:', err)
    return null
  }
}

let cachedAgent: https.Agent | null = null

/**
 * Cria ou obtém o agente HTTPS configurado com o Certificado Digital A1
 * Utiliza node-forge para extrair PEM (cert + chave privada) de forma 100% compatível
 * com qualquer versão de Node.js sem necessidade de flags legadas OpenSSL.
 */
function getSefazAgent(): https.Agent {
  if (cachedAgent) return cachedAgent

  const certPath = process.env.SEFAZ_CERT_PATH
  const certPass = process.env.SEFAZ_CERT_PASSWORD || ''
  const certBase64 = process.env.SEFAZ_CERT_BASE64

  let pfxBuffer: Buffer
  if (certBase64) {
    pfxBuffer = Buffer.from(certBase64, 'base64')
  } else if (certPath && fs.existsSync(certPath)) {
    pfxBuffer = fs.readFileSync(certPath)
  } else {
    throw new Error('Certificado A1 da SEFAZ não configurado (SEFAZ_CERT_PATH ou SEFAZ_CERT_BASE64).')
  }

  const p12Der = forge.util.decode64(pfxBuffer.toString('base64'))
  const p12Asn1 = forge.asn1.fromDer(p12Der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPass)

  let pemCert = ''
  let pemKey = ''

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.cert) {
        pemCert += forge.pki.certificateToPem(safeBag.cert)
      } else if (safeBag.key) {
        pemKey += forge.pki.privateKeyToPem(safeBag.key)
      }
    }
  }

  if (!pemCert || !pemKey) {
    throw new Error('Falha ao extrair chave privada ou certificado público do arquivo PFX.')
  }

  cachedAgent = new https.Agent({
    cert: pemCert,
    key: pemKey,
    rejectUnauthorized: false,
  })

  return cachedAgent
}

/**
 * Executa a requisição SOAP mTLS para o CteDistribuicaoDFe
 */
async function callCteDistribuicaoDFe(ultNSU: string): Promise<{
  cStat: string
  xMotivo: string
  newUltNSU: string
  maxNSU: string
  docZipList: Array<{ nsu: string; schema: string; xml: string }>
}> {
  const agent = getSefazAgent()

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cte="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe">
  <soap:Body>
    <cte:cteDistDFeInteresse>
      <cte:cteDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00">
          <tpAmb>1</tpAmb>
          <cUFAutor>${CUF_SP}</cUFAutor>
          <CNPJ>${CNPJ_MATRIZ}</CNPJ>
          <distNSU>
            <ultNSU>${ultNSU}</ultNSU>
          </distNSU>
        </distDFeInt>
      </cte:cteDadosMsg>
    </cte:cteDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`

  const postData = Buffer.from(soapEnvelope, 'utf-8')

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'www1.cte.fazenda.gov.br',
        port: 443,
        path: '/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse',
          'Content-Length': postData.length,
        },
      },
      (res) => {
        let responseBody = ''
        res.on('data', (chunk) => (responseBody += chunk))
        res.on('end', () => {
          const cStat = responseBody.match(/<cStat>(\d+)<\/cStat>/)?.[1] || ''
          const xMotivo = responseBody.match(/<xMotivo>(.*?)<\/xMotivo>/)?.[1] || ''
          const newUltNSU = responseBody.match(/<ultNSU>(.*?)<\/ultNSU>/)?.[1] || ultNSU
          const maxNSU = responseBody.match(/<maxNSU>(.*?)<\/maxNSU>/)?.[1] || ultNSU

          const docZipList: Array<{ nsu: string; schema: string; xml: string }> = []
          const docZipRegex = /<docZip\s+NSU="([^"]+)"\s+schema="([^"]+)">([\s\S]*?)<\/docZip>/g

          let match
          while ((match = docZipRegex.exec(responseBody)) !== null) {
            const nsu = match[1]
            const schema = match[2]
            const base64 = match[3]

            try {
              const unzippedXml = zlib.gunzipSync(Buffer.from(base64, 'base64')).toString('utf-8')
              docZipList.push({ nsu, schema, xml: unzippedXml })
            } catch (err) {
              console.warn(`⚠️ [SEFAZ] Falha ao descompactar NSU ${nsu}:`, err)
            }
          }

          resolve({ cStat, xMotivo, newUltNSU, maxNSU, docZipList })
        })
      }
    )

    req.on('error', (err) => reject(err))
    req.write(postData)
    req.end()
  })
}

/**
 * Função Principal: Sincroniza documentos da SEFAZ e cria viagens no AuditCargo
 */
export async function syncSefazDocuments(targetOrgId?: string): Promise<SefazSyncResult> {
  const pool = getDbPool()
  const client = await pool.connect()

  try {
    // 1. Identifica a Organização e Empresa
    let orgId = targetOrgId
    if (!orgId) {
      const compOrgRes = await client.query(
        `SELECT organization_id, id FROM companies WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') LIKE '07546152%' LIMIT 1`
      )
      if (compOrgRes.rows.length > 0) {
        orgId = compOrgRes.rows[0].organization_id
      } else {
        const anyOrg = await client.query(`SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1`)
        if (anyOrg.rows.length > 0) orgId = anyOrg.rows[0].id
      }
    }

    if (!orgId) {
      return {
        sucesso: false,
        mensagem: 'Organização não localizada para vincular a sincronização SEFAZ.',
        novasViagens: 0,
        documentosProcessados: 0,
        ultimoNsu: '000000000000000',
        maxNsu: '000000000000000',
      }
    }

    // Busca a empresa vinculada
    const compRes = await client.query(
      `SELECT id FROM companies WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [orgId]
    )
    const companyId = compRes.rows[0]?.id || null

    // 2. Consulta ou inicializa o estado de NSU na tabela sefaz_sync_state
    const stateRes = await client.query(
      `SELECT last_nsu, max_nsu FROM sefaz_sync_state WHERE organization_id = $1 AND cnpj = $2`,
      [orgId, CNPJ_MATRIZ]
    )

    let currentLastNSU = '000000000012750' // Ponto de partida recente com dados reais
    if (stateRes.rows.length > 0) {
      currentLastNSU = stateRes.rows[0].last_nsu || currentLastNSU
    } else {
      await client.query(
        `INSERT INTO sefaz_sync_state (organization_id, cnpj, last_nsu, max_nsu, status)
         VALUES ($1, $2, $3, $3, 'idle')
         ON CONFLICT (organization_id, cnpj) DO NOTHING`,
        [orgId, CNPJ_MATRIZ, currentLastNSU]
      )
    }

    console.log(`📡 [SEFAZ Sync] Iniciando consulta com ultNSU: ${currentLastNSU}...`)

    // 3. Executa a chamada no WebService SEFAZ
    const sefazResponse = await callCteDistribuicaoDFe(currentLastNSU)

    console.log(
      `📥 [SEFAZ Sync] Resposta cStat: ${sefazResponse.cStat} (${sefazResponse.xMotivo}) | Novos Docs: ${sefazResponse.docZipList.length}`
    )

    let novasViagens = 0
    let documentosProcessados = 0
    const detalhes: Array<{
      cteNumber: string
      destinatario: string
      cidade: string
      status: 'criada' | 'existente' | 'erro'
    }> = []

    // 4. Processa cada documento entregue
    for (const doc of sefazResponse.docZipList) {
      documentosProcessados++

      // Se for CT-e completo
      if (doc.schema.includes('procCTe') || doc.xml.includes('<cteProc') || doc.xml.includes('<CTe')) {
        const cteData = parseCTeXml(doc.xml)
        if (!cteData) continue

        // 🔒 Filtro Estrito: Apenas transportes onde a C Cargo é a EMITENTE direta
        // Raiz CNPJ 07.546.152 (Matriz 0001-33 ou Filiais, ex: 0004-86 Guarulhos)
        if (!cteData.emitCnpj || !cteData.emitCnpj.startsWith('07546152')) {
          continue
        }

        // Verifica se a viagem já existe por chave de CT-e ou número
        const existingTrip = await client.query(
          `SELECT id FROM trips WHERE (cte_key = $1 OR cte_number = $2) AND organization_id = $3 LIMIT 1`,
          [cteData.chCTe, cteData.nCT, orgId]
        )

        const destDesc = cteData.destNome || 'Destinatário'
        const destCity = `${cteData.destCidade}/${cteData.destUf}`

        if (existingTrip.rows.length > 0) {
          // Atualiza metadados fiscais caso a viagem tenha sido criada antes da migração
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
            destination_city: `${cteData.destCidade}/${cteData.destUf}`,
          }
          await client.query(
            `UPDATE trips SET sefaz_metadata = $1 WHERE id = $2 AND (sefaz_metadata IS NULL OR sefaz_metadata = '{}'::jsonb)`,
            [JSON.stringify(sefazMetadata), existingTrip.rows[0].id]
          )

          detalhes.push({
            cteNumber: cteData.nCT,
            destinatario: destDesc,
            cidade: destCity,
            status: 'existente',
          })
          continue
        }

        // Remetente (Senders)
        let senderId: string | null = null
        if (cteData.remCnpj) {
          const senderRes = await client.query(
            `SELECT id FROM senders WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 AND organization_id = $2 LIMIT 1`,
            [cteData.remCnpj, orgId]
          )
          if (senderRes.rows.length > 0) {
            senderId = senderRes.rows[0].id
          } else {
            const newSender = await client.query(
              `INSERT INTO senders (name, cnpj, address, phone, organization_id, company_id)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id`,
              [
                cteData.remNome || 'Remetente',
                cteData.remCnpj,
                cteData.remEndereco || null,
                cteData.remTelefone || null,
                orgId,
                companyId,
              ]
            )
            senderId = newSender.rows[0]?.id || null
          }
        }

        // Motorista (Drivers): tenta vincular pela placa do veículo; se não encontrar, usa o primeiro motorista
        let driverId: string | null = null
        if (cteData.placa) {
          const cleanPlaca = cteData.placa.replace(/[-\s]/g, '')
          const driverPlateRes = await client.query(
            `SELECT id FROM drivers WHERE organization_id = $1 AND UPPER(replace(replace(default_plate, '-', ''), ' ', '')) = $2 LIMIT 1`,
            [orgId, cleanPlaca]
          )
          if (driverPlateRes.rows.length > 0) {
            driverId = driverPlateRes.rows[0].id
          }
        }

        if (!driverId) {
          const driverRes = await client.query(
            `SELECT id FROM drivers WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [orgId]
          )
          if (driverRes.rows.length > 0) {
            driverId = driverRes.rows[0].id
          } else {
            const newDriver = await client.query(
              `INSERT INTO drivers (name, phone, pin, organization_id, company_id, default_plate)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id`,
              ['Motorista SEFAZ', '', '0000', orgId, companyId, cteData.placa || null]
            )
            driverId = newDriver.rows[0]?.id || null
          }
        }

        // Formata o destinatário estruturado no campo JSON 'recipients'
        const formattedDestAddress = [cteData.destEndereco, destCity].filter(Boolean).join(', ')
        const recipientsArray = [
          {
            name: destDesc,
            destination: formattedDestAddress,
            invoices: cteData.invoices.join(', '),
          },
        ]

        // Metadados fiscais enriquecidos da SEFAZ
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
          destination_city: `${cteData.destCidade}/${cteData.destUf}`,
        }

        // Token seguro
        const tripToken = crypto.randomBytes(4).toString('hex').toUpperCase()

        // Insere a nova viagem
        await client.query(
          `INSERT INTO trips (
            company_id,
            driver_id,
            destination,
            invoices,
            token,
            status,
            cte_number,
            cte_key,
            service_type,
            sender,
            sender_id,
            recipients,
            organization_id,
            sefaz_metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            companyId,
            driverId,
            destCity || 'Destino conforme CT-e',
            cteData.invoices,
            tripToken,
            'in_transit',
            cteData.nCT,
            cteData.chCTe,
            'Estadia',
            cteData.remNome || 'Remetente',
            senderId,
            JSON.stringify(recipientsArray),
            orgId,
            JSON.stringify(sefazMetadata),
          ]
        )

        novasViagens++
        detalhes.push({
          cteNumber: cteData.nCT,
          destinatario: destDesc,
          cidade: destCity,
          status: 'criada',
        })
      }
    }

    // 5. Atualiza o estado do NSU para a próxima consulta
    await client.query(
      `UPDATE sefaz_sync_state
       SET last_nsu = $1, max_nsu = $2, last_sync_at = NOW(), status = 'idle', error_message = NULL, updated_at = NOW()
       WHERE organization_id = $3 AND cnpj = $4`,
      [sefazResponse.newUltNSU, sefazResponse.maxNSU, orgId, CNPJ_MATRIZ]
    )

    return {
      sucesso: true,
      mensagem: `Sincronização concluída com sucesso. ${novasViagens} nova(s) viagem(ns) criada(s) a partir da SEFAZ.`,
      novasViagens,
      documentosProcessados,
      ultimoNsu: sefazResponse.newUltNSU,
      maxNsu: sefazResponse.maxNSU,
      detalhes,
    }
  } catch (err: any) {
    console.error('❌ [SEFAZ Sync] Erro durante a sincronização:', err)
    return {
      sucesso: false,
      mensagem: `Erro ao sincronizar com a SEFAZ: ${err.message || 'Erro inesperado'}`,
      novasViagens: 0,
      documentosProcessados: 0,
      ultimoNsu: '000000000000000',
      maxNsu: '000000000000000',
    }
  } finally {
    client.release()
  }
}
