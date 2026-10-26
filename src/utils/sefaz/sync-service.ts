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
    const chCTe = xmlContent.match(/Id="CTe(\d+)"/)?.[1] || xmlContent.match(/<chCTe>(\d+)<\/chCTe>/)?.[1]
    const nCT = xmlContent.match(/<nCT>(.*?)<\/nCT>/)?.[1]

    if (!chCTe || !nCT) return null

    const serie = xmlContent.match(/<serie>(.*?)<\/serie>/)?.[1]
    const dhEmi = xmlContent.match(/<dhEmi>(.*?)<\/dhEmi>/)?.[1]

    // Emitente
    const emitCnpj = cleanDigits(xmlContent.match(/<emit>[\s\S]*?<CNPJ>(.*?)<\/CNPJ>/)?.[1])
    const emitNome = xmlContent.match(/<emit>[\s\S]*?<xNome>(.*?)<\/xNome>/)?.[1]

    // Remetente
    const remCnpj = cleanDigits(
      xmlContent.match(/<rem>[\s\S]*?<CNPJ>(.*?)<\/CNPJ>/)?.[1] ||
      xmlContent.match(/<rem>[\s\S]*?<CPF>(.*?)<\/CPF>/)?.[1]
    )
    const remNome = xmlContent.match(/<rem>[\s\S]*?<xNome>(.*?)<\/xNome>/)?.[1]
    const remLgr = xmlContent.match(/<rem>[\s\S]*?<xLgr>(.*?)<\/xLgr>/)?.[1] || ''
    const remNro = xmlContent.match(/<rem>[\s\S]*?<nro>(.*?)<\/nro>/)?.[1] || ''
    const remBairro = xmlContent.match(/<rem>[\s\S]*?<xBairro>(.*?)<\/xBairro>/)?.[1] || ''
    const remCidade = xmlContent.match(/<rem>[\s\S]*?<xMun>(.*?)<\/xMun>/)?.[1] || ''
    const remUf = xmlContent.match(/<rem>[\s\S]*?<UF>(.*?)<\/UF>/)?.[1] || ''
    const remTelefone = xmlContent.match(/<rem>[\s\S]*?<fone>(.*?)<\/fone>/)?.[1] || ''

    // Destinatário
    const destCnpj = cleanDigits(
      xmlContent.match(/<dest>[\s\S]*?<CNPJ>(.*?)<\/CNPJ>/)?.[1] ||
      xmlContent.match(/<dest>[\s\S]*?<CPF>(.*?)<\/CPF>/)?.[1]
    )
    const destNome = xmlContent.match(/<dest>[\s\S]*?<xNome>(.*?)<\/xNome>/)?.[1]
    const destLgr = xmlContent.match(/<dest>[\s\S]*?<xLgr>(.*?)<\/xLgr>/)?.[1] || ''
    const destNro = xmlContent.match(/<dest>[\s\S]*?<nro>(.*?)<\/nro>/)?.[1] || ''
    const destBairro = xmlContent.match(/<dest>[\s\S]*?<xBairro>(.*?)<\/xBairro>/)?.[1] || ''
    const destCidade = xmlContent.match(/<dest>[\s\S]*?<xMun>(.*?)<\/xMun>/)?.[1] || ''
    const destUf = xmlContent.match(/<dest>[\s\S]*?<UF>(.*?)<\/UF>/)?.[1] || ''
    const destTelefone = xmlContent.match(/<dest>[\s\S]*?<fone>(.*?)<\/fone>/)?.[1] || ''

    // Frete
    const vRecStr = xmlContent.match(/<vTPrest>[\s\S]*?<vRec>(.*?)<\/vRec>/)?.[1]
    const vFrete = vRecStr ? parseFloat(vRecStr) : undefined

    // Notas Fiscais
    const invoices: string[] = []
    const chNFeMatches = [...xmlContent.matchAll(/<chave>(.*?)<\/chave>/g)].map((m) => m[1])
    for (const key of chNFeMatches) {
      // Extrai número da nota (posições 25 a 34 da chave de 44 dígitos)
      if (key.length === 44) {
        const nfNum = parseInt(key.slice(25, 34), 10)
        invoices.push(String(nfNum))
      } else {
        invoices.push(key)
      }
    }

    // Também verifica tags antigas de NF comum (<nNF> ou <nDoc>)
    const nNfMatches = [...xmlContent.matchAll(/<nNF>(.*?)<\/nNF>/g)].map((m) => m[1])
    for (const nf of nNfMatches) {
      if (!invoices.includes(nf)) invoices.push(nf)
    }

    // Placa (tag direta ou tag ObsCont)
    let placa = xmlContent.match(/<placa>(.*?)<\/placa>/)?.[1]?.toUpperCase()
    if (!placa) {
      placa = xmlContent.match(/xCampo="PLACA"[\s\S]*?<xTexto>(.*?)<\/xTexto>/i)?.[1]?.toUpperCase()
    }

    // Dados de Carga (Peso, Valor da Mercadoria, Produto Predominante)
    const qCargaStr = xmlContent.match(/<qCarga>(.*?)<\/qCarga>/)?.[1]
    const weightKg = qCargaStr ? parseFloat(qCargaStr) : undefined

    const vCargaStr = xmlContent.match(/<vCarga>(.*?)<\/vCarga>/)?.[1]
    const cargoValue = vCargaStr ? parseFloat(vCargaStr) : undefined

    const cargoType = xmlContent.match(/<proPred>(.*?)<\/proPred>/)?.[1]

    // RNTRC
    const rntrc = xmlContent.match(/<RNTRC>(.*?)<\/RNTRC>/)?.[1]

    // Observações da Minuta / SEFAZ
    const observations = xmlContent.match(/<xObs>([\s\S]*?)<\/xObs>/)?.[1]?.trim()

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
