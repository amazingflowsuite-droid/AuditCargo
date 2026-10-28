'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  registerCheckin,
  registerCheckout,
  revertCheckin,
  revertCheckout,
  reportTripIncidentAction,
} from "@/app/actions"
import {
  INCIDENT_CATEGORIES,
  IncidentCategory,
  getTripIncidents,
  getCompleteTripTimeline,
  AUDIT_CHANNEL_LABELS,
} from "@/utils/trip-audit"
import {
  MapPin,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  Camera,
  X,
  Eye,
  Mail,
  Loader2,
  Send,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

/**
 * Utilitário de alta performance: comprime imagens no navegador (client-side) via Canvas.
 * Transforma fotos mobile de 8-15MB em arquivos de ~200-300KB antes do upload.
 */
async function compressImageFile(file: File): Promise<File> {
  if (file.size <= 300 * 1024) return file

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = () => {
        const MAX_WIDTH = 1280
        const MAX_HEIGHT = 1280
        let width = img.width
        let height = img.height

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = Math.round((height * MAX_WIDTH) / width)
            width = MAX_WIDTH
          } else {
            width = Math.round((width * MAX_HEIGHT) / height)
            height = MAX_HEIGHT
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file)
              return
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg'
            const compressed = new File([blob], cleanName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })
            resolve(compressed)
          },
          'image/jpeg',
          0.75
        )
      }
      img.onerror = () => resolve(file)
    }
    reader.onerror = () => resolve(file)
  })
}

