'use client'

import { useState, useRef, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Barcode,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  Upload,
  FileCode,
  Volume2,
  VolumeX,
  X,
  Loader2,
  Sparkles,
  ExternalLink,
} from "lucide-react"
import { lookupCteByKeyAction, parseCteXmlAction } from "@/app/actions"

interface DacteQuickEntryProps {
  companies: any[]
  branches: any[]
  drivers: any[]
  senders: any[]
  recipients: any[]
  onKeyScanned: (data: {
    cteNumber: string
    serie: number
    cteKey: string
    branchId?: string
    sefazMetadata?: any
  }) => void
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
}

/**
 * Toca um bip suave de leitor de código de barras industrial (Web Audio API)
 */
function playScannerBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1400, ctx.currentTime) // 1.4 kHz (som padrão de coletor/leitor)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  } catch {
    // Ignora se o navegador bloquear autoplay de áudio
  }
}

export function DacteQuickEntry({
  branches,
  drivers,
  senders,
  recipients,
  onKeyScanned,
  onXmlImported,
}: DacteQuickEntryProps) {
  const [rawKeyInput, setRawKeyInput] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successInfo, setSuccessInfo] = useState<{
    cteNumber: string
    serie: number
    cleanKey: string
    emitCnpj: string
    aamm: string
    alreadyExists?: boolean
    existingTrip?: any
    invoices?: string[]
    weightKg?: number
    vFrete?: number
    placa?: string
    driverName?: string
    senderName?: string
    recipientName?: string
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ao montar ou resetar, dá foco no input para leitura com o leitor óptico
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyProcess = async (keyToProcess: string) => {
    const cleanKey = keyToProcess.replace(/\D/g, '')
    if (cleanKey.length !== 44) return

    setIsLoading(true)
    setErrorMsg(null)

    if (soundEnabled) {
      playScannerBeep()
    }

    try {
      const res = await lookupCteByKeyAction(cleanKey)
      if (!res.success || !res.keyData) {
        setErrorMsg(res.error || 'Erro ao consultar chave.')
        return
      }

      const { keyData, alreadyExists, existingTrip, matchedBranchId } = res

      setSuccessInfo({
        cteNumber: keyData.cteNumber,
        serie: keyData.serie,
        cleanKey: keyData.cleanKey,
        emitCnpj: keyData.emitCnpj,
        aamm: keyData.aamm,
        alreadyExists,
        existingTrip,
      })

      // Propaga dados decodificados para o formulário principal
      onKeyScanned({
        cteNumber: keyData.cteNumber,
        serie: keyData.serie,
        cteKey: keyData.cleanKey,
        branchId: matchedBranchId || undefined,
      })
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha na comunicação com o servidor.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setRawKeyInput(val)
    const clean = val.replace(/\D/g, '')

    // Se completou 44 dígitos (por digitação, bip óptico ou colar com Ctrl+V)
    if (clean.length === 44) {
      handleKeyProcess(clean)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const clean = rawKeyInput.replace(/\D/g, '')
      if (clean.length === 44) {
        handleKeyProcess(clean)
      } else {
        setErrorMsg(`Chave incompleta: ${clean.length} de 44 dígitos digitados.`)
      }
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.xml')) {
      setErrorMsg('Por favor, selecione um arquivo no formato XML.')
      return
    }

    setIsLoading(true)
    setErrorMsg(null)

    if (soundEnabled) {
      playScannerBeep()
    }

    try {
      const xmlText = await file.text()
      const res = await parseCteXmlAction(xmlText, true)

      if (!res.success || !res.cteData) {
        setErrorMsg(res.error || 'Não foi possível processar o XML do CT-e.')
        return
      }

      const { cteData, sefazMetadata, alreadyExists, existingTrip, matchedBranchId, matchedDriverId, matchedDriverName, matchedSenderId, matchedSender, matchedRecipientId, matchedRecipient } = res

      setRawKeyInput(cteData.chCTe)

      setSuccessInfo({
        cteNumber: cteData.nCT,
        serie: parseInt(cteData.serie || '1', 10),
        cleanKey: cteData.chCTe,
        emitCnpj: cteData.emitCnpj || '',
        aamm: '',
        alreadyExists,
        existingTrip,
        invoices: cteData.invoices,
        weightKg: cteData.weightKg,
        vFrete: cteData.vFrete,
        placa: cteData.placa,
        driverName: matchedDriverName || undefined,
        senderName: matchedSender?.name || cteData.remNome,
        recipientName: matchedRecipient?.name || cteData.destNome,
      })

      // Repassa dados enriquecidos para o formulário
      onXmlImported({
        cteNumber: cteData.nCT,
        serie: parseInt(cteData.serie || '1', 10),
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
      setErrorMsg(err?.message || 'Erro ao ler arquivo XML.')
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleClear = () => {
    setRawKeyInput('')
    setSuccessInfo(null)
    setErrorMsg(null)
    inputRef.current?.focus()
  }

  const cleanDigitsCount = rawKeyInput.replace(/\D/g, '').length

  return (
    <Card className="p-4 sm:p-5 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white border-0 shadow-lg rounded-[12px] relative overflow-hidden">
      {/* Detalhes de iluminação sutil de fundo */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-[#0D9488]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-[#0284C7]/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 space-y-4">
        {/* CABEÇALHO */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[8px] bg-[#0D9488] text-white flex items-center justify-center shadow-md">
              <ScanLine className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                  Bipe do Código de Barras DACTE
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#0D9488]/20 border border-[#0D9488]/50 text-[#2DD4BF] font-semibold">
                    Opção C
                  </span>
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Aponte o leitor óptico para o código do DACTE impresso ou cole a chave de 44 dígitos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Silenciar bipe sonoro' : 'Ativar bipe sonoro'}
              className="p-1.5 rounded-[6px] bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-[#2DD4BF]" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
              Importar XML
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* INPUT DE BIPE ÓPTICO */}
        <div className="space-y-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Barcode className="w-5 h-5 text-[#2DD4BF]" />
            </div>
            <Input
              ref={inputRef}
              value={rawKeyInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Bipe ou cole a chave de 44 dígitos do DACTE..."
              className="pl-11 pr-24 h-12 bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 font-mono text-sm tracking-widest focus-visible:ring-[#0D9488] focus-visible:border-[#0D9488]"
            />
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
              {isLoading ? (
                <div className="flex items-center gap-1 text-xs text-[#2DD4BF] font-mono pr-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Lendo...</span>
                </div>
              ) : rawKeyInput ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Limpar campo"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}

              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                  cleanDigitsCount === 44
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {cleanDigitsCount}/44
              </span>
            </div>
          </div>
        </div>

        {/* MENSAGEM DE ERRO */}
        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-700/60 rounded-[8px] text-xs text-red-200 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-red-400 hover:text-red-200 text-xs font-bold uppercase ml-2"
            >
              OK
            </button>
          </div>
        )}

        {/* FEEDBACK DE SUCESSO E DADOS DECODIFICADOS */}
        {successInfo && (
          <div className="p-4 bg-slate-900/80 border border-[#0D9488]/40 rounded-[10px] space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>DACTE Decodificado com Sucesso!</span>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-slate-400 hover:text-slate-200 underline font-mono"
              >
                Limpar / Novo Bipe
              </button>
            </div>

            {/* ALERTA DE DUPLICIDADE */}
            {successInfo.alreadyExists && successInfo.existingTrip && (
              <div className="p-3 bg-amber-950/80 border border-amber-600/70 rounded-[8px] text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Atenção: Este CT-e já foi cadastrado no sistema!</span>
                </div>
                <p className="text-amber-200/90 pl-5.5">
                  Viagem Token: <strong className="font-mono text-white">#{successInfo.existingTrip.token}</strong> &bull; Destino: <strong>{successInfo.existingTrip.destination}</strong>
                  {successInfo.existingTrip.drivers?.name && (
                    <span> &bull; Motorista: <strong>{successInfo.existingTrip.drivers.name}</strong></span>
                  )}
                </p>
              </div>
            )}

            {/* CARDS COM CAMPOS RECONHECIDOS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="p-2.5 bg-slate-800/80 rounded-[6px] border border-slate-700/60">
                <span className="text-[10px] text-slate-400 block uppercase">CT-e nº</span>
                <span className="text-sm font-bold text-white">{successInfo.cteNumber}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Série: {successInfo.serie}</span>
              </div>

              <div className="p-2.5 bg-slate-800/80 rounded-[6px] border border-slate-700/60">
                <span className="text-[10px] text-slate-400 block uppercase">Emissor CNPJ</span>
                <span className="text-xs font-bold text-[#38BDF8] truncate block" title={successInfo.emitCnpj}>
                  {successInfo.emitCnpj || '07.546.152/0004-86'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">C Cargo Filial</span>
              </div>

              {successInfo.weightKg ? (
                <div className="p-2.5 bg-slate-800/80 rounded-[6px] border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block uppercase">Peso Carga</span>
                  <span className="text-xs font-bold text-emerald-400">
                    {successInfo.weightKg.toLocaleString('pt-BR')} kg
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Frete: {successInfo.vFrete ? `R$ ${successInfo.vFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'S/ Frete'}
                  </span>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-800/80 rounded-[6px] border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block uppercase">Competência</span>
                  <span className="text-xs font-bold text-slate-200">{successInfo.aamm || 'Recente'}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Modelo 57 (CT-e)</span>
                </div>
              )}

              {successInfo.placa ? (
                <div className="p-2.5 bg-slate-800/80 rounded-[6px] border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block uppercase">Placa / Motorista</span>
                  <span className="text-xs font-bold text-amber-300">{successInfo.placa}</span>
                  <span className="text-[10px] text-slate-300 truncate block mt-0.5" title={successInfo.driverName}>
                    {successInfo.driverName || 'Motorista não vinculado'}
                  </span>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-800/80 rounded-[6px] border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block uppercase">Preenchimento</span>
                  <span className="text-xs font-bold text-[#2DD4BF]">Campos preenchidos</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Pronto p/ emitir</span>
                </div>
              )}
            </div>

            {/* NOTAS FISCAIS OU DESTINO DO XML */}
            {(successInfo.senderName || successInfo.recipientName || (successInfo.invoices && successInfo.invoices.length > 0)) && (
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-300 space-y-1">
                {successInfo.senderName && (
                  <div>
                    Remetente: <strong className="text-white">{successInfo.senderName}</strong>
                  </div>
                )}
                {successInfo.recipientName && (
                  <div>
                    Destinatário: <strong className="text-white">{successInfo.recipientName}</strong>
                  </div>
                )}
                {successInfo.invoices && successInfo.invoices.length > 0 && (
                  <div>
                    Notas Fiscais: <span className="font-mono text-[#38BDF8]">{successInfo.invoices.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
