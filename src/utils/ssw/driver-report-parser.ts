export interface ParsedSswDriver {
  name: string
  cpf: string // 11 dígitos numéricos
  phone: string // Formatado: (XX) 9XXXX-XXXX
  cleanPhone: string // 11 dígitos numéricos
  pin: string // 4 últimos dígitos do CPF
  bondType?: string // C = Contratado/Carreteiro, A = Agregado, F = Frota
}

export interface BlockedSswDriverInfo {
  name: string
  maskedCpf: string
}

export interface Ssw047ParseResult {
  isValidReport: boolean
  isMatricialFormat?: boolean
  totalRecords: number
  validMobileDrivers: ParsedSswDriver[]
  ignoredEmptyPhone: number
  ignoredLandlineOrInvalid: number
  ignoredBlockedCount: number
  blockedDrivers: BlockedSswDriverInfo[]
  duplicateInFileCount: number
}

const SEQUENTIAL_PATTERNS = new Set([
  '12345678',
  '123456789',
  '98765432',
  '987654321',
  '01234567',
  '012345678',
])

/**
 * Classifica e normaliza o telefone extraído do relatório 047 (CSV/Excel) do SSW.
 * Aceita apenas números de celular válidos com DDD (padrão ANATEL para WhatsApp).
 * Rejeita telefones vazios, fixos (iniciados por 2, 3, 4 ou 5) e sequências repetidas/fictícias.
 */
export function classifySswPhone(
  rawDdd: string,
  rawSubscriber: string
): {
  status: 'valid_mobile_9' | 'valid_mobile_8' | 'empty' | 'landline_or_invalid'
  formattedPhone?: string
  cleanPhone?: string
} {
  const ddd = (rawDdd || '').replace(/\D/g, '')
  const sub = (rawSubscriber || '').replace(/\D/g, '')

  if (!ddd && !sub) {
    return { status: 'empty' }
  }

  if (ddd.length !== 2 || !/^[1-9][1-9]$/.test(ddd) || !sub) {
    return { status: sub ? 'landline_or_invalid' : 'empty' }
  }

  // Rejeita números com todos os dígitos iguais (ex: 33333333, 999999999, 25252525),
  // sufixos falsos de preenchimento (ex: 999999000, 999990001) ou sequenciais
  if (
    /^(\d)\1+$/.test(sub) ||
    /^(\d\d)\1+$/.test(sub) ||
    /^9{5,}\d*$/.test(sub) ||
    SEQUENTIAL_PATTERNS.has(sub)
  ) {
    return { status: 'landline_or_invalid' }
  }

  // Caso 1: 9 dígitos no assinante (11 dígitos com DDD) -> Deve iniciar com 9 e segundo dígito entre 6 e 9 (ou móvel válido)
  if (sub.length === 9) {
    if (sub[0] !== '9' || sub[1] === '0') {
      return { status: 'landline_or_invalid' }
    }
    const cleanPhone = `${ddd}${sub}`
    const formattedPhone = `(${ddd}) ${sub.slice(0, 5)}-${sub.slice(5, 9)}`
    return { status: 'valid_mobile_9', formattedPhone, cleanPhone }
  }

  // Caso 2: 8 dígitos no assinante (10 dígitos com DDD no SSW)
  // No Brasil (ANATEL):
  // - Iniciados por 2, 3, 4 ou 5 são TELEFONES FIXOS -> Ignorar
  // - Iniciados por 6, 7, 8 ou 9 são CELULARES cadastrados sem o 9º dígito -> Normalizar com o 9 na frente
  if (sub.length === 8) {
    const firstDigit = sub[0]
    if (['6', '7', '8', '9'].includes(firstDigit)) {
      const normalizedSub = `9${sub}`
      const cleanPhone = `${ddd}${normalizedSub}`
      const formattedPhone = `(${ddd}) ${normalizedSub.slice(0, 5)}-${normalizedSub.slice(5, 9)}`
      return { status: 'valid_mobile_8', formattedPhone, cleanPhone }
    }
    return { status: 'landline_or_invalid' }
  }

  return { status: 'landline_or_invalid' }
}

function maskCpfDigits(cpfDigits: string): string {
  if (cpfDigits.length !== 11) return '***.***.***-**'
  return `***.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-**`
}

/**
 * Faz o parse do arquivo .sswweb / .csv / .txt referente ao relatório
 * "047 - Relação de Motoristas" no formato CSV/Excel do SSW.
 * Se detectar que o usuário enviou o relatório matricial (impressão), sinaliza `isMatricialFormat = true`
 * para orientar o operador a exportar na opção Excel/CSV do SSW.
 */
