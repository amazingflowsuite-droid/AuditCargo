/**
 * Utilitário para análise e extração de dados do relatório SSW "Relação de Clientes"
 * Suporta formatos CSV delimitados por ponto-e-vírgula (.csv, .sswweb, .txt).
 */

export interface SswParsedClient {
  name: string
  cnpj: string
  formattedCnpj: string
  ie: string | null
  address: string
  street: string
  number: string
  complement: string
  neighborhood: string
  rawCity: string
  uf: string
  city: string
  zipCode: string
  phone: string | null
  email: string | null
  curvaAbc: string | null
  tipo: string | null
  hasColeta: boolean
  cepColeta: string | null
  enderecoColeta: string | null
  cnpjExpedidor: string | null
  hasAppointmentRule: boolean
  suggestedRole: 'sender' | 'recipient' | 'both'
  bancoCobr: string | null
}

export interface SswClientReportParseResult {
  totalRecords: number
  validClients: SswParsedClient[]
  sendersCount: number
  recipientsCount: number
  hasAppointmentCount: number
  ignoredInvalid: number
}

function cleanDigits(val?: string | null): string {
  return String(val || '').replace(/\D/g, '')
}

function formatCnpjCpf(digits: string): string {
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return digits
}

function formatZipCode(digits: string): string {
  const clean = cleanDigits(digits)
  if (clean.length === 8) {
    return clean.replace(/^(\d{5})(\d{3})$/, '$1-$2')
  }
  return clean
}

function formatPhone(rawPhone?: string | null): string | null {
  const digits = cleanDigits(rawPhone)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return null
}

