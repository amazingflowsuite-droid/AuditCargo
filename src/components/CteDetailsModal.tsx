'use client'

import React, { useState, useMemo } from 'react'
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
  Calendar,
  Search,
  Layers,
} from 'lucide-react'

import { DriverQuickAssignCell } from './DriverQuickAssignCell'

interface CteDetailsModalProps {
  trip: any
  isOpen: boolean
  onClose: () => void
  allTrips?: any[]
  allDrivers?: any[]
  onDriverAssigned?: (tripId: string, assignedDriver: any) => void
}

export function CteDetailsModal({
  trip,
  isOpen,
  onClose,
  allTrips = [],
  allDrivers = [],
  onDriverAssigned,
}: CteDetailsModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [modalTrip, setModalTrip] = useState<any>(trip)

  React.useEffect(() => {
    setModalTrip(trip)
  }, [trip])

  if (!isOpen || !modalTrip) return null

  const activeTrip = modalTrip
  const sefazMeta = activeTrip.sefaz_metadata || {}
  const isManifest = Boolean(sefazMeta.is_manifest || (sefazMeta.ctes && sefazMeta.ctes.length > 0))
  const ctesList: any[] = sefazMeta.ctes || []
  const isSefaz = Boolean(activeTrip.cte_key || activeTrip.cte_number || isManifest)


  // Formatação de valores monetários
  const formatMoney = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  // Formatação de peso
  const formatWeight = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—'
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val) + ' kg'
  }

  // Formata chave de acesso de 44 dígitos em grupos legíveis de 4
  const formatCteKey = (key?: string) => {
    if (!key) return '—'
    return key.replace(/(\d{4})/g, '$1 ').trim()
  }

  const handleCopyKey = (keyToCopy: string) => {
    if (!keyToCopy) return
    navigator.clipboard.writeText(keyToCopy)
    setCopiedKey(keyToCopy)
    setTimeout(() => setCopiedKey(null), 2500)
  }

  // Destinatários parseados
  let recipientsList: Array<{ name: string; destination: string; invoices?: string }> = []
  if (Array.isArray(trip.recipients)) {
    recipientsList = trip.recipients
  } else if (typeof trip.recipients === 'string') {
    try {
      recipientsList = JSON.parse(trip.recipients)
    } catch {
      recipientsList = []
    }
  }

  // Filtro interno de CT-es do Romaneio
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
              <div className="flex items-center gap-2">
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

        {/* Corpo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Cartões Rápidos de Resumo Operacional */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Peso Real */}
            <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
              <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                <Scale className="w-3.5 h-3.5 text-[#0D9488]" /> Peso Real (Balança)
              </div>
              <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                {formatWeight(sefazMeta.total_weight_kg || sefazMeta.weight_kg)}
              </div>
            </div>

            {/* Peso Cálculo / Cubagem */}
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

            {/* Valor do Frete */}
            <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
              <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Valor Frete Total
              </div>
              <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                {formatMoney(sefazMeta.freight_value)}
              </div>
            </div>

            {/* Placa & Veículo */}
            <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
              <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                <Truck className="w-3.5 h-3.5 text-amber-600" /> Placa / Veículo
              </div>
              <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                {sefazMeta.plate || trip.drivers?.default_plate || '—'}
              </div>
            </div>
          </div>

          {/* SEÇÃO PRINCIPAL: SE FOR UM ROMANEIO COM MÚLTIPLOS CT-ES */}
          {isManifest && ctesList.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#E7E5E4] pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#0D9488]" />
                  <span className="font-bold text-[#1C1917] text-sm">
                    CT-es Embarcados neste Romaneio ({ctesList.length})
                  </span>
                </div>
                {/* Campo de Busca Rápida de CT-e ou NF */}
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

              {/* Lista dos CT-es */}
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
                            <span className="text-[11px] font-mono text-stone-600 bg-stone-50 px-1.5 py-0.2 rounded border border-stone-200" title="Peso Real (Balança)">
                              Real: {formatWeight(c.weightKg)}
                            </span>
                          )}
                          {c.pesoCalculoKg !== undefined && c.pesoCalculoKg !== null && c.pesoCalculoKg !== c.weightKg && (
                            <span className="text-[11px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200" title="Peso Base de Cálculo (Cubado)">
                              Cálculo: {formatWeight(c.pesoCalculoKg)}
                            </span>
                          )}
                          {c.cubagemM3 !== undefined && c.cubagemM3 !== null && c.cubagemM3 > 0 && (
                            <span className="text-[11px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200" title="Volume em metros cúbicos">
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
                          {(c.destCidade || c.destUf) && (
                            <div className="flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50/70 px-1.5 py-0.5 rounded border border-emerald-200/60">
                              <MapPin className="w-3 h-3 text-emerald-600" />
                              <span>{c.destCidade ? `${c.destCidade}${c.destUf ? `/${c.destUf}` : ''}` : `UF: ${c.destUf}`}</span>
                            </div>
                          )}
                          {c.destCnpj && (
                            <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded border border-stone-200">
                              CNPJ: {c.destCnpj}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* NFs Transportadas neste CT-e */}
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

                      {/* Chave de Acesso do CT-e com Botão de Cópia */}
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
            {/* Remetente (Origem) */}
            <div className="p-4 rounded-lg border border-[#E7E5E4] bg-white space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-[#78716C] font-semibold border-b border-[#F5F5F4] pb-2">
                <Building2 className="w-4 h-4 text-[#0D9488]" />
                <span>Remetente (Origem)</span>
              </div>
              <div className="font-bold text-[#1C1917]">{trip.sender || 'Remetente não informado'}</div>
              {sefazMeta.emitter_cnpj && (
                <div className="text-xs text-[#78716C] font-mono">
                  CNPJ: {sefazMeta.emitter_cnpj}
                </div>
              )}
              {sefazMeta.origin_city && (
                <div className="text-xs text-[#57534E] flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#A8A29E] shrink-0" />
                  <span>{sefazMeta.origin_city}</span>
                </div>
              )}
            </div>

            {/* Destinatário Principal (Destino) */}
            <div className="p-4 rounded-lg border border-[#E7E5E4] bg-white space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-[#78716C] font-semibold border-b border-[#F5F5F4] pb-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Destino / Entrega</span>
              </div>
              <div className="font-bold text-[#1C1917]">{trip.destination || 'Destino conforme CT-e'}</div>
              {recipientsList.length > 0 && recipientsList[0].name && (
                <div className="text-xs text-[#57534E]">
                  Destinatário: <strong>{recipientsList[0].name}</strong>
                </div>
              )}
              {recipientsList.length > 0 && recipientsList[0].destination && (
                <div className="text-xs text-[#78716C] font-mono">
                  {recipientsList[0].destination}
                </div>
              )}
            </div>
          </div>

          {/* Motorista & Rastreabilidade */}
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
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E7E5E4] bg-[#FAFAF9]">
          <div className="text-xs text-[#78716C] font-mono flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-[#0D9488]" />
            {isManifest
              ? `Manifesto SSW consolidado (${ctesList.length} CT-es)`
              : 'Dados obtidos por recepção do CT-e oficial SEFAZ'}
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
    </div>
  )
}
