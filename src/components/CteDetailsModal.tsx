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
  Calendar,
} from 'lucide-react'

interface CteDetailsModalProps {
  trip: any
  isOpen: boolean
  onClose: () => void
}

export function CteDetailsModal({ trip, isOpen, onClose }: CteDetailsModalProps) {
  const [copiedKey, setCopiedKey] = useState(false)

  if (!isOpen || !trip) return null

  const sefazMeta = trip.sefaz_metadata || {}
  const isSefaz = Boolean(trip.cte_key || trip.cte_number)

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

  const handleCopyKey = () => {
    if (!trip.cte_key) return
    navigator.clipboard.writeText(trip.cte_key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2500)
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

  const portalSefazUrl = trip.cte_key
    ? `https://dfe-portal.svrs.rs.gov.br/cte/consulta?chave=${trip.cte_key}`
    : 'https://dfe-portal.svrs.rs.gov.br/cte/consulta'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-[#E7E5E4] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7E5E4] bg-[#FAFAF9]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-teal-50 text-[#0D9488] border border-teal-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif-title text-lg font-bold text-[#1C1917]">
                  {trip.cte_number ? `CT-e nº ${trip.cte_number}` : `Transporte #${trip.token}`}
                </h3>
                {isSefaz ? (
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
                {sefazMeta.serie && ` • Série: ${sefazMeta.serie}`}
                {sefazMeta.issue_date && ` • Emissão: ${new Date(sefazMeta.issue_date).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F5F4] rounded-lg transition-colors"
            title="Fechar detalhes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Cartões Rápidos de Resumo Operacional */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Peso */}
            <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
              <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                <Scale className="w-3.5 h-3.5 text-[#0D9488]" /> Peso Carga
              </div>
              <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                {formatWeight(sefazMeta.weight_kg)}
              </div>
            </div>

            {/* Valor da Carga */}
            <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
              <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                <Boxes className="w-3.5 h-3.5 text-blue-600" /> Valor Mercadoria
              </div>
              <div className="text-base font-bold text-[#1C1917] font-mono mt-1">
                {formatMoney(sefazMeta.cargo_value)}
              </div>
            </div>

            {/* Valor do Frete */}
            <div className="p-3.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9]">
              <div className="flex items-center gap-1.5 text-xs text-[#78716C] font-mono uppercase">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Valor Frete
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

          {/* Chave de Acesso SEFAZ */}
          {trip.cte_key && (
            <div className="p-4 rounded-lg bg-teal-50/60 border border-teal-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase font-bold text-[#0F766E] flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4" /> Chave de Acesso do CT-e (44 dígitos)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-white text-[#0F766E] border border-teal-300 hover:bg-teal-50 transition-colors shadow-2xs"
                  >
                    {copiedKey ? (
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
                    href={portalSefazUrl}
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
              <div className="p-2.5 bg-white rounded border border-teal-200/70 font-mono text-xs sm:text-sm text-[#0F172A] tracking-wider select-all break-all">
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

          {/* Múltiplos Destinatários (se houver mais de 1) */}
          {recipientsList.length > 1 && (
            <div className="p-4 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] space-y-3">
              <div className="text-xs font-mono uppercase text-[#78716C] font-semibold">
                Paradas / Entregas da Rota ({recipientsList.length})
              </div>
              <div className="space-y-2">
                {recipientsList.map((rec, idx) => (
                  <div key={idx} className="p-2.5 rounded bg-white border border-[#E7E5E4] text-xs space-y-1">
                    <div className="font-bold text-[#1C1917] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-[#0D9488] inline-flex items-center justify-center text-[10px] font-mono">
                        {idx + 1}
                      </span>
                      <span>{rec.name}</span>
                    </div>
                    <div className="text-[#78716C] pl-7 font-mono">{rec.destination}</div>
                    {rec.invoices && (
                      <div className="text-teal-700 pl-7 font-mono text-[11px]">
                        NFs: {rec.invoices}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas Fiscais Vinculadas */}
          <div className="p-4 rounded-lg border border-[#E7E5E4] bg-white space-y-2.5">
            <div className="flex items-center justify-between border-b border-[#F5F5F4] pb-2">
              <span className="text-xs font-mono uppercase text-[#78716C] font-semibold flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-[#0D9488]" />
                Notas Fiscais Transportadas ({trip.invoices?.length || 0})
              </span>
              {sefazMeta.cargo_type && (
                <span className="text-xs font-mono text-[#78716C]">
                  Produto: <strong className="text-[#1C1917]">{sefazMeta.cargo_type}</strong>
                </span>
              )}
            </div>

            {trip.invoices && trip.invoices.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {trip.invoices.map((inv: string, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-1 rounded bg-[#F5F5F4] text-[#1C1917] font-mono text-xs border border-[#E7E5E4]"
                  >
                    NF {inv}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#A8A29E] italic">Nenhuma nota fiscal declarada individualmente.</p>
            )}
          </div>

          {/* Motorista & Rastreabilidade */}
          <div className="p-4 rounded-lg border border-[#E7E5E4] bg-white space-y-3">
            <div className="text-xs font-mono uppercase text-[#78716C] font-semibold border-b border-[#F5F5F4] pb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#0D9488]" />
              <span>Motorista & Operação</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#78716C]">Motorista Designado:</span>
                <p className="font-bold text-[#1C1917] text-sm mt-0.5">
                  {trip.drivers?.name || 'Motorista provisório (SEFAZ)'}
                </p>
                {trip.drivers?.phone && (
                  <p className="text-[#78716C] font-mono mt-0.5">Tel: {trip.drivers.phone}</p>
                )}
              </div>
              <div>
                <span className="text-[#78716C]">Registro ANTT / RNTRC:</span>
                <p className="font-mono text-[#1C1917] text-sm mt-0.5">
                  {sefazMeta.rntrc || '—'}
                </p>
                {sefazMeta.observations && (
                  <p className="text-[11px] text-[#78716C] truncate mt-0.5" title={sefazMeta.observations}>
                    Obs: {sefazMeta.observations}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E7E5E4] bg-[#FAFAF9]">
          <div className="text-xs text-[#78716C] font-mono flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-[#0D9488]" />
            Dados obtidos por recepção do CT-e oficial SEFAZ
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-white border border-[#E7E5E4] text-[#1C1917] hover:bg-[#F5F5F4] transition-colors shadow-2xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
