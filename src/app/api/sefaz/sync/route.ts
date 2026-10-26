import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/auth'
import { syncSefazDocuments } from '@/utils/sefaz/sync-service'
import { getDbPool } from '@/utils/db'

export const dynamic = 'force-dynamic'

/**
 * GET: Retorna o status atual da sincronização da SEFAZ
 */
export async function GET() {
  try {
    const pool = getDbPool()
    const result = await pool.query(
      `SELECT organization_id, cnpj, last_nsu, max_nsu, status, last_sync_at, error_message, updated_at
       FROM sefaz_sync_state
       ORDER BY updated_at DESC
       LIMIT 5`
    )

    return NextResponse.json({
      status: 'online',
      service: 'AuditCargo - SEFAZ DFe Synchronization Service',
      syncStates: result.rows,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: err.message || 'Erro ao consultar status da sincronização SEFAZ',
      },
      { status: 500 }
    )
  }
}

/**
 * POST: Dispara a sincronização de documentos (CT-e) junto à SEFAZ
 * Pode ser chamado:
 * 1. Pelo Painel do Usuário (requer sessão ativa)
 * 2. Por Cron Job / Vercel Cron / Webhook (requer Bearer token com SEFAZ_SYNC_SECRET ou CRON_SECRET)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verificação de Autenticação
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    const secret = process.env.SEFAZ_SYNC_SECRET || process.env.CRON_SECRET

    const isSecretAuthorized = secret && token === secret

    let orgId: string | undefined

    if (!isSecretAuthorized) {
      // Verifica sessão de usuário logado
      const user = await getCurrentUser()
      if (!user) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: 'Não autorizado: É necessário estar autenticado ou fornecer token de cron válido.',
          },
          { status: 401 }
        )
      }
      orgId = user.organization_id
    }

    // Se fornecido via query param ou body, respeita se autorizado
    const urlOrgId = request.nextUrl.searchParams.get('orgId')
    if (urlOrgId) {
      orgId = urlOrgId
    }

    // 2. Executa a sincronização
    console.log(`🚀 [API /api/sefaz/sync] Iniciando sincronização para Org: ${orgId || 'Auto'}...`)
    const result = await syncSefazDocuments(orgId)

    return NextResponse.json(result, {
      status: result.sucesso ? 200 : 502,
    })
  } catch (err: any) {
    console.error('❌ [API /api/sefaz/sync] Erro inesperado:', err)
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: `Erro interno no servidor: ${err.message || 'Erro desconhecido'}`,
        novasViagens: 0,
        documentosProcessados: 0,
        ultimoNsu: '0',
        maxNsu: '0',
      },
      { status: 500 }
    )
  }
}