export function DriverActions({
  tripId,
  status,
  token,
  arrivalTime,
  completionTime,
  createdAt,
  checkinPhotoUrl,
  sefazMetadata,
  driverName,
}: {
  tripId: string
  status: string
  token: string
  arrivalTime?: string | null
  completionTime?: string | null
  createdAt?: string | null
  checkinPhotoUrl?: string | null
  sefazMetadata?: any
  driverName?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [geoStatus, setGeoStatus] = useState<string>('')
  const [emailStatusMsg, setEmailStatusMsg] = useState<string | null>(null)
  const [showRevertConfirm, setShowRevertConfirm] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)

  // Foto comprobatória de portaria
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados de Registro de Imprevisto / Sinistro
  const [localMeta, setLocalMeta] = useState<any>(sefazMetadata)
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incidentCategory, setIncidentCategory] = useState<IncidentCategory>('nf_fiscal')
  const [incidentDescription, setIncidentDescription] = useState('')
  const [incidentFile, setIncidentFile] = useState<File | null>(null)
  const [incidentPreviewUrl, setIncidentPreviewUrl] = useState<string | null>(null)
  const [isIncidentSubmitting, setIsIncidentSubmitting] = useState(false)
  const [incidentSuccessMsg, setIncidentSuccessMsg] = useState<string | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const incidentFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalMeta(sefazMetadata)
  }, [sefazMetadata])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (incidentPreviewUrl) URL.revokeObjectURL(incidentPreviewUrl)
    }
  }, [previewUrl, incidentPreviewUrl])

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setActionError(null)
      setIsCompressing(true)
      try {
        const optimized = await compressImageFile(file)
        setSelectedFile(optimized)
        const url = URL.createObjectURL(optimized)
        setPreviewUrl(url)
      } catch {
        setSelectedFile(file)
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
      } finally {
        setIsCompressing(false)
      }
    }
  }

  const removePhoto = () => {
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleIncidentPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (incidentPreviewUrl) URL.revokeObjectURL(incidentPreviewUrl)
      setActionError(null)
      setIsCompressing(true)
      try {
        const optimized = await compressImageFile(file)
        setIncidentFile(optimized)
        setIncidentPreviewUrl(URL.createObjectURL(optimized))
      } catch {
        setIncidentFile(file)
        setIncidentPreviewUrl(URL.createObjectURL(file))
      } finally {
        setIsCompressing(false)
      }
    }
  }

  const removeIncidentPhoto = () => {
    setIncidentFile(null)
    if (incidentPreviewUrl) {
      URL.revokeObjectURL(incidentPreviewUrl)
      setIncidentPreviewUrl(null)
    }
    if (incidentFileInputRef.current) {
      incidentFileInputRef.current.value = ''
    }
  }

  const handleReportIncident = () => {
    if (!incidentDescription.trim() || incidentDescription.trim().length < 3) {
      setActionError('Descreva o que aconteceu (ex: número da nota com problema ou motivo da recusa).')
      return
    }

    setActionError(null)
    setIncidentSuccessMsg(null)
    setIsIncidentSubmitting(true)

    const submitWithCoords = async (lat?: number, lng?: number) => {
      try {
        const formData = new FormData()
        formData.append('category', incidentCategory)
        formData.append('description', incidentDescription.trim())
        if (lat) formData.append('lat', String(lat))
        if (lng) formData.append('lng', String(lng))
        if (incidentFile) formData.append('photo', incidentFile)

        const res = await reportTripIncidentAction(tripId, formData)
        if (res?.error) {
          setActionError(res.error)
          return
        }
        if (res?.sefaz_metadata) {
          setLocalMeta(res.sefaz_metadata)
        }
        setIncidentDescription('')
        removeIncidentPhoto()
        setShowIncidentForm(false)
        setIncidentSuccessMsg('Imprevisto registrado! A central de logística já foi alertada.')
      } catch (err: any) {
        setActionError(err?.message || 'Erro ao enviar relato de imprevisto.')
      } finally {
        setIsIncidentSubmitting(false)
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => submitWithCoords(pos.coords.latitude, pos.coords.longitude),
        () => submitWithCoords(),
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
      )
    } else {
      submitWithCoords()
    }
  }

  const handleCheckin = () => {
    setActionError(null)
    setGeoStatus('Capturando GPS do local...')

    const doSubmit = (lat?: number, lng?: number) => {
      const formData = new FormData()
      if (selectedFile) {
        formData.append('photo', selectedFile)
      }

      startTransition(async () => {
        const res = await registerCheckin(tripId, formData, lat, lng)
        setGeoStatus('')
        if (res?.error) {
          setActionError(res.error)
          return
        }
        if (res?.data?.sefaz_metadata) {
          setLocalMeta(res.data.sefaz_metadata)
        }
        if (res?.emailSent) {
          setEmailStatusMsg('E-mail oficial de aviso de chegada disparado para o destinatário!')
        }
      })
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoStatus('GPS capturado! Enviando comprovação...')
          doSubmit(position.coords.latitude, position.coords.longitude)
        },
        () => {
          setGeoStatus('GPS não disponível no momento. Enviando data e hora oficiais...')
          doSubmit()
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
      )
    } else {
      doSubmit()
    }
  }

  const handleCheckout = () => {
    setActionError(null)
    startTransition(async () => {
      const res = await registerCheckout(tripId)
      if (res?.error) {
        setActionError(res.error)
        return
      }
      if (res?.data?.sefaz_metadata) {
        setLocalMeta(res.data.sefaz_metadata)
      }
      if (res?.emailSent) {
        setEmailStatusMsg('E-mail oficial de saída e finalização disparado para o destinatário!')
      }
    })
  }

  const handleRevertCheckin = () => {
    setActionError(null)
    startTransition(async () => {
      const res = await revertCheckin(tripId)
      if (res?.error) {
        setActionError(res.error)
        setShowRevertConfirm(false)
        return
      }
      if (res?.data?.sefaz_metadata) {
        setLocalMeta(res.data.sefaz_metadata)
      }
      setShowRevertConfirm(false)
      removePhoto()
    })
  }

  const handleRevertCheckout = () => {
    setActionError(null)
    startTransition(async () => {
      const res = await revertCheckout(tripId)
      if (res?.error) {
        setActionError(res.error)
        setShowRevertConfirm(false)
        return
      }
      if (res?.data?.sefaz_metadata) {
        setLocalMeta(res.data.sefaz_metadata)
      }
      setShowRevertConfirm(false)
    })
  }

  const canRevertArrival = () => {
    if (!arrivalTime) return true
    const elapsedMinutes = (Date.now() - new Date(arrivalTime).getTime()) / (1000 * 60)
    return elapsedMinutes <= 15
  }

  const canRevertCompletion = () => {
    if (!completionTime) return true
    const elapsedMinutes = (Date.now() - new Date(completionTime).getTime()) / (1000 * 60)
    return elapsedMinutes <= 15
  }

  const incidents = getTripIncidents(localMeta)
  const openIncidentsCount = incidents.filter((i) => i.status === 'open').length
  const timelineEvents = getCompleteTripTimeline({
    created_at: createdAt,
    arrival_time: arrivalTime,
    completion_time: completionTime,
    checkin_photo_url: checkinPhotoUrl,
    sefaz_metadata: localMeta,
    drivers: { name: driverName },
  })

  const renderIncidentAndTimelineSection = () => (
    <div className="space-y-3 pt-2 border-t border-[#E7E5E4]">
      {/* Mensagem de sucesso ao reportar imprevisto */}
      {incidentSuccessMsg && (
        <div className="p-3 rounded-[6px] bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span className="font-medium">{incidentSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setIncidentSuccessMsg(null)}
            className="text-amber-700 hover:text-amber-950"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Botão para Reportar Imprevisto / Sinistro (disponível em trânsito ou na portaria) */}
      {status !== 'finished' && (
        <div className="rounded-[8px] border border-amber-300 bg-amber-50/60 overflow-hidden shadow-2xs">
          {!showIncidentForm ? (
            <button
              type="button"
              onClick={() => {
                setShowIncidentForm(true)
                setActionError(null)
              }}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-amber-100/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-amber-950 block">
                    Reportar Imprevisto ou Problema na Descarga
                  </span>
                  <span className="text-[11px] text-amber-800 block">
                    Nota vencida, recusa de carga, fila grande ou avaria
                  </span>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-800 bg-white px-2.5 py-1 rounded-[4px] border border-amber-300">
                Registrar
              </span>
            </button>
          ) : (
            <div className="p-4 space-y-3 bg-white">
              <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h4 className="text-xs font-bold text-[#1C1917] uppercase tracking-wider">
                    Registrar Imprevisto Operacional
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIncidentForm(false)}
                  className="text-stone-400 hover:text-stone-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-[#57534E] block">
                  1. Qual o motivo do imprevisto?
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {(Object.keys(INCIDENT_CATEGORIES) as IncidentCategory[]).map((catKey) => {
                    const cat = INCIDENT_CATEGORIES[catKey]
                    const isSelected = incidentCategory === catKey
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setIncidentCategory(catKey)}
                        className={`p-2.5 rounded-[6px] border text-left text-xs font-medium flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-amber-50 border-amber-500 text-amber-950 ring-1 ring-amber-500 font-semibold'
                            : 'bg-[#FAFAF9] border-[#E7E5E4] text-[#44403C] hover:bg-stone-100'
                        }`}
                      >
                        <span>
                          {cat.icon} {cat.label}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-[#57534E] block">
                  2. Explique o que aconteceu:
                </label>
                <textarea
                  rows={3}
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  placeholder="Ex: A portaria recusou a Nota Fiscal 4512 por prazo vencido, aguardando liberação..."
                  className="w-full rounded-[6px] border border-[#D6D3D1] p-2.5 text-xs text-[#1C1917] focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-[#57534E] block">
                  3. Foto do problema / nota fiscal (Opcional):
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={incidentFileInputRef}
                  onChange={handleIncidentPhotoSelect}
                  className="hidden"
                />
                {!incidentPreviewUrl ? (
                  <button
                    type="button"
                    onClick={() => incidentFileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 border border-dashed border-[#D6D3D1] hover:border-amber-600 rounded-[6px] bg-[#FAFAF9] text-xs font-medium text-[#57534E] flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-amber-600" />
                    <span>Anexar Foto da Nota ou Ocorrência</span>
                  </button>
                ) : (
                  <div className="p-2 rounded-[6px] bg-amber-50/50 border border-amber-200 flex items-center gap-2.5">
                    <img
                      src={incidentPreviewUrl}
                      alt="Foto do Imprevisto"
                      className="w-12 h-12 object-cover rounded-[4px] border border-amber-300"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold text-amber-900 block">
                        Foto anexada ao chamado
                      </span>
                      <button
                        type="button"
                        onClick={() => incidentFileInputRef.current?.click()}
                        className="text-[10px] text-amber-700 underline"
                      >
                        Trocar foto
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={removeIncidentPhoto}
                      className="p-1 text-stone-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleReportIncident}
                  disabled={isIncidentSubmitting || isCompressing}
                  className="flex-1 py-3 px-4 rounded-[6px] bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isIncidentSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{isIncidentSubmitting ? 'Enviando Alerta...' : 'Enviar Imprevisto para Central'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowIncidentForm(false)}
                  className="py-3 px-3 rounded-[6px] border border-[#D6D3D1] text-xs font-medium text-[#57534E] hover:bg-stone-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de Imprevistos Registrados nesta Viagem */}
      {incidents.length > 0 && (
        <div className="p-3.5 rounded-[8px] bg-white border border-amber-300 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1C1917] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Ocorrências / Imprevistos ({incidents.length})
            </span>
            {openIncidentsCount > 0 ? (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                {openIncidentsCount} em análise
              </span>
            ) : (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                Tratados
              </span>
            )}
          </div>

          <div className="space-y-2">
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className={`p-2.5 rounded-[6px] border text-xs space-y-1.5 ${
                  inc.status === 'resolved'
                    ? 'bg-stone-50 border-stone-200'
                    : 'bg-amber-50/50 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#1C1917]">
                    {INCIDENT_CATEGORIES[inc.category]?.icon || '⚠️'} {inc.categoryLabel}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] font-semibold ${
                      inc.status === 'resolved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-200/80 text-amber-900'
                    }`}
                  >
                    {inc.status === 'resolved' ? '✅ Resolvido' : '⏳ Em Análise'}
                  </span>
                </div>
                <p className="text-[#44403C] leading-snug">{inc.description}</p>
                {inc.resolutionNotes && (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 p-1.5 rounded-[4px] border border-emerald-200">
                    <strong>Retorno da Central:</strong> {inc.resolutionNotes}
                  </p>
                )}
                <div className="flex items-center justify-between text-[10px] text-[#78716C] font-mono pt-0.5">
                  <span>
                    {new Date(inc.createdAt).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(inc.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {inc.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setViewingPhoto(inc.photoUrl!)}
                      className="text-[#0D9488] font-semibold hover:underline flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> Ver foto
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico e Rastreabilidade para o Motorista */}
      <div className="rounded-[8px] bg-white border border-[#E7E5E4] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTimeline(!showTimeline)}
          className="w-full p-3 flex items-center justify-between text-xs font-semibold text-[#57534E] hover:bg-stone-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#0D9488]" />
            <span>Histórico de Rastreabilidade ({timelineEvents.length} eventos)</span>
          </span>
          {showTimeline ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showTimeline && (
          <div className="p-3 pt-1 border-t border-[#E7E5E4] space-y-2.5 bg-[#FAFAF9]">
            {timelineEvents.map((ev, idx) => (
              <div key={ev.id} className="flex items-start gap-2.5 text-xs border-l-2 border-[#0D9488] pl-2.5 py-0.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#1C1917] flex items-center gap-1.5 flex-wrap">
                      {idx === 0 && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#0D9488] text-white uppercase">
                          Atual
                        </span>
                      )}
                      <span>{ev.title}</span>
                    </span>
                    <span className="text-[10px] font-mono text-[#78716C] shrink-0">
                      {new Date(ev.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
                      {new Date(ev.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {ev.description && <p className="text-[11px] text-[#57534E] mt-0.5">{ev.description}</p>}
                  <span className="text-[10px] font-mono text-[#78716C]">
                    Canal: {AUDIT_CHANNEL_LABELS[ev.channel]?.label || ev.channel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // 1. Em Trânsito -> Foto da Portaria + Botão "Chegada no Destino" + Imprevisto
  if (status === 'in_transit' || status === 'pending') {
    return (
      <div className="space-y-4 pt-2">
        {actionError && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-[6px] border border-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Upload da Foto Comprobatória */}
        <div className="p-4 rounded-[8px] bg-white border border-[#D6D3D1] space-y-3 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-50 text-[#0D9488] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#1C1917]">Foto Comprobatória da Portaria</h4>
              <p className="text-[11px] text-[#78716C]">
                Tire foto da guarita, guichê ou senha de espera para auditar o horário.
              </p>
            </div>
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handlePhotoSelect}
            className="hidden"
            id="cameraInput"
          />

          {isCompressing ? (
            <div className="w-full py-4 px-4 border border-[#0D9488]/30 rounded-[6px] bg-teal-50/20 text-xs font-semibold text-[#0D9488] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#0D9488]" />
              <span>Otimizando foto para envio rápido...</span>
            </div>
          ) : !previewUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 border-2 border-dashed border-[#D6D3D1] hover:border-[#0D9488] rounded-[6px] bg-[#FAFAF9] hover:bg-teal-50/30 text-xs font-semibold text-[#0F172A] flex items-center justify-center gap-2 transition-colors"
            >
              <Camera className="w-4 h-4 text-[#0D9488]" />
              <span>Abrir Câmera / Anexar Foto</span>
            </button>
          ) : (
            <div className="relative rounded-[6px] overflow-hidden border border-[#A7F3D0] bg-[#ECFDF5] p-2 flex items-center gap-3">
              <img
                src={previewUrl}
                alt="Comprovante"
                className="w-16 h-16 object-cover rounded-[4px] border border-gray-200"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-[#059669] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Foto Pronta Otimizada
                </span>
                <p className="text-[10px] text-[#57534E] truncate font-mono mt-0.5">
                  {selectedFile?.name || 'foto_portaria.jpg'} ({(selectedFile?.size ? (selectedFile.size / 1024).toFixed(0) : 0)} KB)
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-[#0D9488] hover:underline font-semibold mt-1"
                >
                  Tirar outra foto
                </button>
              </div>

              <button
                type="button"
                onClick={removePhoto}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-white"
                title="Remover Foto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Botão de Chegada */}
        <button
          onClick={handleCheckin}
          disabled={isPending || isCompressing}
          className="w-full min-h-[58px] px-6 py-4 bg-[#0D9488] hover:bg-[#0F766E] active:scale-[0.99] text-white font-bold text-base rounded-[8px] transition-all duration-200 shadow-accent-glow flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <MapPin className="w-5 h-5 shrink-0" />
          )}
          <span>{isPending ? 'Gravando Comprovação...' : 'Chegada no Destino'}</span>
        </button>

        {geoStatus && (
          <p className="text-xs text-center text-[#0D9488] font-mono animate-pulse">
            {geoStatus}
          </p>
        )}

        <p className="text-[11px] text-center text-[#78716C] leading-relaxed">
          🔒 Ao confirmar a chegada, gravamos coordenadas de GPS, foto e enviamos aviso oficial por e-mail para o destinatário cadastrado (Lei 11.442/07).
        </p>

        {renderIncidentAndTimelineSection()}

        {viewingPhoto && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-[8px] max-w-sm w-full overflow-hidden shadow-floating">
              <div className="p-3 bg-[#0F172A] text-white flex items-center justify-between">
                <span className="text-xs font-semibold">Evidência Fotográfica</span>
                <button onClick={() => setViewingPhoto(null)} className="text-gray-300 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2">
                <img src={viewingPhoto} alt="Comprovante" className="w-full rounded-[4px] max-h-[70vh] object-contain" />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 2. Chegou no Destino -> Foto registrada + Botão Finalizar Descarga + Imprevisto + Opção de Desfazer
  if (status === 'arrived' || status === 'unloading') {
    return (
      <div className="space-y-4 pt-2">
        {actionError && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-[6px] border border-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        <div className="p-4 rounded-[8px] bg-[#CCFBF1]/40 border border-[#99F6E4] text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-[#0F766E] uppercase tracking-wider">
            <Clock className="w-4 h-4" /> Chegada Registrada
          </div>
          {arrivalTime && (
            <p className="text-xs font-semibold text-[#0F766E]">
              Horário: {new Date(arrivalTime).toLocaleTimeString('pt-BR')} ({new Date(arrivalTime).toLocaleDateString('pt-BR')})
            </p>
          )}

          <div className="pt-1">
            <div className="p-2 rounded-[6px] bg-white/90 border border-[#99F6E4] text-[11px] text-[#0F766E] flex items-center justify-center gap-1.5 shadow-2xs">
              <Mail className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
              <span>
                {emailStatusMsg || 'Aviso de chegada disparado automaticamente para o e-mail do destinatário.'}
              </span>
            </div>
          </div>

          {checkinPhotoUrl && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewingPhoto(checkinPhotoUrl)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-white border border-[#99F6E4] text-xs text-[#0F766E] font-medium shadow-2xs hover:bg-[#F5F5F4]"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Ver Foto Comprobatória da Portaria</span>
              </button>
            </div>
          )}

          <p className="text-xs text-[#57534E] pt-1">
            Contagem de franquia em andamento. Ao concluir o descarregamento da carga, confirme abaixo:
          </p>
        </div>

        {/* Botão de Finalização da Descarga */}
        <button
          onClick={handleCheckout}
          disabled={isPending}
          className="w-full min-h-[54px] px-6 py-3.5 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.99] text-white font-semibold text-base rounded-[8px] transition-all duration-200 flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#0D9488]" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#0D9488]" />
          )}
          <span>{isPending ? 'Gravando Finalização...' : 'Finalização da Descarga'}</span>
        </button>

        {/* Seção de Imprevisto e Linha do Tempo */}
        {renderIncidentAndTimelineSection()}

        {/* Botão para Reverter Ação (Janela de 15 minutos) */}
        {canRevertArrival() ? (
          !showRevertConfirm ? (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setShowRevertConfirm(true)}
                className="inline-flex items-center gap-1.5 text-xs text-[#78716C] hover:text-amber-700 transition-colors py-1 px-2 rounded-[4px] hover:bg-amber-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Apertei sem querer? Desfazer Chegada</span>
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-[6px] bg-amber-50 border border-amber-200 text-center space-y-2">
              <p className="text-xs text-amber-900 font-medium flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Deseja cancelar o registro de chegada e voltar para Em Trânsito?
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleRevertCheckin}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-[4px] bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
                >
                  {isPending ? 'Revertendo...' : 'Sim, Desfazer Chegada'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRevertConfirm(false)}
                  className="px-3 py-1.5 rounded-[4px] border border-gray-300 text-gray-700 text-xs hover:bg-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )
        ) : (
          <p className="text-[11px] text-[#A8A29E] text-center font-mono">
            🔒 Chegada confirmada. Limite de 15 minutos para alteração direta finalizado.
          </p>
        )}

        {viewingPhoto && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-[8px] max-w-sm w-full overflow-hidden shadow-floating">
              <div className="p-3 bg-[#0F172A] text-white flex items-center justify-between">
                <span className="text-xs font-semibold">Evidência Fotográfica</span>
                <button onClick={() => setViewingPhoto(null)} className="text-gray-300 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2">
                <img src={viewingPhoto} alt="Comprovante" className="w-full rounded-[4px] max-h-[70vh] object-contain" />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 3. Finalizado
  return (
    <div className="space-y-4 pt-2">
      {actionError && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-[6px] border border-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="p-6 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0] text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#059669] text-white flex items-center justify-center mx-auto shadow-sm">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <div>
          <h3 className="font-serif-title text-lg font-bold text-[#065F46]">Descarga Finalizada</h3>
          {completionTime && (
            <p className="text-xs font-mono text-[#047857] mt-1">
              Finalizada às {new Date(completionTime).toLocaleTimeString('pt-BR')} em {new Date(completionTime).toLocaleDateString('pt-BR')}
            </p>
          )}

          <div className="pt-2">
            <div className="p-2 rounded-[6px] bg-white border border-[#A7F3D0] text-[11px] text-[#065F46] flex items-center justify-center gap-1.5 shadow-2xs">
              <Mail className="w-3.5 h-3.5 text-[#059669] shrink-0" />
              <span>
                {emailStatusMsg || 'Aviso de finalização e saída com horário oficial disparado por e-mail.'}
              </span>
            </div>
          </div>

          {checkinPhotoUrl && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewingPhoto(checkinPhotoUrl)}
                className="inline-flex items-center gap-1.5 text-xs text-[#047857] hover:underline font-medium"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Visualizar Foto da Portaria</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {renderIncidentAndTimelineSection()}

      {canRevertCompletion() ? (
        !showRevertConfirm ? (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowRevertConfirm(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[#78716C] hover:text-amber-700 transition-colors py-1 px-2 rounded-[4px] hover:bg-amber-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Apertei sem querer? Desfazer Finalização</span>
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-[6px] bg-amber-50 border border-amber-200 text-center space-y-2">
            <p className="text-xs text-amber-900 font-medium flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Deseja reabrir a viagem para continuar na etapa de descarga?
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleRevertCheckout}
                disabled={isPending}
                className="px-3 py-1.5 rounded-[4px] bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
              >
                {isPending ? 'Revertendo...' : 'Sim, Desfazer Finalização'}
              </button>
              <button
                type="button"
                onClick={() => setShowRevertConfirm(false)}
                className="px-3 py-1.5 rounded-[4px] border border-gray-300 text-gray-700 text-xs hover:bg-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )
      ) : (
        <p className="text-[11px] text-[#A8A29E] text-center font-mono">
          🔒 Descarga finalizada. Prazo de tolerância para alteração direta finalizado.
        </p>
      )}

      {viewingPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[8px] max-w-sm w-full overflow-hidden shadow-floating">
            <div className="p-3 bg-[#0F172A] text-white flex items-center justify-between">
              <span className="text-xs font-semibold">Evidência Fotográfica</span>
              <button onClick={() => setViewingPhoto(null)} className="text-gray-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2">
              <img src={viewingPhoto} alt="Comprovante" className="w-full rounded-[4px] max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
