import pg from 'pg'
import crypto from 'crypto'
import { formatCNPJ } from '@/utils/masks'
import { appendTripAuditEvent, parseSafeMetadata } from '@/utils/trip-audit'

export interface ParsedEdiCte {
  nCT: string
  serie: string
  filial?: string
  chCTe: string
  placa: string
  formattedPlate: string
  issueDate?: string
  condicaoFrete?: 'CIF' | 'FOB'
  volumes?: number
  weightKg?: number
  pesoCalculoKg?: number
  cubagemM3?: number
  vFrete?: number
  invoices: string[]
  remNome?: string
  remCnpj?: string
  remEndereco?: string
  remBairro?: string
  remCidade?: string
  remUf?: string
  remTelefone?: string
  destNome?: string
  destCnpj?: string
  destEndereco?: string
  destBairro?: string
  destCidade?: string
  destUf?: string
  destTelefone?: string
  tomadorCnpj?: string
}

export interface ParsedEdiManifest {
  manifestKey: string
  manifestNumber: string
  filial: string
  plate: string
  formattedPlate: string
  issueDate?: string
  remNome?: string
  remCnpj?: string
  remEndereco?: string
  remCidade?: string
  remUf?: string
  remTelefone?: string
  destCity?: string
  destinations: string[]
  totalWeightKg: number
  totalCalculatedWeightKg: number
  totalCubagemM3: number
  totalVolumes: number
  totalFreightValue: number
  invoices: string[]
  ctes: ParsedEdiCte[]
}

export interface ParsedEdiConemb {
  isConemb: boolean
  version?: '3.1' | '5.0'
  transportadora?: string
  cnpjTransportadora?: string
  destinatario?: string
  intercambioId?: string
  totalCtes: number
  ctes: ParsedEdiCte[]
}

/**
 * Formata uma placa Mercosul ou Padrão antigo (ex: ABC1234 -> ABC-1234, ABC1D23 -> ABC-1D23)
 */
