export interface ParsedCTeData {
  chCTe: string
  nCT: string
  serie?: string
  dhEmi?: string
  emitCnpj?: string
  emitNome?: string
  remCnpj?: string
  remNome?: string
  remEndereco?: string
  remCidade?: string
  remUf?: string
  remTelefone?: string
  destCnpj?: string
  destNome?: string
  destEndereco?: string
  destCidade?: string
  destUf?: string
  destTelefone?: string
  vFrete?: number
  invoices: string[]
  placa?: string
}

export interface SefazSyncResult {
  sucesso: boolean
  mensagem: string
  novasViagens: number
  documentosProcessados: number
  ultimoNsu: string
  maxNsu: string
  detalhes?: Array<{
    cteNumber: string
    destinatario: string
    cidade: string
    status: 'criada' | 'existente' | 'erro'
  }>
}
