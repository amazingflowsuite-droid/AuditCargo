'use client'

import React, { useState } from 'react'
import {
  X,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Truck,
  Scale,
  DollarSign,
  MapPin,
  User,
  Building2,
  Boxes,
  FileCheck2,
  Info,
  Search,
  Layers,
  History,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Send,
  Loader2,
  Eye,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react'

import { DriverQuickAssignCell } from './DriverQuickAssignCell'
import { formatCNPJ } from '@/utils/masks'
import {
  INCIDENT_CATEGORIES,
  IncidentCategory,
  AUDIT_CHANNEL_LABELS,
  getTripIncidents,
  getCompleteTripTimeline,
  TripAuditEvent,
} from '@/utils/trip-audit'
import { reportTripIncidentAction, resolveTripIncidentAction } from '@/app/actions'

interface CteDetailsModalProps {
  trip: any
  isOpen: boolean
  onClose: () => void
  allTrips?: any[]
  allDrivers?: any[]
  onDriverAssigned?: (tripId: string, assignedDriver: any) => void
  onTripMetadataUpdated?: (tripId: string, newMetadata: any) => void
  initialTab?: 'details' | 'timeline'
}

export function CteDetailsModal({
  trip,
  isOpen,
  onClose,
  allTrips = [],
  allDrivers = [],
  onDriverAssigned,
  onTripMetadataUpdated,
  initialTab = 'details',
}: CteDetailsModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [modalTrip, setModalTrip] = useState<any>(trip)
  const [activeTab, setActiveTab] = useState<'details' | 'timeline'>(initialTab)

  // Estados de Gestão de Imprevistos / Sinistros no Modal
  const [showAddIncident, setShowAddIncident] = useState(false)
  const [newIncidentCat, setNewIncidentCat] = useState<IncidentCategory>('nf_fiscal')
  const [newIncidentDesc, setNewIncidentDesc] = useState('')
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false)
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null)
  const [resolutionNotesMap, setResolutionNotesMap] = useState<Record<string, string>>({})
  const [incidentError, setIncidentError] = useState<string | null>(null)
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null)

  React.useEffect(() => {
    setModalTrip(trip)
    if (trip) {
      setActiveTab(initialTab)
      setShowAddIncident(false)
      setIncidentError(null)
    }
  }, [trip, initialTab])

  if (!isOpen || !modalTrip) return null

  const activeTrip = modalTrip
  const sefazMeta = activeTrip.sefaz_metadata || {}
  const isManifest = Boolean(sefazMeta.is_manifest || (sefazMeta.ctes && sefazMeta.ctes.length > 0))
  const ctesList: any[] = sefazMeta.ctes || []
  const isSefaz = Boolean(activeTrip.cte_key || activeTrip.cte_number || isManifest)

  const incidents = getTripIncidents(sefazMeta)
  const openIncidentsCount = incidents.filter((i) => i.status === 'open').length
  const timelineEvents = getCompleteTripTimeline(activeTrip)

  const formatMoney = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  const formatWeight = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—'
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val) + ' kg'
  }

  const formatCteKey = (key?: string) => {
    if (!key) return '—'
    return key.replace(/(\d{4})/g, '$1 ').trim()
  }

  const formatFullDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr)
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    } catch {
      return isoStr
    }
  }

  const handleCopyKey = (keyToCopy: string) => {
    if (!keyToCopy) return
    navigator.clipboard.writeText(keyToCopy)
    setCopiedKey(keyToCopy)
    setTimeout(() => setCopiedKey(null), 2500)
  }

  const handleCreateIncidentFromPanel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIncidentDesc.trim() || newIncidentDesc.trim().length < 3) {
      setIncidentError('Informe uma descrição para o imprevisto (mínimo de 3 caracteres).')
      return
    }

    setIncidentError(null)
    setIsSubmittingIncident(true)
    try {
      const formData = new FormData()
      formData.append('category', newIncidentCat)
      formData.append('description', newIncidentDesc.trim())

      const res = await reportTripIncidentAction(activeTrip.id, formData)
      if (res?.error) {
        setIncidentError(res.error)
        return
      }
      if (res?.sefaz_metadata) {
        setModalTrip((prev: any) => ({ ...prev, sefaz_metadata: res.sefaz_metadata }))
        if (onTripMetadataUpdated) onTripMetadataUpdated(activeTrip.id, res.sefaz_metadata)
      }
      setNewIncidentDesc('')
      setShowAddIncident(false)
    } catch (err: any) {
      setIncidentError(err?.message || 'Erro ao registrar imprevisto.')
    } finally {
      setIsSubmittingIncident(false)
    }
  }

  const handleResolveIncident = async (incidentId: string) => {
    setIncidentError(null)
    setResolvingIncidentId(incidentId)
    try {
      const notes = resolutionNotesMap[incidentId]?.trim() || undefined
      const res = await resolveTripIncidentAction(activeTrip.id, incidentId, notes)
      if (res?.error) {
        setIncidentError(res.error)
        return
      }
      if (res?.sefaz_metadata) {
        setModalTrip((prev: any) => ({ ...prev, sefaz_metadata: res.sefaz_metadata }))
        if (onTripMetadataUpdated) onTripMetadataUpdated(activeTrip.id, res.sefaz_metadata)
      }
    } catch (err: any) {
      setIncidentError(err?.message || 'Erro ao resolver imprevisto.')
    } finally {
      setResolvingIncidentId(null)
    }
  }

  let recipientsList: Array<{ name: string; destination: string; invoices?: string; cnpj?: string | null }> = []
  if (Array.isArray(trip.recipients)) {
    recipientsList = trip.recipients
  } else if (typeof trip.recipients === 'string') {
    try {
      recipientsList = JSON.parse(trip.recipients)
    } catch {
      recipientsList = []
    }
  }

  const filteredCtes = ctesList.filter((cte) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    const matchNumber = cte.nCT?.toLowerCase().includes(term)
    const matchKey = cte.chCTe?.toLowerCase().includes(term)
    const matchDest = (cte.remCidade || '').toLowerCase().includes(term) || (cte.destCnpj || '').includes(term)
    const matchInvoices = cte.invoices?.some((inv: string) => inv.toLowerCase().includes(term))
    return matchNumber || matchKey || matchDest || matchInvoices
  })

  const portalSefazUrl = (key?: string) =>
    key
      ? `https://dfe-portal.svrs.rs.gov.br/cte/consulta?chave=${key}`
      : 'https://dfe-portal.svrs.rs.gov.br/cte/consulta'

  const getEventVisuals = (ev: TripAuditEvent) => {
    switch (ev.type) {
      case 'CREATED':
        return {
          dotClass: 'bg-slate-700 border-slate-200 text-white',
          cardBorder: 'border-stone-200 bg-white',
          icon: <FileText className="w-3.5 h-3.5" />,
        }
      case 'DRIVER_ASSIGNED':
      case 'DRIVER_AUTH':
      case 'TELEGRAM_LINKED':
        return {
          dotClass: 'bg-sky-600 border-sky-100 text-white',
          cardBorder: 'border-sky-200/80 bg-sky-50/20',
          icon: <User className="w-3.5 h-3.5" />,
        }
      case 'ARRIVED':
        return {
          dotClass: 'bg-[#0D9488] border-teal-100 text-white',
          cardBorder: 'border-teal-200 bg-teal-50/30',
          icon: <MapPin className="w-3.5 h-3.5" />,
        }
      case 'FINISHED':
        return {
          dotClass: 'bg-emerald-600 border-emerald-100 text-white',
          cardBorder: 'border-emerald-200 bg-emerald-50/30',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        }
      case 'INCIDENT_REPORTED':
      case 'INCIDENT_UPDATED':
        return {
          dotClass: 'bg-amber-500 border-amber-100 text-white',
          cardBorder: 'border-amber-300 bg-amber-50/50',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
        }
      case 'INCIDENT_RESOLVED':
        return {
          dotClass: 'bg-emerald-600 border-emerald-100 text-white',
          cardBorder: 'border-emerald-200 bg-emerald-50/30',
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
        }
      case 'ARRIVAL_REVERTED':
      case 'FINISH_REVERTED':
      case 'TRIP_CANCELLED':
        return {
          dotClass: 'bg-red-600 border-red-100 text-white',
          cardBorder: 'border-red-200 bg-red-50/30',
          icon: <RotateCcw className="w-3.5 h-3.5" />,
        }
      default:
        return {
          dotClass: 'bg-stone-500 border-stone-200 text-white',
          cardBorder: 'border-stone-200 bg-white',
          icon: <Clock className="w-3.5 h-3.5" />,
        }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-[#E7E5E4] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7E5E4] bg-[#FAFAF9]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-teal-50 text-[#0D9488] border border-teal-100">
              {isManifest ? <Truck className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif-title text-lg font-bold text-[#1C1917]">
                  {isManifest
                    ? trip.cte_number || `Romaneio ${sefazMeta.plate || 'SSW'}`
                    : trip.cte_number
                    ? `CT-e nº ${trip.cte_number}`
                    : `Transporte #${trip.token}`}
                </h3>
                {isManifest ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                    <Layers className="w-3 h-3" /> Romaneio SSW
                  </span>
                ) : isSefaz ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                    <FileCheck2 className="w-3 h-3" /> SEFAZ DFe
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-stone-100 text-stone-700 border border-stone-200 uppercase">
                    Manual
                  </span>
                )}
                {openIncidentsCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-100 text-amber-900 border border-amber-300 uppercase">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    {openIncidentsCount} Imprevisto(s) em Aberto
                  </span>
                )}
              </div>
              <p className="text-xs text-[#78716C] font-mono mt-0.5">
                Token AuditCargo: <strong className="text-[#1C1917]">{trip.token}</strong>
                {isManifest && ctesList.length > 0 && ` • ${ctesList.length} CT-es embarcados`}
                {sefazMeta.issue_date && ` • Emissão: ${new Date(sefazMeta.issue_date).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F5F4] rounded-lg transition-colors cursor-pointer"
            title="Fechar detalhes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Abas: Dados da Carga vs. Linha do Tempo & Imprevistos */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#E7E5E4] bg-[#FAFAF9]">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'details'
                ? 'border-[#0D9488] text-[#0D9488] bg-white rounded-t-lg'
                : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Dados Fiscais & Carga</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'timeline'
                ? 'border-[#0D9488] text-[#0D9488] bg-white rounded-t-lg'
                : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Linha do Tempo & Imprevistos</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-stone-200 text-stone-800">
              {timelineEvents.length}
            </span>
            {openIncidentsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500 text-white animate-pulse">
                ! {openIncidentsCount}
              </span>
            )}
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
          {activeTab === 'details' ? (
            <>
              {/* Alerta Rápido se houver Imprevisto Aberto */}
              {openIncidentsCount > 0 && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-amber-950">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold block">
                        Atenção: Este transporte possui {openIncidentsCount} imprevisto(s) aguardando tratativa!
                      </span>
                      <span className="text-amber-800">
                        Último relato: {incidents[incidents.length - 1]?.categoryLabel} — &ldquo;
                        {incidents[incidents.length - 1]?.description}&rdquo;
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('timeline')}
                    className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Ver & Tratar Agora
                  </button>
                </div>
              )}

              {/* Cartões Rápidos de Resumo Operacional */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
                  <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                    <Scale className="w-3.5 h-3.5 text-[#0D9488]" /> Peso Real (Balança)
                  </div>
                  <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                    {formatWeight(sefazMeta.total_weight_kg || sefazMeta.weight_kg)}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
                  <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                    <Boxes className="w-3.5 h-3.5 text-blue-600" />
                    {sefazMeta.total_calculated_weight_kg ? 'Peso Cálculo' : 'Cubagem'}
                  </div>
                  <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                    {sefazMeta.total_calculated_weight_kg
                      ? formatWeight(sefazMeta.total_calculated_weight_kg)
                      : sefazMeta.total_cubagem_m3
                      ? `${Number(sefazMeta.total_cubagem_m3).toFixed(3)} m³`
                      : isManifest
                      ? `${ctesList.length} CT-es`
                      : formatMoney(sefazMeta.cargo_value)}
                  </div>
                  {sefazMeta.total_cubagem_m3 ? (
                    <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                      Cubagem: {Number(sefazMeta.total_cubagem_m3).toFixed(3)} m³
                    </div>
                  ) : null}
                </div>

                <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
                  <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Valor Frete Total
                  </div>
                  <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                    {formatMoney(sefazMeta.freight_value)}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
                  <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                    <Truck className="w-3.5 h-3.5 text-amber-600" /> Placa / Veículo
                  </div>
                  <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                    {sefazMeta.plate || trip.drivers?.default_plate || '—'}
                  </div>
                </div>
              </div>

              {/* SEÇÃO PRINCIPAL: SE FOR UM ROMANEIO COM MÚLTIPLTIPLOS CT-ES */}
              {isManifest && ctesList.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#E7E5E4] pb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#0D9488]" />
                      <span className="font-bold text-[#1C1917] text-sm">
                        CT-es Embarcados neste Romaneio ({ctesList.length})
                      </span>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filtrar por CT-e, chave ou NF..."
                        className="w-full pl-8 pr-3 py-1 text-xs rounded-md border border-[#E7E5E4] bg-[#FAFAF9] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {filteredCtes.map((c: any, idx: number) => {
                      const isCurrentCopied = copiedKey === c.chCTe
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border border-[#E7E5E4] bg-white hover:border-[#0D9488]/40 transition-colors shadow-2xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#0F172A] text-sm">
                                CT-e #{c.nCT}
                              </span>
                              {c.serie && (
                                <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded">
                                  Série {c.serie}
                                </span>
                              )}
                              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-semibold">
                                Frete: {formatMoney(c.vFrete)}
                              </span>
                              {c.weightKg !== undefined && c.weightKg !== null && (
                                <span
                                  className="text-[11px] font-mono text-stone-600 bg-stone-50 px-1.5 py-0.2 rounded border border-stone-200"
                                  title="Peso Real (Balança)"
                                >
                                  Real: {formatWeight(c.weightKg)}
                                </span>
                              )}
                              {c.pesoCalculoKg !== undefined &&
                                c.pesoCalculoKg !== null &&
                                c.pesoCalculoKg !== c.weightKg && (
                                  <span
                                    className="text-[11px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200"
                                    title="Peso Base de Cálculo (Cubado)"
                                  >
                                    Cálculo: {formatWeight(c.pesoCalculoKg)}
                                  </span>
                                )}
                              {c.cubagemM3 !== undefined && c.cubagemM3 !== null && c.cubagemM3 > 0 && (
                                <span
                                  className="text-[11px] font-mono text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200"
                                  title="Volume em metros cúbicos"
                                >
                                  {Number(c.cubagemM3).toFixed(3)} m³
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-stone-600 flex-wrap">
                              {c.destNome && (
                                <span className="font-medium text-[#1C1917]">
                                  Para: <strong>{c.destNome}</strong>
                                </span>
                              )}
                              {(c.destCidade || (c.destUf && c.destUf !== 'PS')) && (
                                <div className="flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50/70 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                  <MapPin className="w-3 h-3 text-emerald-600" />
                                  <span>
                                    {c.destCidade
                                      ? `${c.destCidade}${c.destUf && c.destUf !== 'PS' ? `/${c.destUf}` : ''}`
                                      : `UF: ${c.destUf}`}
                                  </span>
                                </div>
                              )}
                              {c.destCnpj && (
                                <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded border border-stone-200">
                                  CNPJ: {formatCNPJ(c.destCnpj)}
                                </span>
                              )}
                            </div>
                          </div>

                          {c.invoices && c.invoices.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[11px] font-mono text-stone-400">NFs:</span>
                              {c.invoices.map((inv: string, i: number) => (
                                <span
                                  key={i}
                                  className="text-[10px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded border border-stone-200"
                                >
                                  {inv}
                                </span>
                              ))}
                            </div>
                          )}

                          {c.chCTe && (
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100 text-[11px]">
                              <span className="font-mono text-stone-500 truncate" title={c.chCTe}>
                                Chave: {formatCteKey(c.chCTe)}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyKey(c.chCTe)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-stone-50 text-stone-700 border border-stone-200 hover:bg-stone-100 transition-colors"
                                >
                                  {isCurrentCopied ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-600" /> Copiado!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" /> Copiar Chave
                                    </>
                                  )}
                                </button>
                                <a
                                  href={portalSefazUrl(c.chCTe)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors"
                                >
                                  <span>SEFAZ</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Chave de Acesso SEFAZ para CT-e Único */}
              {!isManifest && trip.cte_key && (
                <div className="p-4 rounded-lg bg-teal-50/60 border border-teal-200/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase font-bold text-[#0F766E] flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4" /> Chave de Acesso do CT-e (44 dígitos)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyKey(trip.cte_key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-white text-[#0F766E] border border-teal-300 hover:bg-teal-50 transition-colors shadow-2xs"
                      >
                        {copiedKey === trip.cte_key ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copiar
                          </>
                        )}
                      </button>
                      <a
                        href={portalSefazUrl(trip.cte_key)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-[#0D9488] text-white hover:bg-[#0F766E] transition-colors shadow-2xs"
                        title="Consultar CT-e no Portal da Fazenda"
                      >
                        <span>Portal SEFAZ</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <div className="font-mono text-xs text-[#0F172A] tracking-wider bg-white/80 p-2.5 rounded border border-teal-200 select-all">
                    {formatCteKey(trip.cte_key)}
                  </div>
                </div>
              )}

              {/* Remetente vs. Destinatários */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-[#E7E5E4] bg-white space-y-2">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase text-[#78716C] font-semibold border-b border-[#F5F5F4] pb-2">
                    <Building2 className="w-4 h-4 text-[#0D9488]" />
                    <span>Remetente (Origem)</span>
                  </div>
                  <div className="font-bold text-[#1C1917]">
                    {trip.sender || sefazMeta.sender_name || 'Remetente não informado'}
                  </div>
                  {(sefazMeta.sender_cnpj || ctesList[0]?.remCnpj || (trip as any).senders?.cnpj) && (
                    <div className="text-xs text-[#78716C] font-mono">
                      CNPJ: {formatCNPJ(sefazMeta.sender_cnpj || ctesList[0]?.remCnpj || (trip as any).senders?.cnpj)}
                    </div>
                  )}
                  {(ctesList[0]?.remCidade || sefazMeta.sender_city || sefazMeta.origin_city) && (
                    <div className="text-xs text-[#57534E] flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#A8A29E] shrink-0" />
                      <span>
                        {ctesList[0]?.remCidade
                          ? `${ctesList[0].remCidade}${ctesList[0].remUf ? `/${ctesList[0].remUf}` : ''}`
                          : sefazMeta.sender_city
                          ? `${sefazMeta.sender_city}${sefazMeta.sender_uf ? `/${sefazMeta.sender_uf}` : ''}`
                          : sefazMeta.origin_city}
                      </span>
                    </div>
                  )}
                  {sefazMeta.emitter_name && (
                    <div className="text-[11px] text-[#A8A29E] font-mono pt-1.5 border-t border-stone-100 mt-1.5">
                      Transportadora: {sefazMeta.emitter_name}{' '}
                      {sefazMeta.emitter_cnpj ? `(${formatCNPJ(sefazMeta.emitter_cnpj)})` : ''}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg border border-[#E7E5E4] bg-white space-y-2">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase text-[#78716C] font-semibold border-b border-[#F5F5F4] pb-2">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>Destino / Entrega</span>
                  </div>
                  <div className="font-bold text-[#1C1917]">
                    {trip.destination && !trip.destination.includes('/PS')
                      ? trip.destination
                      : ctesList[0]?.destCidade
                      ? `${ctesList[0].destCidade}${
                          ctesList[0].destUf && ctesList[0].destUf !== 'PS' ? `/${ctesList[0].destUf}` : ''
                        }`
                      : 'Destino conforme CT-e'}
                  </div>
                  {((recipientsList.length > 0 &&
                    recipientsList[0].name &&
                    !recipientsList[0].name.startsWith('Destinatário (')) ||
                    ctesList[0]?.destNome) && (
                    <div className="text-xs text-[#57534E]">
                      Destinatário:{' '}
                      <strong>
                        {(!recipientsList[0]?.name?.startsWith('Destinatário (') ? recipientsList[0]?.name : null) ||
                          ctesList[0]?.destNome ||
                          recipientsList[0]?.name}
                      </strong>
                    </div>
                  )}
                  {((recipientsList.length > 0 && recipientsList[0].cnpj) || ctesList[0]?.destCnpj) && (
                    <div className="text-xs text-[#78716C] font-mono">
                      CNPJ: {formatCNPJ(recipientsList[0]?.cnpj || ctesList[0]?.destCnpj)}
                    </div>
                  )}
                  {recipientsList.length > 0 &&
                    recipientsList[0].destination &&
                    !recipientsList[0].destination.includes('Estado PS') && (
                      <div className="text-xs text-[#78716C] font-mono">{recipientsList[0].destination}</div>
                    )}
                </div>
              </div>

              {/* Motorista & Veículo */}
              <div className="p-4 rounded-lg border border-[#E7E5E4] bg-white space-y-3">
                <div className="text-xs font-mono uppercase text-[#78716C] font-semibold border-b border-[#F5F5F4] pb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#0D9488]" />
                    <span>Motorista & Veículo</span>
                  </div>
                  {sefazMeta.plate && (
                    <span className="text-[11px] font-mono text-stone-500">
                      Placa: <strong className="text-[#0F172A]">{sefazMeta.plate}</strong>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[#78716C] block mb-1.5">Motorista Designado:</span>
                    {allDrivers && allDrivers.length > 0 ? (
                      <DriverQuickAssignCell
                        trip={activeTrip}
                        allTrips={allTrips}
                        allDrivers={allDrivers}
                        onDriverAssigned={(tripId, driver) => {
                          setModalTrip((prev: any) => ({
                            ...prev,
                            driver_id: driver.id,
                            drivers: driver,
                          }))
                          if (onDriverAssigned) onDriverAssigned(tripId, driver)
                        }}
                      />
                    ) : (
                      <div>
                        <p className="font-bold text-[#1C1917] text-sm">
                          {activeTrip.drivers?.name || (
                            <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                              Pendente de motorista
                            </span>
                          )}
                        </p>
                        {activeTrip.drivers?.phone && (
                          <p className="text-[#78716C] font-mono mt-0.5">Tel: {activeTrip.drivers.phone}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-[#78716C] block mb-1">Observações Operacionais:</span>
                    <p className="font-mono text-[#1C1917] text-xs">
                      {sefazMeta.observations || `Placa: ${sefazMeta.plate || '—'}`}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ============================================================================
               ABA 2: LINHA DO TEMPO 360º E GESTÃO DE IMPREVISTOS / SINISTROS
               ============================================================================ */
            <div className="space-y-6">
              {incidentError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {incidentError}
                  </span>
                  <button type="button" onClick={() => setIncidentError(null)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 1. Painel de Imprevistos / Sinistros */}
              <div className="p-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF9] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E7E5E4] pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-[#1C1917] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Gestão de Imprevistos & Sinistros da Entrega ({incidents.length})</span>
                    </h4>
                    <p className="text-xs text-[#78716C] mt-0.5">
                      Ocorrências reportadas pelo motorista (Telegram / Link Web) ou registradas pela central.
                    </p>
                  </div>

                  {!showAddIncident && (
                    <button
                      type="button"
                      onClick={() => setShowAddIncident(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-2xs transition-colors shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Registrar Imprevisto</span>
                    </button>
                  )}
                </div>

                {/* Formulário para operador/admin registrar imprevisto no painel */}
                {showAddIncident && (
                  <form
                    onSubmit={handleCreateIncidentFromPanel}
                    className="p-4 rounded-lg bg-white border border-amber-300 space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-950 uppercase font-mono">
                        Novo Registro de Imprevisto / Sinistro (Central)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddIncident(false)}
                        className="text-stone-400 hover:text-stone-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-[#57534E] block mb-1">
                          Categoria do Problema
                        </label>
                        <select
                          value={newIncidentCat}
                          onChange={(e) => setNewIncidentCat(e.target.value as IncidentCategory)}
                          className="w-full h-9 rounded-md border border-[#D6D3D1] bg-[#FAFAF9] px-2.5 text-xs text-[#1C1917] font-medium"
                        >
                          {(Object.keys(INCIDENT_CATEGORIES) as IncidentCategory[]).map((key) => (
                            <option key={key} value={key}>
                              {INCIDENT_CATEGORIES[key].icon} {INCIDENT_CATEGORIES[key].label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-[#57534E] block mb-1">
                          Descrição / Detalhamento da Ocorrência
                        </label>
                        <input
                          type="text"
                          value={newIncidentDesc}
                          onChange={(e) => setNewIncidentDesc(e.target.value)}
                          placeholder="Ex: Nota Fiscal 10492 vencida na portaria do cliente..."
                          className="w-full h-9 rounded-md border border-[#D6D3D1] bg-white px-3 text-xs text-[#1C1917]"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddIncident(false)}
                        className="px-3 py-1.5 rounded-md border border-[#D6D3D1] text-xs font-medium text-[#57534E] hover:bg-stone-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingIncident}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
                      >
                        {isSubmittingIncident ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Salvar Imprevisto</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Lista de Imprevistos */}
                {incidents.length === 0 ? (
                  <div className="text-center py-6 bg-white rounded-lg border border-dashed border-[#D6D3D1] text-xs text-[#78716C]">
                    Nenhum imprevisto ou sinistro registrado nesta viagem até o momento.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {incidents.map((inc) => {
                      const catInfo = INCIDENT_CATEGORIES[inc.category] || INCIDENT_CATEGORIES.outros
                      const chInfo = AUDIT_CHANNEL_LABELS[inc.channel] || AUDIT_CHANNEL_LABELS.sistema
                      const isResolved = inc.status === 'resolved'

                      return (
                        <div
                          key={inc.id}
                          className={`p-3.5 rounded-lg border space-y-2 transition-all ${
                            isResolved
                              ? 'bg-white border-stone-200'
                              : 'bg-amber-50/70 border-amber-300 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-[#1C1917]">
                                {catInfo.icon} {inc.categoryLabel}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${chInfo.badgeClass}`}
                              >
                                {chInfo.label}
                              </span>
                              <span className="text-[11px] text-[#78716C] font-mono">
                                por <strong>{inc.reportedBy}</strong> em {formatFullDateTime(inc.createdAt)}
                              </span>
                            </div>

                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                isResolved
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-amber-200 text-amber-950 border-amber-400'
                              }`}
                            >
                              {isResolved ? '✅ Tratado / Resolvido' : '⏳ Pendente de Tratativa'}
                            </span>
                          </div>

                          <p className="text-xs text-[#1C1917] bg-white/90 p-2.5 rounded border border-stone-200/80 leading-relaxed">
                            {inc.description}
                          </p>

                          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                            <div className="flex items-center gap-3">
                              {inc.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setViewingPhoto(inc.photoUrl!)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D9488] hover:underline"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Ver Foto / Evidência do Problema</span>
                                </button>
                              )}
                              {inc.lat && inc.lng && (
                                <a
                                  href={`https://www.google.com/maps?q=${inc.lat},${inc.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-mono text-emerald-700 hover:underline"
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                  <span>
                                    GPS ({inc.lat.toFixed(4)}, {inc.lng.toFixed(4)})
                                  </span>
                                </a>
                              )}
                            </div>

                            {!isResolved ? (
                              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <input
                                  type="text"
                                  value={resolutionNotesMap[inc.id] || ''}
                                  onChange={(e) =>
                                    setResolutionNotesMap((prev) => ({ ...prev, [inc.id]: e.target.value }))
                                  }
                                  placeholder="Observação da tratativa (opcional)..."
                                  className="h-8 px-2.5 rounded border border-amber-300 bg-white text-xs text-[#1C1917] flex-1 sm:w-64"
                                />
                                <button
                                  type="button"
                                  disabled={resolvingIncidentId === inc.id}
                                  onClick={() => handleResolveIncident(inc.id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 disabled:opacity-50 cursor-pointer"
                                >
                                  {resolvingIncidentId === inc.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>Marcar Tratado</span>
                                </button>
                              </div>
                            ) : (
                              <div className="text-[11px] font-mono text-emerald-800">
                                Resolvido por <strong>{inc.resolvedBy || 'Central'}</strong>
                                {inc.resolvedAt ? ` em ${formatFullDateTime(inc.resolvedAt)}` : ''}
                                {inc.resolutionNotes ? ` — "${inc.resolutionNotes}"` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 2. Linha do Tempo 360º (Histórico Completo de Rastreabilidade) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#E7E5E4] pb-2">
                  <div>
                    <h4 className="text-sm font-bold text-[#1C1917] flex items-center gap-2">
                      <History className="w-4 h-4 text-[#0D9488]" />
                      <span>Log de Rastreabilidade Completa da Viagem ({timelineEvents.length} eventos)</span>
                    </h4>
                    <p className="text-xs text-[#78716C]">
                      Histórico cronológico auditável desde a criação do transporte até a liberação final.
                    </p>
                  </div>
                </div>

                <div className="relative pl-6 space-y-3 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E7E5E4]">
                  {timelineEvents.map((ev) => {
                    const visuals = getEventVisuals(ev)
                    const chBadge = AUDIT_CHANNEL_LABELS[ev.channel] || AUDIT_CHANNEL_LABELS.sistema

                    return (
                      <div key={ev.id} className="relative">
                        {/* Ponto na Linha do Tempo */}
                        <div
                          className={`absolute -left-6 top-2.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-2xs ${visuals.dotClass}`}
                        >
                          {visuals.icon}
                        </div>

                        {/* Card do Evento */}
                        <div className={`p-3.5 rounded-lg border shadow-2xs space-y-1.5 ${visuals.cardBorder}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#1C1917] text-xs">{ev.title}</span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-semibold ${chBadge.badgeClass}`}
                              >
                                {chBadge.label}
                              </span>
                            </div>

                            <span className="text-[11px] font-mono text-[#57534E] font-semibold">
                              {formatFullDateTime(ev.timestamp)}
                            </span>
                          </div>

                          {ev.description && (
                            <p className="text-xs text-[#44403C] leading-relaxed">{ev.description}</p>
                          )}

                          <div className="flex items-center justify-between gap-3 flex-wrap pt-0.5 text-[11px] font-mono text-[#78716C]">
                            <span>
                              Responsável / Autor: <strong className="text-[#1C1917]">{ev.actor}</strong>
                            </span>

                            <div className="flex items-center gap-3">
                              {ev.lat && ev.lng && (
                                <a
                                  href={`https://www.google.com/maps?q=${ev.lat},${ev.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-semibold"
                                >
                                  <MapPin className="w-3 h-3" />
                                  <span>
                                    Mapa GPS ({ev.lat.toFixed(4)}, {ev.lng.toFixed(4)})
                                  </span>
                                </a>
                              )}
                              {ev.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setViewingPhoto(ev.photoUrl!)}
                                  className="inline-flex items-center gap-1 text-[#0D9488] hover:underline font-semibold cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Ver Foto Anexada</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E7E5E4] bg-[#FAFAF9]">
          <div className="text-xs text-[#78716C] font-mono flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-[#0D9488]" />
            {isManifest
              ? `Manifesto SSW consolidado (${ctesList.length} CT-es) • ${timelineEvents.length} registros de auditoria`
              : `Rastreabilidade AuditCargo • ${timelineEvents.length} eventos auditados`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-white border border-[#E7E5E4] text-[#1C1917] hover:bg-[#F5F5F4] transition-colors shadow-2xs cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Lightbox de Foto Anexada */}
      {viewingPhoto && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-3.5 bg-[#0F172A] text-white flex items-center justify-between">
              <span className="text-xs font-semibold">Evidência Fotográfica da Viagem</span>
              <button
                type="button"
                onClick={() => setViewingPhoto(null)}
                className="text-stone-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-stone-900 flex items-center justify-center">
              <img
                src={viewingPhoto}
                alt="Evidência da Viagem"
                className="max-h-[75vh] w-auto rounded object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