function extractPrimaryEmail(raw?: string | null): string | null {
  if (!raw) return null
  const candidates = raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const candidate of candidates) {
    if (emailRegex.test(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Faz a análise do relatório de clientes do SSW (separado por ';')
 */
export function parseSswClientReport(fileContent: string): SswClientReportParseResult {
  const lines = fileContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  let headerIndex = -1
  let colMap: Record<string, number> = {}

  // Procura a linha de cabeçalho que contém 'CLIENTE' e 'CNPJ'
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const row = lines[i]
    if (row.includes('CLIENTE') && (row.includes('CNPJ') || row.includes('CNPJ/CPF'))) {
      headerIndex = i
      const headers = row.split(';').map((h) => h.trim().toUpperCase())
      headers.forEach((col, idx) => {
        colMap[col] = idx
      })
      break
    }
  }

  if (headerIndex === -1) {
    return {
      totalRecords: 0,
      validClients: [],
      sendersCount: 0,
      recipientsCount: 0,
      hasAppointmentCount: 0,
      ignoredInvalid: 0,
    }
  }

  // Helpers para busca tolerante de colunas
  const getCol = (cols: string[], ...names: string[]): string => {
    for (const name of names) {
      if (colMap[name] !== undefined && cols[colMap[name]] !== undefined) {
        return cols[colMap[name]].trim()
      }
    }
    return ''
  }

  const validClients: SswParsedClient[] = []
  let ignoredInvalid = 0
  const seenCnpjs = new Set<string>()

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i]
    if (!rawLine || !rawLine.includes(';')) continue

    const cols = rawLine.split(';')
    const name = getCol(cols, 'CLIENTE')
    const rawCnpj = getCol(cols, 'CNPJ/CPF', 'CNPJ', 'CPF')
    const cleanCnpj = cleanDigits(rawCnpj)

    // Rejeita linhas sem nome ou sem documento com ao menos 11 dígitos
    if (!name || name.length < 3 || (cleanCnpj.length !== 11 && cleanCnpj.length !== 14)) {
      ignoredInvalid++
      continue
    }

    if (seenCnpjs.has(cleanCnpj)) {
      continue
    }
    seenCnpjs.add(cleanCnpj)

    const rawTipo = cols[0]?.trim().toUpperCase() || ''
    const curvaAbc = getCol(cols, 'CURVA ABC') || null
    const street = getCol(cols, 'ENDERECO')
    const number = getCol(cols, 'NUMERO')
    const complement = getCol(cols, 'COMPLEMENTO')
    const neighborhood = getCol(cols, 'BAIRRO')
    const rawCity = getCol(cols, 'CIDADE')
    const uf = getCol(cols, 'UF').toUpperCase()
    const zipCode = formatZipCode(getCol(cols, 'CEP'))

    // Monta endereço formatado
    const addressParts: string[] = []
    if (street) {
      let streetWithNum = street
      if (number && number !== '0' && number.toUpperCase() !== 'SN') {
        streetWithNum += `, ${number}`
      }
      addressParts.push(streetWithNum)
    }
    if (complement) {
      addressParts.push(complement)
    }
    if (neighborhood) {
      addressParts.push(neighborhood)
    }
    const fullAddress = addressParts.join(' - ')

    // Cidade / UF
    const cityWithUf = rawCity ? (uf ? `${rawCity} / ${uf}` : rawCity) : ''

    // Inscrição Estadual
    const rawIe = getCol(cols, 'INSCR')
    const ie = rawIe && rawIe.toUpperCase() !== 'ISENTO' ? rawIe.replace(/[^\w]/g, '') : null

    // Telefone / Celular
    const rawCelular = getCol(cols, 'CELULAR')
    const rawFone = getCol(cols, 'FONE')
    const phone = formatPhone(rawCelular) || formatPhone(rawFone)

    // E-mail (Prioriza envio de CT-e/XML, depois email geral, depois cobrança)
    const rawEmailCte = getCol(cols, 'EMAIL DE ENVIO DO CT-E E XML')
    const rawEmail = getCol(cols, 'EMAIL')
    const rawEmailCobranca = getCol(cols, 'EMAIL COBRANCA')
    const email =
      extractPrimaryEmail(rawEmailCte) ||
      extractPrimaryEmail(rawEmail) ||
      extractPrimaryEmail(rawEmailCobranca)

    // Dados de coleta e expedição (pista forte de Remetente)
    const rawCepColeta = cleanDigits(getCol(cols, 'CEP COLETA'))
    const hasColeta = rawCepColeta.length === 8 && rawCepColeta !== '00000000'
    const cepColeta = hasColeta ? formatZipCode(rawCepColeta) : null
    const enderecoColeta = getCol(cols, 'ENDERECO COLETA') || null
    const rawCnpjExpedidor = cleanDigits(getCol(cols, 'CNPJ EXPEDIDOR'))
    const cnpjExpedidor = rawCnpjExpedidor.length >= 11 ? formatCnpjCpf(rawCnpjExpedidor) : null

    // Agendamento obrigatório (pista forte de Destinatário / Supermercado / CD)
    const rawAgendamento = getCol(cols, 'AGENDAMENTO OBRIGATORIO').toUpperCase()
    const hasAppointmentRule = rawAgendamento === 'S' || rawAgendamento === 'SIM'

    const bancoCobr = getCol(cols, 'BCO COBR') || null

    // Classificação inteligente de papel
    const isLikelySender =
      hasColeta ||
      (curvaAbc && ['A', 'B', 'C'].includes(curvaAbc.toUpperCase())) ||
      rawTipo === 'I' ||
      Boolean(cnpjExpedidor)

    const isLikelyRecipient =
      hasAppointmentRule ||
      !hasColeta ||
      bancoCobr === '999' ||
      bancoCobr === '000' ||
      rawTipo === 'C' ||
      rawTipo === 'N'

    let suggestedRole: 'sender' | 'recipient' | 'both' = 'recipient'
    if (isLikelySender && !hasAppointmentRule) {
      suggestedRole = 'sender'
    } else if (isLikelySender && hasAppointmentRule) {
      suggestedRole = 'both'
    } else {
      suggestedRole = 'recipient'
    }

    validClients.push({
      name,
      cnpj: cleanCnpj,
      formattedCnpj: formatCnpjCpf(cleanCnpj),
      ie,
      address: fullAddress,
      street,
      number,
      complement,
      neighborhood,
      rawCity,
      uf,
      city: cityWithUf,
      zipCode,
      phone,
      email,
      curvaAbc: curvaAbc ? curvaAbc.toUpperCase() : null,
      tipo: rawTipo || null,
      hasColeta,
      cepColeta,
      enderecoColeta,
      cnpjExpedidor,
      hasAppointmentRule,
      suggestedRole,
      bancoCobr,
    })
  }

  const sendersCount = validClients.filter((c) => c.suggestedRole === 'sender' || c.suggestedRole === 'both').length
  const recipientsCount = validClients.filter((c) => c.suggestedRole === 'recipient' || c.suggestedRole === 'both').length
  const hasAppointmentCount = validClients.filter((c) => c.hasAppointmentRule).length

  return {
    totalRecords: lines.length - (headerIndex + 1),
    validClients,
    sendersCount,
    recipientsCount,
    hasAppointmentCount,
    ignoredInvalid,
  }
}

