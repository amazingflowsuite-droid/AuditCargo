'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Truck,
  X,
  Loader2,
  Layers,
  ArrowLeft,
} from 'lucide-react'
import { importEdiConembAction } from '@/app/actions'

interface EdiImportResultData {
  transportadora?: string
  totalCtes: number
  created: number
  updated: number
  details: Array<{
    cteNumber: string
    plate: string
    driverName?: string
    sender?: string
    status: 'criado' | 'existente' | 'erro'
    error?: string
  }>
}

/**
 * Card de Importação Direta de Manifesto / Romaneio EDI (PROCEDA CONEMB 5.0 e 3.1 - SSW)
 * Cria os Romaneios diretamente no banco de dados com vínculo automático de placa e motorista.
 */
export function EdiManifestImportCard() {
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<EdiImportResultData | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleProcessFile = async (file: File) => {
    setIsLoading(true)
    setErrorMsg(null)
    setImportResult(null)

    try {
      const text = await file.text()
      const res = await importEdiConembAction(text)

      if (!res.success) {
        setErrorMsg(res.error || 'Falha ao processar o arquivo EDI.')
        return
      }

      setImportResult({
        transportadora: res.transportadora,
        totalCtes: res.totalCtes || 0,
        created: res.created || 0,
        updated: res.updated || 0,
        details: res.details || [],
      })
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro inesperado ao ler arquivo EDI.')
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleProcessFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleProcessFile(file)
  }

  return (
    <Card className="p-4 sm:p-5 border-2 border-dashed border-[#0D9488]/40 bg-[#F0FDFA]/40 hover:bg-[#F0FDFA]/70 transition-colors rounded-[12px]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.edi,.con,.rem,.dat"
        onChange={handleFileChange}
        className="hidden"
      />

      {!importResult ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer text-center py-6 px-4 rounded-[8px] transition-all ${
              isDragging ? 'bg-[#CCFBF1] border-2 border-[#0D9488]' : 'hover:bg-white/80'
            }`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 text-teal-800 py-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#0D9488]" />
                <span className="text-sm font-semibold">Decodificando Manifesto EDI SSW...</span>
                <span className="text-[11px] text-stone-500">
                  Agrupando CT-es por romaneio, cruzando placas e vinculando motoristas no banco
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="w-12 h-12 rounded-full bg-teal-100/80 text-[#0D9488] flex items-center justify-center mx-auto shadow-2xs">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-900 flex items-center justify-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#0D9488]" />
                    <span>Importar Manifesto / Romaneio via Arquivo EDI (SSW)</span>
                  </h4>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Arraste o arquivo <strong>.txt</strong>, <strong>.edi</strong> ou <strong>.con</strong> (PROCEDA CONEMB 5.0 ou 3.1) aqui ou{' '}
                    <span className="text-[#0D9488] font-semibold underline">clique para selecionar</span>
                  </p>
                </div>
                <p className="text-[11px] text-stone-500 max-w-lg mx-auto">
                  Cria os Romaneios diretamente no banco de dados consolidando CT-es, Notas Fiscais, Pesos, Cubagem, Remetentes, Destinatários e Motorista pela placa.
                </p>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-800 rounded-[8px] flex items-start justify-between gap-2.5 text-xs animate-in fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Erro na importação do EDI</strong>
                  <p className="text-[11px] mt-0.5 text-red-700">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-red-600 hover:text-red-800 text-xs font-bold uppercase shrink-0"
              >
                OK
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-200 bg-white p-4 rounded-[10px] border border-teal-200">
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-[8px] flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-emerald-900">
                  Romaneios Gravados no Banco com Sucesso!
                </h4>
                <p className="text-xs text-emerald-800 mt-0.5">
                  {importResult.created} romaneio(s) criado(s) e {importResult.updated} atualizado(s) consolidando{' '}
                  <strong>{importResult.totalCtes} CT-es</strong> do SSW.
                </p>
                {importResult.transportadora && (
                  <p className="text-[10px] font-mono text-emerald-700 mt-1">
                    Emissor: {importResult.transportadora}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setImportResult(null)
                setErrorMsg(null)
              }}
              className="text-stone-400 hover:text-stone-700 p-1"
              title="Fechar resumo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Resumo em Cards */}
          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-[8px]">
              <span className="text-[10px] text-stone-500 block uppercase font-sans">CT-es Totais</span>
              <span className="text-base font-bold text-stone-800">{importResult.totalCtes}</span>
            </div>
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-[8px]">
              <span className="text-[10px] text-emerald-700 block uppercase font-sans font-semibold">
                Romaneios Criados
              </span>
              <span className="text-base font-bold text-emerald-700">{importResult.created}</span>
            </div>
            <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-[8px]">
              <span className="text-[10px] text-teal-700 block uppercase font-sans font-semibold">
                Atualizados
              </span>
              <span className="text-base font-bold text-teal-700">{importResult.updated}</span>
            </div>
          </div>

          {/* Lista de Romaneios / Cargas */}
          <div className="space-y-1.5 text-xs">
            <h5 className="text-[11px] font-mono uppercase text-stone-500 font-bold">
              Romaneios Processados:
            </h5>
            <div className="divide-y divide-stone-100 border border-stone-200 rounded-[8px] max-h-52 overflow-y-auto">
              {importResult.details.map((d, idx) => (
                <div key={idx} className="p-2.5 hover:bg-stone-50/80 flex items-center justify-between gap-2">
                  <div className="truncate flex-1">
                    <div className="font-semibold text-stone-800 flex items-center gap-2">
                      <span>{d.cteNumber}</span>
                      <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200 inline-flex items-center gap-1">
                        <Truck className="w-3 h-3 text-[#0D9488]" />
                        {d.plate || 'S/ Placa'}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-500 truncate mt-0.5">
                      {d.driverName ? `Motorista: ${d.driverName}` : 'Pendente de atribuição'}
                      {d.sender ? ` • ${d.sender}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-[4px] font-mono uppercase font-semibold shrink-0 ${
                      d.status === 'criado'
                        ? 'bg-emerald-100 text-emerald-800'
                        : d.status === 'existente'
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {d.status === 'criado' ? 'Criado' : d.status === 'existente' ? 'Atualizado' : 'Erro'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setImportResult(null)
                setErrorMsg(null)
              }}
              className="h-9 text-xs"
            >
              Importar Outro Arquivo EDI
            </Button>

            <Link href="/">
              <Button size="sm" className="h-9 text-xs gap-1.5 bg-[#0D9488] hover:bg-[#0F766E]">
                <ArrowLeft className="w-3.5 h-3.5" />
                Ver Romaneios no Painel de Controle
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Card>
  )
}

export function ImportEdiButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-2 h-11 px-4 border-stone-300 hover:border-[#0D9488] bg-white text-stone-800 shadow-2xs hover:bg-stone-50"
        title="Importar arquivo de Manifesto / Romaneio EDI PROCEDA (.txt) emitido no SSW"
      >
        <FileText className="w-4 h-4 text-[#0D9488]" />
        <span className="font-medium text-xs sm:text-sm">Importar Manifesto (EDI)</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-[12px] border border-stone-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 text-[#0D9488] rounded-[8px]">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 font-mono">
                    Importação de Manifesto &bull; Romaneio SSW
                  </h3>
                  <p className="text-[11px] text-stone-500 font-mono">
                    Padrão EDI PROCEDA CONEMB 5.0 (.txt / .edi)
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
            <div className="p-5 overflow-y-auto">
              <EdiManifestImportCard />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
