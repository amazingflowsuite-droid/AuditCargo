'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Inbox,
  X,
  ExternalLink,
} from 'lucide-react'
import { syncCteEmailsAction } from '@/app/actions'
import { EmailSyncResult } from '@/utils/email/email-xml-sync'

export function SyncEmailCteButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [lastResult, setLastResult] = useState<EmailSyncResult | null>(null)

  const handleSync = async () => {
    setIsLoading(true)
    try {
      const res = await syncCteEmailsAction()
      setLastResult(res)
      setIsOpen(true)
    } catch (err: any) {
      setLastResult({
        success: false,
        totalEmailsChecked: 0,
        ctesProcessed: 0,
        tripsCreated: 0,
        tripsUpdated: 0,
        details: [],
        error: err?.message || 'Erro inesperado ao consultar caixa de e-mail.',
      })
      setIsOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={handleSync}
        disabled={isLoading}
        className="gap-2 h-11 px-4 border-[#0D9488]/30 hover:border-[#0D9488] bg-white text-stone-800 shadow-2xs transition-all hover:bg-teal-50/50"
        title="Verificar caixa de e-mails infoweb@ccargo.com.br para novos CT-es do SSW"
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

      {/* MODAL COM DETALHES DA SINCRONIZAÇÃO */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-[12px] border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 text-[#0D9488] rounded-[8px]">
                  <Inbox className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 font-mono">
                    Sincronização SSW &bull; E-mail
                  </h3>
                  <p className="text-[11px] text-stone-500 font-mono">
                    infoweb@ccargo.com.br (Hostinger IMAP)
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
              {lastResult?.success ? (
                <>
                  {/* Resumo em Cards */}
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-[8px]">
                      <span className="text-[10px] text-stone-500 block uppercase">Lidos</span>
                      <span className="text-base font-bold text-stone-800">
                        {lastResult.totalEmailsChecked}
                      </span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[8px]">
                      <span className="text-[10px] text-emerald-700 block uppercase font-sans font-semibold">
                        Criados
                      </span>
                      <span className="text-base font-bold text-emerald-700">
                        {lastResult.tripsCreated}
                      </span>
                    </div>
                    <div className="p-3 bg-teal-50 border border-teal-200 rounded-[8px]">
                      <span className="text-[10px] text-teal-700 block uppercase font-sans font-semibold">
                        Atualizados
                      </span>
                      <span className="text-base font-bold text-teal-700">
                        {lastResult.tripsUpdated}
                      </span>
                    </div>
                  </div>

                  {/* Mensagem de Status */}
                  {lastResult.tripsCreated > 0 ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-[8px] flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>{lastResult.tripsCreated} novo(s) transporte(s) criado(s)!</strong>
                        <p className="text-[11px] text-emerald-800 mt-0.5">
                          Os XMLs foram processados e as viagens já estão disponíveis no painel com peso, notas e remetentes.
                        </p>
                      </div>
                    </div>
                  ) : lastResult.totalEmailsChecked === 0 ? (
                    <div className="p-3 bg-stone-100 text-stone-700 rounded-[8px] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Caixa de entrada atualizada! Nenhum e-mail novo pendente de leitura.</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-[8px] flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{lastResult.totalEmailsChecked} e-mail(s) verificado(s), mas nenhum novo CT-e precisou ser criado.</span>
                    </div>
                  )}

                  {/* Lista de Detalhes dos E-mails */}
                  {lastResult.details && lastResult.details.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-mono uppercase text-stone-500 font-bold">
                        E-mails Verificados na Caixa:
                      </h4>
                      <div className="divide-y divide-stone-100 border border-stone-200 rounded-[8px] max-h-48 overflow-y-auto">
                        {lastResult.details.map((d, idx) => (
                          <div key={idx} className="p-2.5 hover:bg-stone-50/80 flex items-center justify-between gap-2">
                            <div className="truncate flex-1">
                              <div className="font-semibold text-stone-800 truncate" title={d.subject}>
                                {d.subject}
                              </div>
                              <div className="text-[10px] text-stone-500 truncate">
                                {d.cteNumber ? (
                                  <>CT-e #{d.cteNumber} &bull; {d.sender || 'Remetente'}</>
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
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-[8px] flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Falha na sincronização</strong>
                    <p className="text-[11px] mt-0.5 text-red-700">{lastResult?.error || 'Erro desconhecido'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
              <span className="text-[11px] text-stone-500">
                Robô de leitura IMAP 100% ativo
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
                  Checar Novamente
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-8 text-xs"
                >
                  Concluir
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
