import { NextRequest, NextResponse } from 'next/server'
import { processSSWManifesto } from '@/utils/ssw/manifesto-service'
import { SSWManifestoPayload } from '@/utils/ssw/types'

export const dynamic = 'force-dynamic'

/**
 * GET: Healthcheck e verificação de conectividade do Webhook SSW
 */
export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'AuditCargo - SSW EDI ssw2498 Webhook Ingestion',
    timestamp: new Date().toISOString(),
  })
}

/**
 * POST: Endpoint receptor do EDI Webservice Envio Manifesto Parceiro (ssw2498)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validação de Autenticação / Segurança
    const expectedSecret = process.env.SSW_WEBHOOK_SECRET
    if (expectedSecret) {
      const authHeader = request.headers.get('authorization')
      const customToken = request.headers.get('x-ssw-token')
      const urlToken = request.nextUrl.searchParams.get('token')

      const providedToken =
        authHeader?.replace(/^Bearer\s+/i, '') || customToken || urlToken

      if (providedToken !== expectedSecret) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: 'Não autorizado: Token do Webhook SSW inválido ou ausente.',
            protocolo: '',
          },
          { status: 401 }
        )
      }
    }

    // 2. Extração do Payload
    let payload: SSWManifestoPayload
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Requisição inválida: O corpo deve ser um JSON válido.',
          protocolo: '',
        },
        { status: 400 }
      )
    }

    // Permite especificar explicitamente a organização via query param se necessário (?orgId=...)
    const explicitOrgId = request.nextUrl.searchParams.get('orgId') || undefined

    // 3. Processamento e Ingestão no Banco de Dados
    const result = await processSSWManifesto(payload, explicitOrgId)

    // SSW espera resposta HTTP 200 com JSON { sucesso, mensagem, protocolo }
    return NextResponse.json(result, {
      status: result.sucesso ? 200 : 400,
    })
  } catch (error: any) {
    console.error('❌ [API SSW Manifesto] Erro inesperado:', error)
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: `Erro no servidor: ${error.message || 'Falha desconhecida'}`,
        protocolo: '',
      },
      { status: 500 }
    )
  }
}