export function formatPlate(raw: string): string {
  if (!raw) return ''
  const clean = raw.replace(/[-\s]/g, '').toUpperCase()
  if (clean.length === 7) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`
  }
  return clean
}

/**
 * Parser polimórfico para layout EDI PROCEDA CONEMB:
 * - CONEMB 5.0 (registros 000, 520, 521, 522, 523, 524, 527, 529)
 * - CONEMB 3.1 (registros 000, 320, 321, 322, 323, 329) - Ex: Santa Helena / ERPs tradicionais
 */
export function parseProcedaConemb(ediText: string): ParsedEdiConemb {
  const lines = ediText.split(/\r?\n/).filter((l) => l.trim().length > 0)

  // Verifica assinatura de header PROCEDA (000) e lote de conhecimentos (520/522 no CONEMB 5.0 ou 320/322 no CONEMB 3.1)
  const has000 = lines.some((l) => l.startsWith('000'))
  const has520 = lines.some((l) => l.startsWith('520') || l.startsWith('522'))
  const has320 = lines.some((l) => l.startsWith('320') || l.startsWith('322'))

  if (!has000 && !has520 && !has320) {
    return { isConemb: false, totalCtes: 0, ctes: [] }
  }

  const version: '3.1' | '5.0' = has320 ? '3.1' : '5.0'
  let transportadora = ''
  let cnpjTransportadora = ''
  let destinatario = ''
  let intercambioId = ''
  const ctes: ParsedEdiCte[] = []
  let currentCte: ParsedEdiCte | null = null

  for (const line of lines) {
    const regType = line.slice(0, 3)

    if (regType === '000') {
      transportadora = line.slice(3, 38).trim()
      destinatario = line.slice(38, 73).trim()
      const rawInter = line.slice(83, 95).trim()
      if (rawInter) intercambioId = rawInter
    } else if (regType === '321') {
      // Registro 321 (CONEMB 3.1): Dados da Transportadora
      cnpjTransportadora = line.slice(3, 17).trim()
      if (!transportadora) {
        transportadora = line.slice(17, 57).trim()
      }
    } else if (regType === '322') {
      // Registro 322 (CONEMB 3.1): Conhecimento Embarcado completo em linha única
      const filial = line.slice(3, 13).trim()
      const serie = line.slice(13, 18).trim()
      const nCTRaw = line.slice(18, 30).trim()
      const nCT = String(parseInt(nCTRaw, 10) || nCTRaw)

      const rawDate = line.slice(30, 38).trim() // DDMMAAAA
      let issueDate: string | undefined
      if (rawDate.length === 8) {
        const dia = rawDate.slice(0, 2)
        const mes = rawDate.slice(2, 4)
        const ano = rawDate.slice(4, 8)
        issueDate = `${ano}-${mes}-${dia}`
      }

      const condFreteRaw = line.slice(38, 39).trim()
      const condicaoFrete: 'CIF' | 'FOB' = condFreteRaw === 'F' ? 'FOB' : 'CIF'

      const pesoRaw = line.slice(39, 46).trim()
      const weightKg = pesoRaw && !isNaN(Number(pesoRaw)) ? parseFloat(pesoRaw) / 100 : undefined

      const freteRaw = line.slice(46, 61).trim()
      const vFrete = freteRaw && !isNaN(Number(freteRaw)) ? parseFloat(freteRaw) / 100 : undefined

      // Extração resiliente de CNPJ do Emissor e CNPJ do Embarcador / Remetente
      const subChunk = line.slice(190, 240)
      const cnpjsMatch = subChunk.match(/(\d{14})(\d{14})/)
      let emitCnpj = ''
      let remCnpj = ''
      let nfStartIndex = 232

      if (cnpjsMatch) {
        emitCnpj = cnpjsMatch[1]
        remCnpj = cnpjsMatch[2]
        const chunkPos = line.indexOf(cnpjsMatch[0])
        if (chunkPos !== -1) {
          nfStartIndex = chunkPos + 28
        }
      } else {
        emitCnpj = line.slice(204, 218).trim()
        remCnpj = line.slice(218, 232).trim()
      }

      // Notas Fiscais: até 40 ocorrências de (Série 3 pos + Número 8 pos = 11 pos)
      const nfsChunk = line.slice(nfStartIndex, 672)
      const invoices: string[] = []
      for (let i = 0; i < nfsChunk.length - 7; i += 11) {
        const nfBlock = nfsChunk.slice(i, i + 11)
        const nfNumRaw = nfBlock.slice(3, 11).trim()
        if (nfBlock.length >= 11 && nfNumRaw && !/^0+$/.test(nfNumRaw)) {
          const cleanNum = String(parseInt(nfNumRaw, 10))
          if (cleanNum && cleanNum !== '0' && !invoices.includes(cleanNum)) {
            invoices.push(cleanNum)
          }
        }
      }

      // Chave do CT-e (44 dígitos: pos 680 a 724 ou busca na linha)
      let chCTe = ''
      if (line.length >= 724) {
        const candidateKey = line.slice(680, 724).trim()
        if (/^\d{44}$/.test(candidateKey)) {
          chCTe = candidateKey
        }
      }
      if (!chCTe) {
        const match = line.match(/\b(\d{44})\b/)
        if (match) chCTe = match[1]
      }

      // Placa (se houver na linha)
      let placa = ''
      const directPlateMatch = line.match(/\b([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})\b/)
      if (directPlateMatch) {
        placa = directPlateMatch[1]
      }

      ctes.push({
        nCT,
        serie,
        filial,
        chCTe,
        placa,
        formattedPlate: formatPlate(placa),
        issueDate,
        condicaoFrete,
        weightKg,
        pesoCalculoKg: weightKg,
        vFrete,
        invoices,
        remNome: destinatario || undefined,
        remCnpj: remCnpj && remCnpj !== '00000000000000' ? remCnpj : undefined,
      })
    } else if (regType === '521') {
      cnpjTransportadora = line.slice(3, 17).trim()
      if (!transportadora) {
        transportadora = line.slice(17, 57).trim()
      }
    } else if (regType === '522') {
      // Início de um novo CT-e no lote
      if (currentCte) {
        ctes.push(currentCte)
      }

      const filial = line.slice(3, 13).trim()
      const serie = line.slice(13, 18).trim()
      const nCTRaw = line.slice(18, 30).trim()
      const nCT = String(parseInt(nCTRaw, 10) || nCTRaw)
      const rawDate = line.slice(30, 38).trim() // DDMMAAAA
      let issueDate: string | undefined
      if (rawDate.length === 8) {
        const dia = rawDate.slice(0, 2)
        const mes = rawDate.slice(2, 4)
        const ano = rawDate.slice(4, 8)
        issueDate = `${ano}-${mes}-${dia}`
      }

      const emitCnpj = line.slice(39, 53).trim()
      const remCnpj = line.slice(53, 67).trim()
      const destCnpj = line.slice(81, 95).trim()
      const tomadorCnpj = line.slice(95, 109).trim()
      const condFreteRaw = line.slice(38, 39).trim()
      const condicaoFrete: 'CIF' | 'FOB' = condFreteRaw === 'F' ? 'FOB' : 'CIF'

      // No registro 522 do PROCEDA CONEMB 5.0 (350 caracteres):
      // Posição 334-336: UF Origem (ex: "SP")
      // Posição 336-338: UF Expedidor (ex: "SP")
      // Posição 338-340: UF Destino (ex: "RJ", "RS", "SP")
      const VALID_BRAZILIAN_UFS = new Set([
        'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
        'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
      ])
      let destUf: string | undefined
      if (line.length >= 340) {
        const candidateDest = line.slice(338, 340).trim().toUpperCase()
        if (VALID_BRAZILIAN_UFS.has(candidateDest)) {
          destUf = candidateDest
        }
      }
      let remUf: string | undefined
      if (line.length >= 336) {
        const candidateOrig = line.slice(334, 336).trim().toUpperCase()
        if (VALID_BRAZILIAN_UFS.has(candidateOrig)) {
          remUf = candidateOrig
        }
      }

      // Chave do CT-e (44 dígitos contíguos na linha)
      const chCTeMatch = line.match(/\b(\d{44})\b/)
      const chCTe = chCTeMatch ? chCTeMatch[1] : ''

      // Extração de Placa: No registro 522 do PROCEDA CONEMB, a UF fica em 114-116 e a Placa em 116-123
      let placa = ''
      const posPlate = line.slice(116, 123).trim().toUpperCase()
      if (/^[A-Z]{3}\d{4}$/.test(posPlate) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(posPlate)) {
        placa = posPlate
      } else {
        // Fallback: procura padrão com ou sem UF na linha inteira
        const ufPlateMatch = line.match(/\b[A-Z]{2}([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})\b/)
        if (ufPlateMatch) {
          placa = ufPlateMatch[1]
        } else {
          const directPlateMatch = line.match(/\b([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})\b/)
          if (directPlateMatch) {
            placa = directPlateMatch[1]
          }
        }
      }

      currentCte = {
        nCT,
        serie,
        filial,
        chCTe,
        placa,
        formattedPlate: formatPlate(placa),
        issueDate,
        condicaoFrete,
        remCnpj: remCnpj && remCnpj !== '00000000000000' ? remCnpj : undefined,
        remUf,
        destCnpj: destCnpj && destCnpj !== '00000000000000' ? destCnpj : undefined,
        tomadorCnpj: tomadorCnpj && tomadorCnpj !== '00000000000000' ? tomadorCnpj : undefined,
        destUf,
        invoices: [],
      }
    } else if (regType === '523' && currentCte) {
      // Registro 523: Totais do Conhecimento (Volumes, Pesos, Cubagem e Frete)
      // Posição 004-011: Volumes (N 6,2 -> 2 casas decimais -> divide por 100)
      const volRaw = line.slice(3, 11).trim()
      if (volRaw && !isNaN(Number(volRaw))) {
        currentCte.volumes = Math.round(parseFloat(volRaw) / 100)
      }

      // Posição 012-020: Peso Bruto Real (N 6,3 -> 3 casas decimais -> divide por 1000)
      const pesoRaw = line.slice(11, 20).trim()
      if (pesoRaw && !isNaN(Number(pesoRaw))) {
        currentCte.weightKg = parseFloat(pesoRaw) / 1000
      }

      // Posição 031-040: Cubagem em m³ (N 6,4 -> 4 casas decimais -> divide por 10000)
      const cubagemRaw = line.slice(30, 40).trim()
      if (cubagemRaw && !isNaN(Number(cubagemRaw))) {
        currentCte.cubagemM3 = parseFloat(cubagemRaw) / 10000
      }

      // Posição 021-030: Peso Cubado (N 6,4 -> 4 decimais ou cálculo cubagem x 250 kg/m³)
      const pesoCubadoRaw = line.slice(20, 30).trim()
      if (currentCte.cubagemM3 && currentCte.cubagemM3 > 0) {
        // Fator padrão rodoviário de 250 kg/m³ (conforme demonstrado no DACTE da CCargo)
        const cubadoCalc = currentCte.cubagemM3 * 250
        currentCte.pesoCalculoKg = Math.max(currentCte.weightKg || 0, cubadoCalc)
      } else if (pesoCubadoRaw && !isNaN(Number(pesoCubadoRaw))) {
        const cubadoEdi = parseFloat(pesoCubadoRaw) / 10000
        currentCte.pesoCalculoKg = Math.max(currentCte.weightKg || 0, cubadoEdi)
      } else {
        currentCte.pesoCalculoKg = currentCte.weightKg
      }

      // Posição 041-055: Valor Total do Frete (N 13,2 -> 2 decimais -> divide por 100)
      const freteRaw = line.slice(40, 55).trim()
      if (freteRaw && !isNaN(Number(freteRaw))) {
        currentCte.vFrete = parseFloat(freteRaw) / 100
      }
    } else if (regType === '524' && currentCte) {
      // Registro 524: Dados das Notas Fiscais
      // Posição 17-26: Número da NF (limpando zeros à esquerda)
      const nfRaw = line.slice(17, 26).trim()
      const nfNum = nfRaw ? String(parseInt(nfRaw, 10)) : ''
      if (nfNum && !currentCte.invoices.includes(nfNum)) {
        currentCte.invoices.push(nfNum)
      }
    } else if (regType === '527' && currentCte) {
      // Registro 527: Dados Cadastrais do Embarcador / Parceiro Comercial no Intercâmbio EDI
      const clienteNome = line.slice(3, 63).trim()
      const cnpjEmbarcadorRaw = line.slice(63, 77).trim()
      const cnpjEmbarcador = cnpjEmbarcadorRaw && cnpjEmbarcadorRaw !== '00000000000000' ? cnpjEmbarcadorRaw : undefined
      const clienteEndereco = line.slice(92, 152).trim()
      const clienteBairro = line.slice(152, 187).trim()
      const clienteCidade = line.slice(187, 222).trim()
      const clienteUf = line.slice(238, 244).trim()
      const clienteTelefone = line.slice(245).trim()

      // Se o CNPJ do 527 bater com o CNPJ do Remetente do CT-e (ex: frete CIF emitido pelo cliente)
      if (cnpjEmbarcador && currentCte.remCnpj && cnpjEmbarcador === currentCte.remCnpj) {
        currentCte.remNome = clienteNome
        currentCte.remEndereco = clienteEndereco
        currentCte.remBairro = clienteBairro
        currentCte.remCidade = clienteCidade
        currentCte.remUf = clienteUf
        currentCte.remTelefone = clienteTelefone
      } else if (cnpjEmbarcador && currentCte.destCnpj && cnpjEmbarcador === currentCte.destCnpj) {
        // Se o CNPJ do 527 bater com o CNPJ do Destinatário do CT-e (ex: frete FOB onde cliente recebe)
        currentCte.destNome = clienteNome
        currentCte.destEndereco = clienteEndereco
        currentCte.destBairro = clienteBairro
        currentCte.destCidade = clienteCidade
        currentCte.destUf = clienteUf
        currentCte.destTelefone = clienteTelefone
      } else {
        // Fallback: se o remetente não tiver nome e for CIF, atribui ao remetente
        if (!currentCte.remNome && currentCte.condicaoFrete !== 'FOB') {
          currentCte.remNome = clienteNome
          currentCte.remEndereco = clienteEndereco
          currentCte.remBairro = clienteBairro
          currentCte.remCidade = clienteCidade
          currentCte.remUf = clienteUf
          currentCte.remTelefone = clienteTelefone
        }
      }
    }
  }

  if (currentCte) {
    ctes.push(currentCte)
  }

  return {
    isConemb: true,
    version,
    transportadora,
    cnpjTransportadora,
    destinatario,
    intercambioId,
    totalCtes: ctes.length,
    ctes,
  }
}

/**
 * Consulta dados cadastrais do CNPJ na BrasilAPI para enriquecer Destinatário / Remetente
 */
async function fetchCnpjInfo(cnpj: string): Promise<{
  razao_social?: string
  municipio?: string
  uf?: string
  logradouro?: string
  numero?: string
  bairro?: string
  cep?: string
  telefone?: string
} | null> {
  const clean = cnpj.replace(/\D/g, '')
  if (clean.length !== 14) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    return {
      razao_social: data.razao_social || data.nome_fantasia,
      municipio: data.municipio,
      uf: data.uf,
      logradouro: data.logradouro,
      numero: data.numero,
      bairro: data.bairro,
      cep: data.cep,
      telefone: data.ddd_telefone_1,
    }
  } catch (e) {
    return null
  }
}

/**
 * Cria ou atualiza as viagens de um lote EDI CONEMB no banco de dados,
 * vinculando automaticamente o motorista pela placa do veículo.
 */
export async function processEdiLoteInDatabase(
  dbClient: pg.PoolClient,
  parsedEdi: ParsedEdiConemb,
  orgId: string,
  companyId: string | null
): Promise<{
  created: number
  updated: number
  details: Array<{
    cteNumber: string
    plate: string
    driverName?: string
    sender?: string
    status: 'criado' | 'existente' | 'erro'
    error?: string
  }>
}> {
  let created = 0
  let updated = 0
  const details: Array<{
    cteNumber: string
    plate: string
    driverName?: string
    sender?: string
    status: 'criado' | 'existente' | 'erro'
    error?: string
  }> = []

  // Carrega motoristas da organização para cruzamento rápido de placa
  const driversRes = await dbClient.query(
    `SELECT id, name, default_plate FROM drivers WHERE organization_id = $1`,
    [orgId]
  )
  const drivers = driversRes.rows

  // Carrega destinatários cadastrados para enriquecer os dados fiscais do EDI
  const recipientsRes = await dbClient.query(
    `SELECT id, name, cnpj, city, address FROM recipients WHERE organization_id = $1`,
    [orgId]
  )
  const existingRecipients = recipientsRes.rows

  // Carrega remetentes cadastrados
  const sendersRes = await dbClient.query(
    `SELECT id, name, cnpj, city, address, phone FROM senders WHERE organization_id = $1`,
    [orgId]
  )
  const existingSenders = sendersRes.rows

  // 1. Agrupamento dos CT-es por Romaneio / Veículo: Filial + Placa
  const manifestsMap = new Map<string, ParsedEdiManifest>()

  for (const cte of parsedEdi.ctes) {
    // Cruzamento com destinatários cadastrados pelo CNPJ ou enriquecimento automático via BrasilAPI
    if (cte.destCnpj) {
      const cleanDestCnpj = cte.destCnpj.replace(/\D/g, '')
      let matchedRec = existingRecipients.find(
        (r) => (r.cnpj || '').replace(/\D/g, '') === cleanDestCnpj
      )
      if (matchedRec) {
        cte.destNome = matchedRec.name
        if (matchedRec.city) cte.destCidade = matchedRec.city
        if (matchedRec.address) cte.destEndereco = matchedRec.address
      } else if (cleanDestCnpj.length === 14) {
        const info = await fetchCnpjInfo(cleanDestCnpj)
        if (info) {
          if (info.razao_social) cte.destNome = info.razao_social
          if (info.municipio) cte.destCidade = info.municipio
          if (info.uf) cte.destUf = info.uf
          if (info.logradouro) {
            cte.destEndereco = `${info.logradouro}${info.numero ? `, ${info.numero}` : ''}${info.bairro ? ` - ${info.bairro}` : ''}`
          }

          // Persiste no banco de dados na tabela recipients para enriquecer o cadastro da organização
          try {
            const insRes = await dbClient.query(
              `INSERT INTO recipients (name, cnpj, city, address, zip_code, phone, organization_id, company_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO NOTHING
               RETURNING id, name, cnpj, city, address`,
              [
                cte.destNome || `Destinatário (${formatCNPJ(cleanDestCnpj)})`,
                formatCNPJ(cleanDestCnpj),
                cte.destCidade || null,
                cte.destEndereco || null,
                info.cep || null,
                info.telefone || null,
                orgId,
                companyId,
              ]
            )
            if (insRes.rows[0]) {
              existingRecipients.push(insRes.rows[0])
            }
          } catch (e) {
            // Ignora duplicidade
          }
        }
      }
    }

    // Cruzamento com remetentes cadastrados pelo CNPJ
    if (cte.remCnpj) {
      const cleanRemCnpj = cte.remCnpj.replace(/\D/g, '')
      let matchedSend = existingSenders.find(
        (s) => (s.cnpj || '').replace(/\D/g, '') === cleanRemCnpj
      )
      if (matchedSend) {
        if (!cte.remNome) cte.remNome = matchedSend.name
        if (!cte.remCidade && matchedSend.city) cte.remCidade = matchedSend.city
        if (!cte.remEndereco && matchedSend.address) cte.remEndereco = matchedSend.address
      } else if (!cte.remNome && cleanRemCnpj.length === 14) {
        const info = await fetchCnpjInfo(cleanRemCnpj)
        if (info) {
          if (info.razao_social) cte.remNome = info.razao_social
          if (info.municipio) cte.remCidade = info.municipio
          if (info.uf) cte.remUf = info.uf
          if (info.logradouro) {
            cte.remEndereco = `${info.logradouro}${info.numero ? `, ${info.numero}` : ''}${info.bairro ? ` - ${info.bairro}` : ''}`
          }
        }
      }
    }

    const rawPlate = cte.placa || 'SEM_PLACA'
    const filial = cte.filial || 'GRU'
    // Se não tiver placa informada (padrão no CONEMB 3.1 da Santa Helena), agrupa pelo Lote/Intercâmbio + Filial (Opção A)
    const isLoteSemPlaca = rawPlate === 'SEM_PLACA'
    const loteKey = parsedEdi.intercambioId || 'LOTE'
    const key = isLoteSemPlaca
      ? `ROM-${filial}-${loteKey}`
      : `ROM-${filial}-${rawPlate}`

    const manifestNumber = isLoteSemPlaca
      ? `Lote ${parsedEdi.destinatario || 'Santa Helena'} • ${parsedEdi.intercambioId || filial}`
      : `Romaneio ${filial} • ${formatPlate(rawPlate)}`

    if (!manifestsMap.has(key)) {
      manifestsMap.set(key, {
        manifestKey: key,
        manifestNumber,
        filial,
        plate: rawPlate,
        formattedPlate: formatPlate(rawPlate),
        issueDate: cte.issueDate,
        remNome: cte.remNome || parsedEdi.destinatario || undefined,
        remCnpj: cte.remCnpj,
        remEndereco: cte.remEndereco,
        remCidade: cte.remCidade,
        remUf: cte.remUf,
        remTelefone: cte.remTelefone,
        destCity: cte.destCidade
          ? `${cte.destCidade}${cte.destUf ? `/${cte.destUf}` : ''}`
          : (cte.destUf ? `${cte.destUf}` : 'Destino'),
        destinations: [],
        totalWeightKg: 0,
        totalCalculatedWeightKg: 0,
        totalCubagemM3: 0,
        totalVolumes: 0,
        totalFreightValue: 0,
        invoices: [],
        ctes: [],
      })
    }

    const m = manifestsMap.get(key)!
    m.ctes.push(cte)
    m.totalWeightKg += cte.weightKg || 0
    m.totalCalculatedWeightKg += cte.pesoCalculoKg || cte.weightKg || 0
    m.totalCubagemM3 += cte.cubagemM3 || 0
    m.totalVolumes += cte.volumes || 0
    m.totalFreightValue += cte.vFrete || 0

    // Acumula NFs sem duplicidade
    cte.invoices.forEach((inv) => {
      if (!m.invoices.includes(inv)) m.invoices.push(inv)
    })

    // Acumula destinos reais das entregas
    const dest = cte.destCidade
      ? `${cte.destCidade}${cte.destUf ? `/${cte.destUf}` : ''}`
      : (cte.destUf ? `${cte.destUf}` : '')
    if (dest && !m.destinations.includes(dest)) {
      m.destinations.push(dest)
    }

    if (!m.remNome && cte.remNome) m.remNome = cte.remNome
    if (!m.remCnpj && cte.remCnpj) m.remCnpj = cte.remCnpj
  }

  // 2. Itera sobre cada Romaneio / Manifesto gerado
  for (const manifest of manifestsMap.values()) {
    try {
      // 2.1 Verifica duplicidade pelo Identificador do Romaneio
      const existingRes = await dbClient.query(
        `SELECT id, sefaz_metadata FROM trips 
         WHERE organization_id = $1 
           AND (sefaz_metadata->>'manifest_key' = $2 OR cte_number = $3 OR cte_number = $4) LIMIT 1`,
        [orgId, manifest.manifestKey, manifest.manifestNumber, manifest.manifestKey]
      )

      // Vinculação de Motorista pela Placa do Veículo
      let matchedDriverId: string | null = null
      let matchedDriverName: string | null = null

      if (manifest.plate && manifest.plate !== 'SEM_PLACA') {
        const cleanPlaca = manifest.plate.replace(/[-\s]/g, '').toUpperCase()
        const foundDriver = drivers.find(
          (d) => (d.default_plate || '').replace(/[-\s]/g, '').toUpperCase() === cleanPlaca
        )
        if (foundDriver) {
          matchedDriverId = foundDriver.id
          matchedDriverName = foundDriver.name
        }
      }

      const destCitySummary = manifest.destinations.length > 0
        ? manifest.destinations.slice(0, 2).join(' / ') + (manifest.destinations.length > 2 ? ` (+${manifest.destinations.length - 2} cidades)` : '')
        : manifest.destCity || 'Destino'

      const sefazMetadata = {
        is_manifest: true,
        manifest_key: manifest.manifestKey,
        manifest_number: manifest.manifestNumber,
        plate: manifest.formattedPlate || manifest.plate || null,
        total_ctes: manifest.ctes.length,
        total_weight_kg: manifest.totalWeightKg > 0 ? manifest.totalWeightKg : null,
        total_calculated_weight_kg: manifest.totalCalculatedWeightKg > 0 ? manifest.totalCalculatedWeightKg : null,
        total_cubagem_m3: manifest.totalCubagemM3 > 0 ? manifest.totalCubagemM3 : null,
        total_volumes: manifest.totalVolumes > 0 ? manifest.totalVolumes : null,
        cargo_value: null,
        cargo_type: manifest.plate && manifest.plate !== 'SEM_PLACA'
          ? `Romaneio de Carga (${manifest.ctes.length} CT-es)`
          : `Lote de Carga (${manifest.ctes.length} CT-es)`,
        freight_value: manifest.totalFreightValue > 0 ? manifest.totalFreightValue : null,
        rntrc: null,
        observations: manifest.plate && manifest.plate !== 'SEM_PLACA'
          ? `Romaneio SSW ${manifest.formattedPlate} • ${manifest.ctes.length} CT-es • ${manifest.invoices.length} NFs • ${manifest.totalCubagemM3.toFixed(2)} m³`
          : `Lote EDI ${parsedEdi.destinatario || 'Santa Helena'} (${parsedEdi.intercambioId || 'SSW'}) • ${manifest.ctes.length} CT-es • ${manifest.invoices.length} NFs • Total Frete: R$ ${manifest.totalFreightValue.toFixed(2)}`,
        emitter_cnpj: parsedEdi.cnpjTransportadora || null,
        emitter_name: parsedEdi.transportadora || null,
        sender_name: manifest.remNome || null,
        sender_cnpj: manifest.remCnpj ? formatCNPJ(manifest.remCnpj) : null,
        sender_city: manifest.remCidade || null,
        sender_uf: manifest.remUf || null,
        issue_date: manifest.issueDate || null,
        origin_city: manifest.remCidade
          ? `${manifest.remCidade}${manifest.remUf ? `/${manifest.remUf}` : ''}`
          : (manifest.filial ? `Filial ${manifest.filial}` : 'Guarulhos/SP'),
        destination_city: destCitySummary,
        source: 'edi_conemb_ssw_manifest',
        ctes: manifest.ctes.map((c) => ({
          nCT: c.nCT,
          serie: c.serie,
          chCTe: c.chCTe,
          placa: c.formattedPlate || c.placa,
          volumes: c.volumes ?? null,
          weightKg: c.weightKg ?? null,
          pesoCalculoKg: c.pesoCalculoKg ?? null,
          cubagemM3: c.cubagemM3 ?? null,
          vFrete: c.vFrete ?? null,
          invoices: c.invoices,
          remNome: c.remNome,
          remCnpj: c.remCnpj ? formatCNPJ(c.remCnpj) : null,
          remCidade: c.remCidade,
          remUf: c.remUf,
          destNome: c.destNome || (c.destCnpj ? `Destinatário (${formatCNPJ(c.destCnpj)})` : 'Destinatário'),
          destCnpj: c.destCnpj ? formatCNPJ(c.destCnpj) : null,
          destCidade: c.destCidade,
          destUf: c.destUf,
        })),
      }

      // Destinatários estruturados dos CT-es
      const recipientsArray = manifest.ctes.map((c) => ({
        name: c.destNome || (c.destCnpj ? `Destinatário (${formatCNPJ(c.destCnpj)})` : 'Destinatário'),
        cnpj: c.destCnpj ? formatCNPJ(c.destCnpj) : null,
        destination: c.destCidade
          ? `${c.destCidade}${c.destUf ? `/${c.destUf}` : ''}`
          : (c.destUf ? `${c.destUf}` : 'Destino'),
        invoices: c.invoices.join(', '),
        cteNumber: c.nCT,
      }))

      if (existingRes.rows.length > 0) {
        const oldMeta = parseSafeMetadata(existingRes.rows[0].sefaz_metadata)
        let mergedMeta: Record<string, any> = {
          ...sefazMetadata,
          audit_logs: Array.isArray(oldMeta.audit_logs) ? oldMeta.audit_logs : [],
          incidents: Array.isArray(oldMeta.incidents) ? oldMeta.incidents : [],
          has_open_incident: Boolean(oldMeta.has_open_incident),
          pending_telegram_incident_id: oldMeta.pending_telegram_incident_id,
        }
        mergedMeta = appendTripAuditEvent(mergedMeta, {
          type: 'TRIP_UPDATED',
          title: manifest.plate && manifest.plate !== 'SEM_PLACA'
            ? 'Romaneio SSW Sincronizado / Atualizado via EDI'
            : 'Lote EDI SSW Sincronizado / Atualizado',
          description: `Dados fiscais atualizados (${manifest.ctes.length} CT-es, ${manifest.invoices.length} NFs).`,
          channel: 'edi_ssw',
          actorName: 'Robô EDI SSW',
          metadata: { plate: manifest.formattedPlate || manifest.plate, extra: parsedEdi.intercambioId },
        })

        await dbClient.query(
          `UPDATE trips 
           SET sefaz_metadata = $1,
               invoices = $2,
               destination = $3,
               recipients = $4,
               sender = COALESCE($5, sender),
               driver_id = COALESCE(driver_id, $6)
           WHERE id = $7`,
          [
            JSON.stringify(mergedMeta),
            manifest.invoices,
            destCitySummary,
            JSON.stringify(recipientsArray),
            manifest.remNome || null,
            matchedDriverId,
            existingRes.rows[0].id,
          ]
        )
        updated++
        details.push({
          cteNumber: manifest.manifestNumber,
          plate: manifest.formattedPlate || manifest.plate,
          driverName: matchedDriverName || undefined,
          sender: `${manifest.ctes.length} CT-es • ${manifest.invoices.length} NFs`,
          status: 'existente',
        })
        continue
      }

      // Localiza ou Cria Remetente
      let senderId: string | null = null
      if (manifest.remCnpj) {
        const cleanCnpj = manifest.remCnpj.replace(/\D/g, '')
        const senderRes = await dbClient.query(
          `SELECT id, name FROM senders 
           WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 
             AND organization_id = $2 LIMIT 1`,
          [cleanCnpj, orgId]
        )

        if (senderRes.rows.length > 0) {
          senderId = senderRes.rows[0].id
          if (!manifest.remNome && senderRes.rows[0].name) {
            manifest.remNome = senderRes.rows[0].name
          }
        } else {
          const newSender = await dbClient.query(
            `INSERT INTO senders (name, cnpj, address, city, phone, organization_id, company_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              manifest.remNome || `Remetente (${formatCNPJ(cleanCnpj)})`,
              formatCNPJ(cleanCnpj),
              manifest.remEndereco || null,
              manifest.remCidade || null,
              manifest.remTelefone || null,
              orgId,
              companyId,
            ]
          )
          senderId = newSender.rows[0]?.id || null
        }
      }

      const tripToken = crypto.randomBytes(4).toString('hex').toUpperCase()

      let initialMeta = appendTripAuditEvent(sefazMetadata, {
        type: 'CREATED',
        title: manifest.plate && manifest.plate !== 'SEM_PLACA'
          ? 'Romaneio Importado via EDI SSW (CONEMB)'
          : 'Lote EDI Importado via SSW (CONEMB 3.1)',
        description: `${manifest.manifestNumber} importado com ${manifest.ctes.length} CT-e(s) e ${manifest.invoices.length} NF(s) para ${destCitySummary}.`,
        channel: 'edi_ssw',
        actorName: 'Importação EDI SSW',
        metadata: { plate: manifest.formattedPlate || manifest.plate, extra: parsedEdi.intercambioId },
      })

      if (matchedDriverId && matchedDriverName) {
        initialMeta = appendTripAuditEvent(initialMeta, {
          type: 'DRIVER_ASSIGNED',
          title: `Motorista Vinculado Automaticamente: ${matchedDriverName}`,
          description: `Cruzamento automático pela placa ${manifest.formattedPlate || manifest.plate}.`,
          channel: 'edi_ssw',
          actorName: 'Sistema AuditCargo',
          metadata: { plate: manifest.formattedPlate || manifest.plate },
        })
      }

      // Insere o Romaneio como uma Viagem única
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
          matchedDriverId,
          'pending',
          destCitySummary,
          manifest.invoices,
          tripToken,
          manifest.manifestNumber,
          manifest.manifestKey,
          manifest.remNome || 'Remetente EDI',
          senderId,
          JSON.stringify(recipientsArray),
          orgId,
          JSON.stringify(initialMeta),
        ]
      )

      created++
      details.push({
        cteNumber: manifest.manifestNumber,
        plate: manifest.formattedPlate || manifest.plate,
        driverName: matchedDriverName || undefined,
        sender: `${manifest.ctes.length} CT-es • ${manifest.invoices.length} NFs`,
        status: 'criado',
      })
    } catch (err: any) {
      console.error(`Erro ao inserir Romaneio ${manifest.manifestNumber}:`, err)
      details.push({
        cteNumber: manifest.manifestNumber,
        plate: manifest.formattedPlate || manifest.plate,
        sender: manifest.remNome,
        status: 'erro',
        error: err?.message || 'Erro de banco de dados',
      })
    }
  }

  return { created, updated, details }
}
