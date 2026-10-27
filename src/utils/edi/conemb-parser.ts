import pg from 'pg'
import crypto from 'crypto'

export interface ParsedEdiCte {
  nCT: string
  serie: string
  filial?: string
  chCTe: string
  placa: string
  formattedPlate: string
  issueDate?: string
  weightKg?: number
  vFrete?: number
  invoices: string[]
  remNome?: string
  remCnpj?: string
  remEndereco?: string
  remBairro?: string
  remCidade?: string
  remUf?: string
  remTelefone?: string
  destCnpj?: string
}

export interface ParsedEdiConemb {
  isConemb: boolean
  transportadora?: string
  cnpjTransportadora?: string
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
 * Parser para layout EDI PROCEDA CONEMB 5.0 (Conhecimentos Embarcados no Manifesto/Romaneio)
 */
export function parseProcedaConemb(ediText: string): ParsedEdiConemb {
  const lines = ediText.split(/\r?\n/).filter((l) => l.trim().length > 0)

  // Verifica assinatura de header PROCEDA (000) e lote de conhecimentos (520)
  const has000 = lines.some((l) => l.startsWith('000'))
  const has520 = lines.some((l) => l.startsWith('520'))

  if (!has000 && !has520) {
    return { isConemb: false, totalCtes: 0, ctes: [] }
  }

  let transportadora = ''
  let cnpjTransportadora = ''
  const ctes: ParsedEdiCte[] = []
  let currentCte: ParsedEdiCte | null = null

  for (const line of lines) {
    const regType = line.slice(0, 3)

    if (regType === '000') {
      transportadora = line.slice(3, 38).trim()
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

      // Chave do CT-e (44 dígitos contíguos na linha)
      const chCTeMatch = line.match(/\b(\d{44})\b/)
      const chCTe = chCTeMatch ? chCTeMatch[1] : ''

      // Extração de Placa: Procura padrão Mercosul (ABC1D23) ou Antigo (ABC1234), com ou sem UF na frente (SPEWU2108)
      let placa = ''
      const ufPlateMatch = line.match(/\b[A-Z]{2}([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})\b/)
      if (ufPlateMatch) {
        placa = ufPlateMatch[1]
      } else {
        const directPlateMatch = line.match(/\b([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})\b/)
        if (directPlateMatch) {
          placa = directPlateMatch[1]
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
        remCnpj: remCnpj && remCnpj !== '00000000000000' ? remCnpj : undefined,
        destCnpj: destCnpj && destCnpj !== '00000000000000' ? destCnpj : undefined,
        invoices: [],
      }
    } else if (regType === '523' && currentCte) {
      // Registro 523: Totais do Conhecimento (Volumes, Pesos e Frete)
      // Posição 9-20: Peso bruto (com 2 ou 3 casas decimais implícitas)
      const pesoRaw = line.slice(9, 20).trim()
      if (pesoRaw && !isNaN(Number(pesoRaw))) {
        currentCte.weightKg = parseFloat(pesoRaw) / 100
      }

      // Posição 40-55: Valor do Frete (15 dígitos com 2 decimais implícitos)
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
      // Registro 527: Dados Cadastrais do Embarcador / Remetente
      currentCte.remNome = line.slice(3, 63).trim()
      const cnpjEmbarcador = line.slice(63, 77).trim()
      if (cnpjEmbarcador && cnpjEmbarcador !== '00000000000000') {
        currentCte.remCnpj = cnpjEmbarcador
      }
      currentCte.remEndereco = line.slice(92, 152).trim()
      currentCte.remBairro = line.slice(152, 187).trim()
      currentCte.remCidade = line.slice(187, 222).trim()
      currentCte.remUf = line.slice(238, 244).trim()
      currentCte.remTelefone = line.slice(245).trim()
    }
  }

  if (currentCte) {
    ctes.push(currentCte)
  }

  return {
    isConemb: true,
    transportadora,
    cnpjTransportadora,
    totalCtes: ctes.length,
    ctes,
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

  for (const cte of parsedEdi.ctes) {
    try {
      // 1. Verifica duplicidade por Chave ou Número do CT-e
      const existingRes = await dbClient.query(
        `SELECT id, sefaz_metadata FROM trips 
         WHERE (cte_key = $1 OR cte_number = $2) AND organization_id = $3 LIMIT 1`,
        [cte.chCTe, cte.nCT, orgId]
      )

      // Vinculação de Motorista pela Placa
      let matchedDriverId: string | null = null
      let matchedDriverName: string | null = null

      if (cte.placa) {
        const cleanPlaca = cte.placa.replace(/[-\s]/g, '').toUpperCase()
        const foundDriver = drivers.find(
          (d) => (d.default_plate || '').replace(/[-\s]/g, '').toUpperCase() === cleanPlaca
        )
        if (foundDriver) {
          matchedDriverId = foundDriver.id
          matchedDriverName = foundDriver.name
        }
      }

      // Se não encontrou motorista específico para a placa, usa o primeiro motorista ativo
      if (!matchedDriverId && drivers.length > 0) {
        matchedDriverId = drivers[0].id
        matchedDriverName = drivers[0].name
      }

      const destCity = cte.remCidade ? `${cte.remCidade}/${cte.remUf || 'SP'}` : 'Destino'
      const sefazMetadata = {
        weight_kg: cte.weightKg ?? null,
        cargo_value: null,
        cargo_type: 'Carga Embarcada (Manifesto SSW)',
        freight_value: cte.vFrete ?? null,
        rntrc: null,
        observations: `Importado via EDI CONEMB SSW. Placa: ${cte.formattedPlate || cte.placa}`,
        plate: cte.formattedPlate || cte.placa || null,
        emitter_cnpj: parsedEdi.cnpjTransportadora || null,
        emitter_name: parsedEdi.transportadora || null,
        issue_date: cte.issueDate || null,
        serie: cte.serie || null,
        origin_city: cte.remCidade && cte.remUf ? `${cte.remCidade}/${cte.remUf}` : null,
        destination_city: destCity,
        source: 'edi_conemb_ssw',
      }

      if (existingRes.rows.length > 0) {
        // Viagem existente: atualiza metadados com a placa e dados do manifesto caso não tenha
        await dbClient.query(
          `UPDATE trips 
           SET sefaz_metadata = $1,
               driver_id = COALESCE(driver_id, $2)
           WHERE id = $3`,
          [JSON.stringify(sefazMetadata), matchedDriverId, existingRes.rows[0].id]
        )
        updated++
        details.push({
          cteNumber: cte.nCT,
          plate: cte.formattedPlate || cte.placa,
          driverName: matchedDriverName || undefined,
          sender: cte.remNome,
          status: 'existente',
        })
        continue
      }

      // 2. Localiza ou Cria Remetente (Senders)
      let senderId: string | null = null
      if (cte.remCnpj) {
        const cleanCnpj = cte.remCnpj.replace(/\D/g, '')
        const senderRes = await dbClient.query(
          `SELECT id FROM senders 
           WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 
             AND organization_id = $2 LIMIT 1`,
          [cleanCnpj, orgId]
        )

        if (senderRes.rows.length > 0) {
          senderId = senderRes.rows[0].id
        } else {
          const newSender = await dbClient.query(
            `INSERT INTO senders (name, cnpj, address, city, phone, organization_id, company_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              cte.remNome || 'Remetente EDI',
              cte.remCnpj,
              cte.remEndereco || null,
              cte.remCidade || null,
              cte.remTelefone || null,
              orgId,
              companyId,
            ]
          )
          senderId = newSender.rows[0]?.id || null
        }
      }

      // 3. Destinatário estruturado
      const recipientsArray = [
        {
          name: cte.destCnpj ? `Destinatário (CNPJ ${cte.destCnpj})` : 'Destinatário',
          destination: destCity,
          invoices: cte.invoices.join(', '),
        },
      ]

      const tripToken = crypto.randomBytes(4).toString('hex').toUpperCase()

      // 4. Insere a nova viagem com a Placa e o Motorista vinculado
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
          destCity,
          cte.invoices,
          tripToken,
          cte.nCT,
          cte.chCTe,
          cte.remNome || 'Remetente EDI',
          senderId,
          JSON.stringify(recipientsArray),
          orgId,
          JSON.stringify(sefazMetadata),
        ]
      )

      created++
      details.push({
        cteNumber: cte.nCT,
        plate: cte.formattedPlate || cte.placa,
        driverName: matchedDriverName || undefined,
        sender: cte.remNome,
        status: 'criado',
      })
    } catch (err: any) {
      console.error(`Erro ao inserir CT-e ${cte.nCT} do EDI:`, err)
      details.push({
        cteNumber: cte.nCT,
        plate: cte.formattedPlate || cte.placa,
        sender: cte.remNome,
        status: 'erro',
        error: err?.message || 'Erro de banco de dados',
      })
    }
  }

  return { created, updated, details }
}
