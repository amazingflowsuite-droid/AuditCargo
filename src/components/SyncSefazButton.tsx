'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncSefazAction } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { RefreshCw, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'

export function SyncSefazButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'success' | 'info' | 'error'
    message: string
  } | null>(null)

  const handleSync = () => {
    setSyncFeedback(null)
    startTransition(async () => {
      try {
        const result = await syncSefazAction()

        if (result.sucesso) {
          if (result.novasViagens > 0) {
            setSyncFeedback({
              type: 'success',
              message: `🎉 ${result.novasViagens} novo(s) transporte(s) importado(s) da SEFAZ!`,
            })
          } else {
            setSyncFeedback({
              type: 'info',
              message: `Tudo em dia! Nenhum novo CT-e pendente na SEFAZ (NSU: ${result.ultimoNsu}).`,
            })
          }
          router.refresh()
        } else {
          setSyncFeedback({
            type: 'error',
            message: result.mensagem || 'Falha ao sincronizar com a SEFAZ.',
          })
        }
      } catch (err: any) {
        setSyncFeedback({
          type: 'error',
          message: err?.message || 'Erro inesperado na chamada da SEFAZ.',
        })
      } finally {
        setTimeout(() => {
          setSyncFeedback(null)
        }, 7000)
      }
    })
  }

  return (
    <div className="relative inline-flex items-center">
      <Button
        type="button"
        variant="outline"
        onClick={handleSync}
        disabled={isPending}
        className="gap-2 h-11 px-4 border-[#0D9488]/30 hover:border-[#0D9488] hover:bg-[#F0FDFA] text-[#0F766E] font-medium transition-all shadow-sm"
        title="Consulta os últimos CT-es autorizados na SEFAZ Nacional e importa como viagens"
      >
        <RefreshCw className={`w-4 h-4 text-[#0D9488] ${isPending ? 'animate-spin' : ''}`} />
        <span>{isPending ? 'Consultando SEFAZ...' : 'Sincronizar SEFAZ'}</span>
        {!isPending && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
        )}
      </Button>

      {/* Popover / Toast Flutuante de Feedback */}
      {syncFeedback && (
        <div
          className={`absolute top-full right-0 mt-2 z-50 min-w-[280px] max-w-[360px] p-3 rounded-lg shadow-lg border text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
            syncFeedback.type === 'success'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
              : syncFeedback.type === 'info'
              ? 'bg-[#F0FDFA] border-[#99F6E4] text-[#0F766E]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
          }`}
        >
          <div className="flex items-start gap-2">
            {syncFeedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />}
            {syncFeedback.type === 'info' && <Sparkles className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />}
            {syncFeedback.type === 'error' && <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />}
            <span className="leading-tight">{syncFeedback.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
