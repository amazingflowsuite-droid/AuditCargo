'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Inbox,
  X,
  Wrench,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'
import { syncCteEmailsAction } from '@/app/actions'
import { EmailSyncResult, SswSyncHealth } from '@/utils/email/email-xml-sync'

interface SyncEmailCteButtonProps {
  initialHealth?: SswSyncHealth | null
}

export function SyncEmailCteButton({ initialHealth }: SyncEmailCteButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [lastResult, setLastResult] = useState<EmailSyncResult | null>(null)
  const [health, setHealth] = useState<SswSyncHealth | null>(initialHealth || null)

  const handleSync = async () => {
    setIsLoading(true)
    try {
      const res = await syncCteEmailsAction()
      setLastResult(res)
      if (res.health) {
        setHealth(res.health)
      } else {
        setHealth({
          lastSyncAt: new Date().toISOString(),
          status: res.success ? 'healthy' : 'error',
          emailAccount: health?.emailAccount || 'infoweb@ccargo.com.br',
          totalEmailsChecked: res.totalEmailsChecked,
          tripsCreated: res.tripsCreated,
          tripsUpdated: res.tripsUpdated,
          error: res.error,
          diagnostic: res.diagnostic || null,
        })
      }
      setIsOpen(true)
    } catch (err: any) {
      const fallbackError = err?.message || 'Erro inesperado ao consultar caixa de e-mail.'
      const errDiag = {
        code: 'UNKNOWN_ERROR' as const,
        title: 'Falha na Comunicação com Servidor de E-mail',
        cause: fallbackError,
        resolution:
          'Verifique sua conexão ou tente novamente em instantes. Para liberar viagens imediatamente, importe o arquivo EDI em "Novo Transporte".',
      }
      setLastResult({
        success: false,
        totalEmailsChecked: 0,
        ctesProcessed: 0,
        tripsCreated: 0,
        tripsUpdated: 0,
        details: [],
        error: fallbackError,
        diagnostic: errDiag,
      })
      setHealth({
        lastSyncAt: new Date().toISOString(),
        status: 'error',
        emailAccount: health?.emailAccount || 'infoweb@ccargo.com.br',
        error: fallbackError,
        diagnostic: errDiag,
      })
      setIsOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const formatSyncTimestamp = (iso: string | null | undefined) => {
    if (!iso) return 'Aguardando 1ª execução'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return 'Aguardando 1ª execução'
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  const hasError = health?.status === 'error'
  const hasWarning = health?.status === 'warning'
  const activeDiagnostic = lastResult?.diagnostic || health?.diagnostic

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Indicador de Saúde da Sincronização SSW */}
        <button
          type="button"
          onClick={() => {
            if (hasError || hasWarning || lastResult) {
              setIsOpen(true)
            } else {
              handleSync()
            }
          }}
          className={`flex items-center gap-2 h-11 px-3 rounded-[6px] border text-left transition-all cursor-pointer ${
            hasError
              ? 'bg-red-50 border-red-300 text-red-900 hover:bg-red-100/80'
              : hasWarning
              ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/80'
              : 'bg-[#FAFAF9] border-[#E7E5E4] text-[#57534E] hover:border-[#0D9488]/40'
          }`}
          title={
            hasError
              ? `Falha detectada no e-mail SSW: ${health?.diagnostic?.title || health?.error}. Clique para ver o diagnóstico.`
              : `Integração SSW (${health?.emailAccount || 'infoweb@ccargo.com.br'})`
          }
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {hasError ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
              </>
            ) : hasWarning ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </>
            ) : health?.lastSyncAt ? (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-stone-400" />
            )}
          </span>

          <div className="leading-tight">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1">
              {hasError ? (
                <span className="text-red-700">Alerta SSW (E-mail)</span>
              ) : hasWarning ? (
                <span className="text-amber-800">Atenção Caixa SSW</span>
              ) : (
                <span className="text-[#1C1917]">Status SSW (E-mail)</span>
              )}
            </div>
            <div className="text-[11px] font-mono">
              {hasError ? (
                <span className="text-red-700 underline font-semibold">
                  {health?.diagnostic?.title || 'Ver erro de conexão'}
                </span>
              ) : (
                <span>Última sinc: {formatSyncTimestamp(health?.lastSyncAt)}</span>
              )}
            </div>
          </div>
        </button>

        {/* Botão de Disparo Manual de Sincronização */}
        <Button
          variant="outline"
          onClick={handleSync}
          disabled={isLoading}
          className="gap-2 h-11 px-4 border-[#0D9488]/30 hover:border-[#0D9488] bg-white text-stone-800 shadow-2xs transition-all hover:bg-teal-50/50"
          title="Verificar caixa de e-mails infoweb@ccargo.com.br agora para novos EDIs e CT-es do SSW"
        >
          {isLoading ? (
            <RefreshCw className="w-4 h-4 text-[#0D9488] animate-spin" />
          ) : (
            <Mail className="w-4 h-4 text-[#0D9488]" />
          )}
          <span className="font-medium text-xs sm:text-sm">
            {isLoading ? 'Checando E-mails...' : 'Sincronizar SSW (E-mail)'}
          </span>
        </Button>
      </div>

      {/* MODAL COM DETALHES E DIAGNÓSTICO DE SAÚDE DA SINCRONIZAÇÃO */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-[12px] border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-[8px] ${
                    hasError && !lastResult?.success
                      ? 'bg-red-100 text-red-700'
                      : 'bg-teal-100 text-[#0D9488]'
                  }`}
                >
                  {hasError && !lastResult?.success ? (
                    <ShieldAlert className="w-4 h-4" />
                  ) : (
                    <Inbox className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 font-mono">
                    Sincronização SSW &bull; E-mail
                  </h3>
                  <p className="text-[11px] text-stone-500 font-mono">
                    {health?.emailAccount || 'infoweb@ccargo.com.br'} (Hostinger IMAP)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Linha de Última Execução */}
              <div className="flex items-center justify-between px-3 py-2 bg-stone-50 border border-stone-200 rounded-[6px] font-mono text-[11px] text-stone-600">
                <span>Última verificação registrada:</span>
                <strong className="text-stone-900">{formatSyncTimestamp(health?.lastSyncAt)}</strong>
              </div>

              {/* Bloco de Diagnóstico Preventivo ou de Falha (Mitigação de Suporte) */}
              {activeDiagnostic && (
                <div
                  className={`p-4 rounded-[8px] border space-y-2.5 ${
                    activeDiagnostic.code === 'QUOTA_WARNING'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-red-50 border-red-200 text-red-950'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {activeDiagnostic.code === 'QUOTA_WARNING' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm">
                        {activeDiagnostic.title}
                      </h4>
                      <p className="text-[11px] mt-1 leading-relaxed opacity-90">
                        <strong>O que aconteceu:</strong> {activeDiagnostic.cause}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-white/90 rounded-[6px] border border-stone-200/80 space-y-1.5 text-stone-800">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-[#0D9488]">
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Como resolver sem precisar de suporte:</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-stone-700">
                      {activeDiagnostic.resolution}
                    </p>
                  </div>

                  <div className="pt-1 flex items-center justify-end">
                    <Link
                      href="/novo-transporte"
                      onClick={() => setIsOpen(false)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0D9488] hover:underline"
                    >
                      <span>Contingência: Importar arquivo EDI manualmente em Novo Transporte</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}

              {/* Resultado da Sincronização Bem-Sucedida */}
              {(lastResult?.success || (!lastResult && health?.status === 'healthy')) && (
                <>
                  {/* Resumo em Cards */}
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-[8px]">
                      <span className="text-[10px] text-stone-500 block uppercase">Lidos</span>
                      <span className="text-base font-bold text-stone-800">
                        {lastResult?.totalEmailsChecked ?? health?.totalEmailsChecked ?? 0}
                      </span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[8px]">
                      <span className="text-[10px] text-emerald-700 block uppercase font-sans font-semibold">
                        Criados
                      </span>
                      <span className="text-base font-bold text-emerald-700">
                        {lastResult?.tripsCreated ?? health?.tripsCreated ?? 0}
                      </span>
                    </div>
                    <div className="p-3 bg-teal-50 border border-teal-200 rounded-[8px]">
                      <span className="text-[10px] text-teal-700 block uppercase font-sans font-semibold">
                        Atualizados
                      </span>
                      <span className="text-base font-bold text-teal-700">
                        {lastResult?.tripsUpdated ?? health?.tripsUpdated ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* Mensagem de Status */}
                  {(lastResult?.tripsCreated ?? 0) > 0 ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-[8px] flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>{lastResult?.tripsCreated} novo(s) transporte(s) criado(s)!</strong>
                        <p className="text-[11px] text-emerald-800 mt-0.5">
                          Os arquivos do SSW foram processados e as viagens já estão disponíveis no painel.
                        </p>
                      </div>
                    </div>
                  ) : (lastResult?.totalEmailsChecked ?? 0) === 0 ? (
                    <div className="p-3 bg-stone-100 text-stone-700 rounded-[8px] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>
                        Conexão IMAP operacional! Nenhum e-mail novo pendente de leitura na caixa.
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-[8px] flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>
                        {lastResult?.totalEmailsChecked} e-mail(s) verificado(s), todos os romaneios já estavam atualizados.
                      </span>
                    </div>
                  )}

                  {/* Lista de Detalhes dos E-mails */}
                  {lastResult?.details && lastResult.details.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-mono uppercase text-stone-500 font-bold">
                        E-mails Verificados na Caixa:
                      </h4>
                      <div className="divide-y divide-stone-100 border border-stone-200 rounded-[8px] max-h-48 overflow-y-auto">
                        {lastResult.details.map((d, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 hover:bg-stone-50/80 flex items-center justify-between gap-2"
                          >
                            <div className="truncate flex-1">
                              <div className="font-semibold text-stone-800 truncate" title={d.subject}>
                                {d.subject}
                              </div>
                              <div className="text-[10px] text-stone-500 truncate">
                                {d.cteNumber ? (
                                  <>
                                    {d.cteNumber} &bull; {d.sender || 'Remetente'}
                                  </>
                                ) : (
                                  <>De: {d.from}</>
                                )}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-[4px] font-mono uppercase font-semibold shrink-0 ${
                                d.status === 'criado'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : d.status === 'existente'
                                  ? 'bg-teal-100 text-teal-800'
                                  : d.status === 'erro'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {d.status === 'criado'
                                ? 'Criado'
                                : d.status === 'existente'
                                ? 'Existente'
                                : d.status === 'erro'
                                ? 'Erro'
                                : 'Sem CT-e'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Caso tenha dado erro mas sem activeDiagnostic estruturado */}
              {lastResult && !lastResult.success && !activeDiagnostic && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-[8px] flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Falha na sincronização</strong>
                    <p className="text-[11px] mt-0.5 text-red-700">
                      {lastResult?.error || 'Erro desconhecido'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
              <span className="text-[11px] text-stone-500">
                {hasError ? 'Verifique as orientações acima' : 'Robô de leitura IMAP ativo'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isLoading}
                  className="gap-1.5 h-8 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  Testar Sincronização
                </Button>
                <Button size="sm" onClick={() => setIsOpen(false)} className="h-8 text-xs">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
