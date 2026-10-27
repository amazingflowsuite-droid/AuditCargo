'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Truck,
  X,
  Loader2,
  Layers,
} from 'lucide-react'
import { importEdiConembAction } from '@/app/actions'

export function ImportEdiButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{
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
  } | null>(null)

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
    <>
      <Button
        variant="outline"
        onClick={() => {
          setIsOpen(true)
          setErrorMsg(null)
          setImportResult(null)
        }}
        className="gap-2 h-11 px-4 border-stone-300 hover:border-[#0D9488] bg-white text-stone-800 shadow-2xs hover:bg-stone-50"
        title="Importar arquivo de Manifesto / Romaneio EDI PROCEDA (.txt) emitido no SSW"
      >
        <FileText className="w-4 h-4 text-[#0D9488]" />
        <span className="font-medium text-xs sm:text-sm">Importar Manifesto (EDI)</span>
      </Button>

      {/* MODAL DE IMPORTAÇÃO DE EDI */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-[12px] border border-stone-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
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

            {/* Conteúdo */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {!importResult ? (
                <>
                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer text-center py-8 px-6 rounded-[10px] border-2 border-dashed transition-all ${
                      isDragging
                        ? 'border-[#0D9488] bg-teal-50/60'
                        : 'border-stone-300 hover:border-[#0D9488] bg-stone-50/50 hover:bg-stone-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.edi"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {isLoading ? (
                      <div className="flex flex-col items-center gap-2 text-stone-600">
                        <Loader2 className="w-8 h-8 text-[#0D9488] animate-spin" />
                        <span className="font-semibold text-sm">Decodificando Manifesto SSW...</span>
                        <span className="text-[11px] text-stone-400">
                          Cruzando placas, motoristas e notas fiscais
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2.5 text-stone-600">
                        <div className="p-3 bg-white rounded-full border border-stone-200 shadow-2xs text-[#0D9488]">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-stone-800">
                            Arraste o arquivo EDI (.txt) ou clique para selecionar
                          </p>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            Arquivo CONEMB / Manifesto de carga gerado pelo SSW
                          </p>
                        </div>
                        <span className="inline-block text-[10px] font-mono text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                          Vincula automaticamente placa do caminhão e motorista
                        </span>
                      </div>
                    )}
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-[8px] flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Erro na importação</strong>
                        <p className="text-[11px] mt-0.5 text-red-700">{errorMsg}</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Resultado do Lote */
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-[8px] flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm text-emerald-900">
                        Romaneios Importados com Sucesso!
                      </h4>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        {importResult.created} romaneio(s) criado(s) e {importResult.updated} atualizado(s) consolidando <strong>{importResult.totalCtes} CT-es</strong> do SSW.
                      </p>
                      {importResult.transportadora && (
                        <p className="text-[10px] font-mono text-emerald-700 mt-1">
                          Emissor: {importResult.transportadora}
                        </p>
                      )}
                    </div>
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
                  <div className="space-y-1.5">
                    <h5 className="text-[11px] font-mono uppercase text-stone-500 font-bold">
                      Romaneios Gerados:
                    </h5>
                    <div className="divide-y divide-stone-100 border border-stone-200 rounded-[8px] max-h-52 overflow-y-auto">
                      {importResult.details.map((d, idx) => (
                        <div key={idx} className="p-2.5 hover:bg-stone-50/80 flex items-center justify-between gap-2">
                          <div className="truncate flex-1">
                            <div className="font-semibold text-stone-800 flex items-center gap-2">
                              <span>CT-e #{d.cteNumber}</span>
                              <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200 inline-flex items-center gap-1">
                                <Truck className="w-3 h-3 text-[#0D9488]" />
                                {d.plate || 'S/ Placa'}
                              </span>
                            </div>
                            <div className="text-[10px] text-stone-500 truncate mt-0.5">
                              {d.driverName ? `Motorista: ${d.driverName}` : 'Pendente de atribuição'}
                              {d.sender ? ` &bull; ${d.sender}` : ''}
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
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
              <span className="text-[11px] text-stone-500">
                Padrão PROCEDA CONEMB 5.0 (SSW)
              </span>
              <div className="flex items-center gap-2">
                {importResult && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportResult(null)
                      setErrorMsg(null)
                    }}
                    className="h-8 text-xs"
                  >
                    Importar Outro Arquivo
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-8 text-xs"
                >
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