export function parseSsw047DriversReport(rawText: string): Ssw047ParseResult {
  if (!rawText || typeof rawText !== 'string') {
    return {
      isValidReport: false,
      totalRecords: 0,
      validMobileDrivers: [],
      ignoredEmptyPhone: 0,
      ignoredLandlineOrInvalid: 0,
      ignoredBlockedCount: 0,
      blockedDrivers: [],
      duplicateInFileCount: 0,
    }
  }

  const lines = rawText.split(/\r?\n/)

  // Detecta se o arquivo enviado é o formato Matricial de impressão (ssw0067) em vez do CSV/Excel
  const isMatricial =
    rawText.includes('ssw0067') ||
    (rawText.includes('RELACAO DE MOTORISTAS') && rawText.includes('NOME MOTORISTA') && !rawText.includes('0;CPF;Nome;'))

  if (isMatricial) {
    return {
      isValidReport: false,
      isMatricialFormat: true,
      totalRecords: 0,
      validMobileDrivers: [],
      ignoredEmptyPhone: 0,
      ignoredLandlineOrInvalid: 0,
      ignoredBlockedCount: 0,
      blockedDrivers: [],
      duplicateInFileCount: 0,
    }
  }

  // Verifica assinatura do cabeçalho CSV do relatório 047 do SSW
  const firstNonEmptyLine = lines.find((l) => l.trim().length > 0) || ''
  const isCsv047 =
    firstNonEmptyLine.startsWith('0;CPF;Nome;') ||
    firstNonEmptyLine.toLowerCase().includes(';cpf;nome;') ||
    lines.some((l) => l.startsWith('0;CPF;Nome;'))

  if (!isCsv047) {
    return {
      isValidReport: false,
      isMatricialFormat: false,
      totalRecords: 0,
      validMobileDrivers: [],
      ignoredEmptyPhone: 0,
      ignoredLandlineOrInvalid: 0,
      ignoredBlockedCount: 0,
      blockedDrivers: [],
      duplicateInFileCount: 0,
    }
  }

  let totalRecords = 0
  let ignoredEmptyPhone = 0
  let ignoredLandlineOrInvalid = 0
  let ignoredBlockedCount = 0
  let duplicateInFileCount = 0
  const blockedDrivers: BlockedSswDriverInfo[] = []
  const driversByCpf = new Map<string, ParsedSswDriver>()

  // Índices padrão do layout CSV SSW 047:
  // 0: Tipo registro ('0' header, '1' dados, '9' trailer)
  // 1: CPF | 2: Nome
  // 10: DDD_Fone_Residencial | 11: Fone_Residencial
  // 12: DDD_Celular | 13: Celular
  // 14: DDD_Fone_Pessoal_1 | 15: Fone_Pessoal_1
  // 34: Bloqueado ('S' ou 'N')
  // 47: DDD_Fone_Pessoal_2 | 48: Fone_Pessoal_2
  // 55: Relacao_com_Transportadora ('C', 'A', 'F')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('0;') || line.startsWith('9;')) continue
    if (!line.startsWith('1;')) continue

    const cols = line.split(';')
    if (cols.length < 16) continue

    const rawCpf = (cols[1] || '').replace(/\D/g, '')
    const cpfDigits = rawCpf.length >= 9 && rawCpf.length <= 11 ? rawCpf.padStart(11, '0') : rawCpf
    if (cpfDigits.length !== 11) continue

    const name = (cols[2] || '').replace(/\s+/g, ' ').trim()
    if (name.length < 3) continue

    totalRecords += 1

    // Verifica se o motorista está marcado como Bloqueado = S no SSW (coluna 34)
    const bloqueadoFlag = (cols[34] || '').trim().toUpperCase()
    if (bloqueadoFlag === 'S') {
      ignoredBlockedCount += 1
      if (blockedDrivers.length < 100) {
        blockedDrivers.push({
          name,
          maskedCpf: maskCpfDigits(cpfDigits),
        })
      }
      continue
    }

    // Avalia os campos de telefone celular disponíveis priorizando Celular principal (9 dígitos)
    // e usando Fone_Pessoal_1 / Fone_Pessoal_2 como fallback caso o principal esteja vazio ou com 8 dígitos
    const candidates = [
      classifySswPhone(cols[12] || '', cols[13] || ''), // DDD_Celular + Celular
      classifySswPhone(cols[14] || '', cols[15] || ''), // DDD_Fone_Pessoal_1 + Fone_Pessoal_1
      classifySswPhone(cols[47] || '', cols[48] || ''), // DDD_Fone_Pessoal_2 + Fone_Pessoal_2
    ]

    // Prioridade 1: Celular de 9 dígitos (valid_mobile_9)
    // Prioridade 2: Celular de 8 dígitos normalizado (valid_mobile_8)
    const bestMobile =
      candidates.find((c) => c.status === 'valid_mobile_9') ||
      candidates.find((c) => c.status === 'valid_mobile_8')

    if (!bestMobile || !bestMobile.formattedPhone || !bestMobile.cleanPhone) {
      // Verifica se ao menos tinha algum telefone preenchido (ex: fixo residencial na col 10/11 ou candidato inválido)
      const resDdd = (cols[10] || '').replace(/\D/g, '')
      const resSub = (cols[11] || '').replace(/\D/g, '')
      const hadAnyPhoneInput =
        Boolean(resDdd || resSub) || candidates.some((c) => c.status === 'landline_or_invalid')

      if (hadAnyPhoneInput) {
        ignoredLandlineOrInvalid += 1
      } else {
        ignoredEmptyPhone += 1
      }
      continue
    }

    const pin = cpfDigits.slice(-4)
    const bondType = (cols[55] || '').trim().toUpperCase() || undefined

    if (driversByCpf.has(cpfDigits)) {
      duplicateInFileCount += 1
    }

    driversByCpf.set(cpfDigits, {
      name,
      cpf: cpfDigits,
      phone: bestMobile.formattedPhone,
      cleanPhone: bestMobile.cleanPhone,
      pin,
      bondType,
    })
  }

  return {
    isValidReport: totalRecords > 0,
    isMatricialFormat: false,
    totalRecords,
    validMobileDrivers: Array.from(driversByCpf.values()),
    ignoredEmptyPhone,
    ignoredLandlineOrInvalid,
    ignoredBlockedCount,
    blockedDrivers,
    duplicateInFileCount,
  }
}
