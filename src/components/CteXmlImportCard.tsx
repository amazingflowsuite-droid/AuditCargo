'use client'

import { useState, useRef } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  UploadCloud,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Sparkles,
  FileCheck2,
} from "lucide-react"
import { parseCteXmlAction } from "@/app/actions"

interface CteXmlImportCardProps {
  onXmlImported: (data: {
    cteNumber: string
    serie: number
    cteKey: string
    invoices: string[]
    senderId?: string
    recipientId?: string
    driverId?: string
    branchId?: string
    sefazMetadata?: any
    newSender?: any
    newRecipient?: any
  }) => void
  onClear: () => void
}

export function CteXmlImportCard({ onXmlImported, onClear }: CteXmlImportCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [importedData, setImportedData] = useState<{
    fileName: string
    cteNumber: string
    serie: number
    cteKey: string
    senderName: string
    recipientName: string
    invoices: string[]
    weightKg?: number
    vFrete?: number
    placa?: string
    driverName?: string
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const processXmlText = async (xmlText: string, fileName: string) => {
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const res = await parseCteXmlAction(xmlText, true)

      if (!res.success || !res.cteData) {
        setErrorMsg(res.error || 'Não foi possível ler as tags do CT-e. Verifique se o arquivo é um XML válido.')
        return
      }

      const {
        cteData,
        sefazMetadata,
        matchedBranchId,
        matchedDriverId,
        matchedDriverName,
        matchedSenderId,
        matchedSender,
        matchedRecipientId,
        matchedRecipient,
      } = res

      const serieNumber = parseInt(cteData.serie || '1', 10)
      const senderDisplayName = matchedSender?.name || cteData.remNome || 'Remetente não identificado'
      const recipientDisplayName = matchedRecipient?.name || cteData.destNome || 'Destinatário não identificado'

      setImportedData({
        fileName,
        cteNumber: cteData.nCT,
        serie: serieNumber,
        cteKey: cteData.chCTe,
        senderName: senderDisplayName,
        recipientName: recipientDisplayName,
        invoices: cteData.invoices || [],
        weightKg: cteData.weightKg,
        vFrete: cteData.vFrete,
        placa: cteData.placa,
        driverName: matchedDriverName || undefined,
      })

      // Repassa os dados completos ao formulário
      onXmlImported({
        cteNumber: cteData.nCT,
        serie: serieNumber,
        cteKey: cteData.chCTe,
        invoices: cteData.invoices || [],
        senderId: matchedSenderId || undefined,
        recipientId: matchedRecipientId || undefined,
        driverId: matchedDriverId || undefined,
        branchId: matchedBranchId || undefined,
        sefazMetadata,
        newSender: matchedSender,
        newRecipient: matchedRecipient,
      })
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro inesperado ao processar o arquivo XML.')
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.xml')) {
      setErrorMsg('Por favor, selecione um arquivo no formato .xml do CT-e.')
      return
    }

    const xmlText = await file.text()
    await processXmlText(xmlText, file.name)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.xml')) {
      setErrorMsg('Por favor, solte um arquivo no formato .xml.')
      return
    }

    const xmlText = await file.text()
    await processXmlText(xmlText, file.name)
  }

  const handleReset = () => {
    setImportedData(null)
    setErrorMsg(null)
    onClear()
  }

  return (
    <Card className="p-4 sm:p-5 border-2 border-dashed border-[#0D9488]/40 bg-[#F0FDFA]/40 hover:bg-[#F0FDFA]/70 transition-colors rounded-[12px]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml"
        onChange={handleFileChange}
        className="hidden"
      />

      {importedData ? (
        // CARD DE SUCESSO DO XML IMPORTADO
        <div className="space-y-3.5 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200/80 pb-3">
            <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
              <FileCheck2 className="w-5 h-5 text-[#0D9488]" />
              <span>CT-e Importado com Sucesso a partir do XML!</span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-8 text-xs text-stone-600 hover:text-stone-900 border-stone-300"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Trocar / Limpar XML
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
            <div className="p-2.5 bg-white rounded-[6px] border border-teal-100 shadow-2xs">
              <span className="text-[10px] text-stone-500 block uppercase">CT-e / Série</span>
              <span className="text-sm font-bold text-[#0F172A]">{importedData.cteNumber}</span>
              <span className="text-[10px] text-stone-400 block">Série: {importedData.serie}</span>
            </div>

            <div className="p-2.5 bg-white rounded-[6px] border border-teal-100 shadow-2xs">
              <span className="text-[10px] text-stone-500 block uppercase">Peso da Carga</span>
              <span className="text-sm font-bold text-teal-700">
                {importedData.weightKg ? `${importedData.weightKg.toLocaleString('pt-BR')} kg` : 'Conforme CT-e'}
              </span>
              <span className="text-[10px] text-stone-400 block truncate" title={importedData.placa || ''}>
                Placa: {importedData.placa || 'Não informada'}
              </span>
            </div>

            <div className="p-2.5 bg-white rounded-[6px] border border-teal-100 shadow-2xs">
              <span className="text-[10px] text-stone-500 block uppercase">Valor Frete</span>
              <span className="text-sm font-bold text-stone-800">
                {importedData.vFrete
                  ? `R$ ${importedData.vFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'S/ Frete'}
              </span>
              <span className="text-[10px] text-stone-400 block">
                {importedData.invoices.length} {importedData.invoices.length === 1 ? 'Nota' : 'Notas'}
              </span>
            </div>

            <div className="p-2.5 bg-white rounded-[6px] border border-teal-100 shadow-2xs">
              <span className="text-[10px] text-stone-500 block uppercase">Arquivo XML</span>
              <span className="text-xs font-medium text-stone-700 truncate block" title={importedData.fileName}>
                {importedData.fileName}
              </span>
              <span className="text-[10px] text-emerald-600 block font-sans font-semibold">
                ✓ 100% preenchido
              </span>
            </div>
          </div>

          <div className="p-2.5 bg-white rounded-[6px] border border-teal-100 text-xs text-stone-700 space-y-1">
            <div>
              <span className="text-stone-500">Remetente:</span> <strong>{importedData.senderName}</strong>
            </div>
            <div>
              <span className="text-stone-500">Destinatário:</span> <strong>{importedData.recipientName}</strong>
            </div>
            {importedData.invoices.length > 0 && (
              <div>
                <span className="text-stone-500">Notas Fiscais:</span>{' '}
                <span className="font-mono text-teal-700 font-semibold">{importedData.invoices.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        // DROPZONE PARA SELECIONAR / ARRASTAR XML
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer text-center py-6 px-4 rounded-[8px] transition-all ${
            isDragging
              ? 'bg-[#CCFBF1] border-2 border-[#0D9488]'
              : 'hover:bg-white/80'
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 text-teal-800 py-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#0D9488]" />
              <span className="text-sm font-semibold">Lendo e decodificando XML do CT-e...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-full bg-teal-100/80 text-[#0D9488] flex items-center justify-center mx-auto shadow-2xs">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900">
                  Importar Transporte via Arquivo XML do CT-e
                </h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Arraste o arquivo <strong>.xml</strong> emitido no SSW aqui ou{' '}
                  <span className="text-[#0D9488] font-semibold underline">clique para selecionar</span>
                </p>
              </div>
              <p className="text-[11px] text-stone-500 max-w-md mx-auto">
                Preenche automaticamente: CT-e, Filial, Remetente, Destinatário, Notas Fiscais, Peso, Frete e Motorista.
              </p>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-600 hover:text-red-800 text-xs font-bold uppercase ml-2"
          >
            OK
          </button>
        </div>
      )}
    </Card>
  )
}
