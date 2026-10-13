export interface SSWEndereco {
  rua?: string
  numero?: number | string
  complemento?: string
  bairro?: string
  cep?: number | string
}

export interface SSWParty {
  nome: string
  inscricaoEst?: string
  cpfCNPJ: string
  endereco?: SSWEndereco
  telefone?: string
  celular?: string
}

export interface SSWNotaFiscal {
  serieNFe?: string
  nroNFe: number | string
  chaveNFe?: string
  dataEmissao?: string
  pedido?: string
  pesoReal?: number
  cubagem?: number
  valorMerc?: number
  qtdeVolumes?: number
  volumes?: string[]
}

export interface SSWCTe {
  ctrcSSW: string
  serieCTe?: string
  nroCTe: number
  chaveCTe?: string
  dataEmissao?: string
  dataPrevEnt?: string
  obs?: string
  pesoReal?: number
  cubagem?: number
  pesoCalculo?: number
  valorMerc?: number
  valorFrete?: number
  cidadeOrigem: string
  ufOrigem: string
  ibgeOrigem?: number
  cidadeDestino: string
  ufDestino: string
  ibgeDestino?: number
  cfop?: number
  emitente?: SSWParty
  remetente: SSWParty
  destinatario: SSWParty
  expedidor?: SSWParty
  recebedor?: SSWParty
  pagador?: SSWParty
  notasFiscais: SSWNotaFiscal[]
}

export interface SSWMotorista {
  cpf: string
  nome: string
}

export interface SSWManifestoPayload {
  manifestoSSW: string
  chaveManifestoSSW?: string
  serieMDFe?: string
  nroMDFe?: number
  chaveMDFe?: string
  dataEmissao?: string
  dataPrevCheg?: string
  placa: string
  placaCarreta?: string
  motorista: SSWMotorista
  ctes: SSWCTe[]
}

export interface SSWWebhookResponse {
  sucesso: boolean
  mensagem: string
  protocolo: string
}
