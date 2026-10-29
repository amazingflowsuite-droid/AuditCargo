'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  User,
  Sparkles,
  Check,
  ChevronDown,
  Search,
  Clock,
  Car,
  AlertCircle,
  Plus,
  Loader2,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react'
import { assignDriverAction } from '@/app/actions'

export interface DriverSuggestion {
  driver: any
  reason: 'default_plate' | 'last_driver' | 'frequent_driver'
  label: string
  tripCount?: number
  lastTripDate?: string
}

export function computeDriverSuggestions(
  plate: string | null | undefined,
  allTrips: any[],
  allDrivers: any[]
): {
  topSuggestion: DriverSuggestion | null
  vehicleHistory: DriverSuggestion[]
  otherDrivers: any[]
} {
  const cleanPlate = (plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

  if (!cleanPlate || cleanPlate.length < 5 || !allDrivers || allDrivers.length === 0) {
    return {
      topSuggestion: null,
      vehicleHistory: [],
      otherDrivers: allDrivers || [],
    }
  }

  // 1. Verifica se algum motorista é o "Titular" cadastrado para essa placa
  const titularDriver = allDrivers.find((d) => {
    const dp = (d.default_plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return dp.length >= 5 && dp === cleanPlate
  })

  // 2. Analisa o histórico de viagens para esta placa
  const driverTripMap = new Map<
    string,
    {
      driver: any
      count: number
      lastDate: string
    }
  >()

  if (Array.isArray(allTrips)) {
    for (const t of allTrips) {
      if (!t.driver_id) continue
      const tripPlate = (t.sefaz_metadata?.plate || t.drivers?.default_plate || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()

      if (tripPlate === cleanPlate) {
        // Encontra o objeto completo do motorista em allDrivers ou usa o do trip
        const matchedDriver = allDrivers.find((d) => d.id === t.driver_id) || t.drivers
        if (!matchedDriver || !matchedDriver.name) continue

        const dId = t.driver_id
        const tripDate = t.completion_time || t.arrival_time || t.created_at || ''
        const existing = driverTripMap.get(dId)

        if (!existing) {
          driverTripMap.set(dId, {
            driver: { ...matchedDriver, id: dId },
            count: 1,
            lastDate: tripDate,
          })
        } else {
          existing.count += 1
          if (tripDate && (!existing.lastDate || new Date(tripDate) > new Date(existing.lastDate))) {
            existing.lastDate = tripDate
          }
        }
      }
    }
  }

  // Ordena os motoristas do histórico por data mais recente e quantidade de viagens
  const sortedHistoryEntries = Array.from(driverTripMap.values()).sort((a, b) => {
    if (a.lastDate && b.lastDate) {
      const diff = new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
      if (diff !== 0) return diff
    }
    return b.count - a.count
  })

  const vehicleHistory: DriverSuggestion[] = []
  const usedDriverIds = new Set<string>()

  // Se houver titular
  let topSuggestion: DriverSuggestion | null = null
  if (titularDriver) {
    topSuggestion = {
      driver: titularDriver,
      reason: 'default_plate',
      label: 'Titular do Veículo',
    }
    usedDriverIds.add(titularDriver.id)
  }

  // Constrói lista de histórico
  sortedHistoryEntries.forEach((entry, idx) => {
    const isTitular = titularDriver && titularDriver.id === entry.driver.id
    if (isTitular) return // Já está como topSuggestion

    const suggestion: DriverSuggestion = {
      driver: entry.driver,
      reason: idx === 0 && !titularDriver ? 'last_driver' : 'frequent_driver',
      label:
        idx === 0 && !titularDriver
          ? 'Último motorista deste veículo'
          : `${entry.count} ${entry.count === 1 ? 'viagem' : 'viagens'} neste veículo`,
      tripCount: entry.count,
      lastTripDate: entry.lastDate,
    }

    if (!topSuggestion && idx === 0) {
      topSuggestion = suggestion
    } else {
      vehicleHistory.push(suggestion)
    }
    usedDriverIds.add(entry.driver.id)
  })

  // Demais motoristas da organização
  const otherDrivers = allDrivers
    .filter((d) => !usedDriverIds.has(d.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  return {
    topSuggestion,
    vehicleHistory,
    otherDrivers,
  }
}

interface DriverQuickAssignCellProps {
  trip: any
  allTrips: any[]
  allDrivers: any[]
  onDriverAssigned?: (tripId: string, assignedDriver: any) => void
  disabled?: boolean
}

export function DriverQuickAssignCell({
  trip,
  allTrips,
  allDrivers,
  onDriverAssigned,
  disabled = false,
}: DriverQuickAssignCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const modalCardRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const plate = trip.sefaz_metadata?.plate || trip.drivers?.default_plate || ''

  const { topSuggestion, vehicleHistory, otherDrivers } = useMemo(() => {
    return computeDriverSuggestions(plate, allTrips, allDrivers)
  }, [plate, allTrips, allDrivers])

  // Fecha modal ao apertar Escape e foca na barra de busca
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Executa atribuição (otimista + server action com Supabase)
  const handleAssign = async (driver: any) => {
    if (!driver || !driver.id || isAssigning || disabled) return

    setIsAssigning(true)
    setAssigningDriverId(driver.id)
    setFeedback(null)
    setErrorBanner(null)

    // Atualização otimista imediata na UI
    if (onDriverAssigned) {
      onDriverAssigned(trip.id, driver)
    }

    try {
      const res = await assignDriverAction(trip.id, driver.id)
      if (res.success) {
        setFeedback(`Motorista ${driver.name.split(' ')[0]} vinculado com sucesso!`)
        setIsOpen(false)
        setTimeout(() => setFeedback(null), 4000)
      } else {
        setErrorBanner(res.error || 'Erro ao vincular motorista.')
      }
    } catch (err: any) {
      console.error('Falha ao vincular motorista:', err)
      setErrorBanner(err?.message || 'Erro inesperado ao atribuir motorista.')
    } finally {
      setIsAssigning(false)
      setAssigningDriverId(null)
    }
  }

  // Filtragem de busca no dropdown (suporta 5.000+ motoristas com busca instantânea em memória)
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const digitsSearch = normalizedSearch.replace(/\D/g, '')
  const [visibleLimit, setVisibleLimit] = useState(80)

  useEffect(() => {
    setVisibleLimit(80)
  }, [normalizedSearch, isOpen])

  const filteredVehicleHistory = useMemo(() => {
    if (!normalizedSearch) return vehicleHistory
    return vehicleHistory.filter(
      (item) =>
        item.driver.name?.toLowerCase().includes(normalizedSearch) ||
        (digitsSearch.length > 0 && item.driver.phone?.replace(/\D/g, '').includes(digitsSearch)) ||
        item.driver.default_plate?.toLowerCase().includes(normalizedSearch)
    )
  }, [vehicleHistory, normalizedSearch, digitsSearch])

  const filteredOtherDrivers = useMemo(() => {
    if (!normalizedSearch) return otherDrivers
    return otherDrivers.filter(
      (d) =>
        d.name?.toLowerCase().includes(normalizedSearch) ||
        (digitsSearch.length > 0 && d.phone?.replace(/\D/g, '').includes(digitsSearch)) ||
        d.default_plate?.toLowerCase().includes(normalizedSearch) ||
        (digitsSearch.length > 0 && d.cpf?.replace(/\D/g, '').includes(digitsSearch))
    )
  }, [otherDrivers, normalizedSearch, digitsSearch])

  const visibleOtherDrivers = useMemo(() => {
    return filteredOtherDrivers.slice(0, visibleLimit)
  }, [filteredOtherDrivers, visibleLimit])

  // Resolução resiliente do motorista atual (seja por join de objeto, array ou id direto)
  const currentDriver =
    (Array.isArray(trip.drivers) ? trip.drivers[0] : trip.drivers) ||
    allDrivers.find((d) => d.id === trip.driver_id)
  const currentDriverName = currentDriver?.name

  return (
    <div className="relative">
      {/* CENÁRIO 1: Motorista Já Vinculado */}
      {currentDriverName ? (
        <div className="group flex items-center justify-between gap-1.5 max-w-[220px]">
          <div className="truncate">
            <div className="font-medium text-[#1C1917] flex items-center gap-1.5 truncate">
              <span className="truncate" title={currentDriverName}>
                {currentDriverName}
              </span>
              {currentDriver?.default_plate && (
                <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-1 py-0.2 rounded border border-stone-200 shrink-0">
                  {currentDriver.default_plate}
                </span>
              )}
            </div>
            <div className="text-xs text-[#78716C] font-mono mt-0.5 flex items-center gap-1.5">
              <span>Placa: {plate || 'N/A'}</span>
              {currentDriver?.phone && (
                <span className="text-stone-400">• {currentDriver.phone}</span>
              )}
            </div>
          </div>

          {!disabled && (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="opacity-70 group-hover:opacity-100 text-stone-400 hover:text-[#0D9488] p-1 rounded hover:bg-stone-100 transition-all cursor-pointer shrink-0"
              title="Trocar motorista"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : topSuggestion ? (
        /* CENÁRIO 2: Pendente, mas com Sugestão Inteligente (1-Click) */
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleAssign(topSuggestion.driver)}
              disabled={isAssigning || disabled}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 transition-all cursor-pointer shadow-2xs group"
              title={`Atribuir ${topSuggestion.driver.name} (${topSuggestion.label})`}
            >
              {isAssigning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
              )}
              <span className="max-w-[125px] truncate text-left">{topSuggestion.driver.name}</span>
              <span className="bg-emerald-600 text-white text-[10px] px-1 py-0.2 rounded font-bold uppercase tracking-wider flex items-center gap-0.5">
                <Check className="w-2.5 h-2.5" /> Confirmar
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              disabled={disabled}
              className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors cursor-pointer"
              title="Ver outros motoristas sugeridos"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-[11px] text-[#78716C] font-mono flex items-center gap-1">
            <Car className="w-3 h-3 text-[#0D9488]" />
            <span>Placa: <strong>{plate || 'N/A'}</strong></span>
            <span className="text-emerald-700 font-medium">({topSuggestion.label})</span>
          </div>
        </div>
      ) : (
        /* CENÁRIO 3: Pendente Sem Sugestão (Veículo Novo ou Sem Histórico) */
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer shadow-2xs"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
            <span>Vincular Motorista</span>
            <ChevronDown className="w-3 h-3 text-amber-600" />
          </button>
          <div className="text-[11px] text-[#78716C] font-mono">
            Placa: {plate || 'N/A'}
          </div>
        </div>
      )}

      {/* FEEDBACK TEMPORÁRIO */}
      {feedback && (
        <div className="absolute top-full left-0 z-20 mt-1 px-2.5 py-1 bg-emerald-800 text-white text-[11px] font-mono rounded shadow-lg animate-in fade-in slide-in-from-top-1">
          {feedback}
        </div>
      )}

      {/* MODAL DIALOG DE VINCULAÇÃO / ATRIBUIÇÃO DE MOTORISTA (Portal flutuante seguro contra overflow) */}
      {isOpen && mounted && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isAssigning) setIsOpen(false)
          }}
        >
          <div
            ref={modalCardRef}
            className="bg-white rounded-xl shadow-2xl border border-[#E7E5E4] max-w-md w-full overflow-hidden text-xs animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
          >
            {/* Header com Ícone, Título e Dados da Carga */}
            <div className="px-5 py-3.5 border-b border-[#E7E5E4] bg-[#FAFAF9] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-50 text-[#0D9488] border border-teal-100">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1C1917]">
                    Vincular Motorista à Carga
                  </h3>
                  <div className="text-[11px] font-mono text-[#78716C] flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {plate ? (
                      <span className="inline-flex items-center gap-1 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200 text-stone-800">
                        <Car className="w-3 h-3 text-[#0D9488]" />
                        Placa: <strong>{plate}</strong>
                      </span>
                    ) : null}
                    {trip.destination ? (
                      <span className="text-stone-600 truncate max-w-[200px]" title={trip.destination}>
                        • Destino: <strong>{trip.destination}</strong>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isAssigning}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Banner de Erro caso a gravação falhe */}
            {errorBanner && (
              <div className="mx-3 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="font-semibold">Erro ao salvar no banco:</strong> {errorBanner}
                </div>
              </div>
            )}

            {/* Campo de Busca */}
            <div className="p-3 border-b border-[#E7E5E4] bg-white">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome, CPF ou placa habitual..."
                  className="w-full pl-9 pr-3 py-2 bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg text-xs text-[#1C1917] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0D9488] focus:border-[#0D9488]"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-stone-500 mt-1.5 px-0.5">
                <span>
                  {normalizedSearch
                    ? `${filteredOtherDrivers.length.toLocaleString('pt-BR')} encontrado(s) de ${allDrivers.length.toLocaleString('pt-BR')}`
                    : `Total de ${allDrivers.length.toLocaleString('pt-BR')} motoristas cadastrados`}
                </span>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="text-[#0D9488] hover:underline cursor-pointer"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            </div>

            {/* Lista com Rolagem */}
            <div className="max-h-72 overflow-y-auto divide-y divide-[#F5F5F4] p-2 space-y-2">
              {/* SEÇÃO: RECOMENDADO PRINCIPAL (Se houver) */}
              {topSuggestion && !normalizedSearch && (
                <div className="p-2 bg-emerald-50/60 rounded-lg border border-emerald-200 mb-2">
                  <div className="text-[10px] font-mono uppercase font-bold text-emerald-800 flex items-center gap-1 mb-1.5 px-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Recomendado para esta placa</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAssign(topSuggestion.driver)}
                    disabled={isAssigning}
                    className="w-full text-left p-2.5 rounded-md hover:bg-emerald-100/70 transition-colors flex items-center justify-between gap-2 border border-emerald-300/80 bg-white cursor-pointer shadow-2xs disabled:opacity-60"
                  >
                    <div className="truncate">
                      <div className="font-bold text-[#1C1917] flex items-center gap-1.5 text-xs">
                        <span className="truncate">{topSuggestion.driver.name}</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      </div>
                      <div className="text-[11px] text-emerald-700 font-mono mt-0.5">
                        {topSuggestion.label}
                        {topSuggestion.driver.phone && ` • ${topSuggestion.driver.phone}`}
                        {topSuggestion.driver.default_plate && ` • Placa: ${topSuggestion.driver.default_plate}`}
                      </div>
                    </div>
                    {assigningDriverId === topSuggestion.driver.id ? (
                      <span className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold shrink-0 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shrink-0 transition-colors">
                        Atribuir
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* SEÇÃO: OUTROS MOTORISTAS DO HISTÓRICO DO VEÍCULO */}
              {filteredVehicleHistory.length > 0 && (
                <div className="p-1">
                  <div className="text-[10px] font-mono uppercase font-bold text-[#78716C] flex items-center gap-1 mb-1 px-1">
                    <Clock className="w-3 h-3 text-[#0D9488]" />
                    <span>Já dirigiram este veículo</span>
                  </div>
                  <div className="space-y-1">
                    {filteredVehicleHistory.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAssign(item.driver)}
                        disabled={isAssigning}
                        className="w-full text-left p-2 rounded-md hover:bg-[#F5F5F4] transition-colors flex items-center justify-between gap-2 cursor-pointer group border border-transparent hover:border-stone-200 disabled:opacity-60"
                      >
                        <div className="truncate">
                          <div className="font-medium text-[#1C1917] group-hover:text-[#0D9488] truncate">
                            {item.driver.name}
                          </div>
                          <div className="text-[10px] text-stone-500 font-mono">
                            {item.label}
                            {item.driver.phone && ` • ${item.driver.phone}`}
                          </div>
                        </div>
                        {assigningDriverId === item.driver.id ? (
                          <span className="text-[10px] font-mono text-[#0D9488] font-bold flex items-center gap-1 shrink-0">
                            <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-stone-400 group-hover:text-[#0D9488] shrink-0">
                            Selecionar →
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SEÇÃO: DEMAIS MOTORISTAS */}
              {filteredOtherDrivers.length > 0 && (
                <div className="p-1">
                  <div className="text-[10px] font-mono uppercase font-bold text-[#78716C] flex items-center gap-1 mb-1 px-1">
                    <User className="w-3 h-3 text-stone-500" />
                    <span>
                      {filteredVehicleHistory.length > 0 || topSuggestion
                        ? 'Demais Motoristas'
                        : 'Todos os Motoristas'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {visibleOtherDrivers.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleAssign(d)}
                        disabled={isAssigning}
                        className="w-full text-left p-2 rounded-md hover:bg-[#F5F5F4] transition-colors flex items-center justify-between gap-2 cursor-pointer group border border-transparent hover:border-stone-200 disabled:opacity-60"
                      >
                        <div className="truncate">
                          <div className="font-medium text-[#1C1917] group-hover:text-[#0D9488] truncate">
                            {d.name}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono">
                            {d.phone || 'Sem telefone'}
                            {d.default_plate && ` • Placa habitual: ${d.default_plate}`}
                          </div>
                        </div>
                        {assigningDriverId === d.id ? (
                          <span className="text-[10px] font-mono text-[#0D9488] font-bold flex items-center gap-1 shrink-0">
                            <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-stone-400 group-hover:text-[#0D9488] shrink-0">
                            Selecionar →
                          </span>
                        )}
                      </button>
                    ))}

                    {filteredOtherDrivers.length > visibleLimit && (
                      <button
                        type="button"
                        onClick={() => setVisibleLimit((prev) => prev + 100)}
                        className="w-full py-2 mt-1 text-center text-[11px] font-mono font-semibold text-[#0D9488] hover:bg-teal-50/70 rounded-md border border-dashed border-teal-200 transition-colors cursor-pointer"
                      >
                        Mostrar mais motoristas (+100 de{' '}
                        {(filteredOtherDrivers.length - visibleLimit).toLocaleString('pt-BR')} restantes)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* NENHUM ENCONTRADO */}
              {filteredVehicleHistory.length === 0 &&
                filteredOtherDrivers.length === 0 &&
                (!topSuggestion || Boolean(normalizedSearch)) && (
                  <div className="p-6 text-center text-stone-500 font-mono text-xs">
                    Nenhum motorista encontrado com &quot;{searchTerm}&quot;
                  </div>
                )}
            </div>

            {/* Rodapé: Link para Cadastrar Novo Motorista */}
            <div className="px-4 py-3 border-t border-[#E7E5E4] bg-[#FAFAF9] flex items-center justify-between">
              <a
                href="/motoristas"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D9488] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo cadastro de motorista</span>
              </a>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
