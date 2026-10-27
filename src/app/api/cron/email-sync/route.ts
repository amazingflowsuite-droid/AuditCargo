import { NextResponse } from 'next/server'
import { syncCteEmailsFromMailbox } from '@/utils/email/email-xml-sync'

export const dynamic = 'force-dynamic'

/**
 * Endpoint de sincronização automática de e-mails do SSW (Hostinger IMAP).
 * Pode ser chamado por um cronjob agendado (ex: a cada 5 ou 10 minutos)
 * ou webhook.
 * 
 * Exemplo de chamada:
 * GET /api/cron/email-sync
 * Headers opcionais: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const result = await syncCteEmailsFromMailbox()

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (err: any) {
    console.error('Erro na rota de cron de e-mail:', err)
    return NextResponse.json(
      { error: err?.message || 'Falha ao processar e-mails' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
