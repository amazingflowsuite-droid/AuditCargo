'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import {
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  FileText,
  Camera,
  Search,
  Pencil,
  Ban,
  Trash2,
  X,
  Check,
  Building2,
  MapPin,
  User,
} from 'lucide-react'
import { updateTrip, cancelTrip, deleteTrip } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Ícone oficial WhatsApp vetorial
export function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.08l-.29-.17-3.12.82.83-3.04-.19-.3a8.214 8.214 0 0 1-1.26-4.46c0-4.54 3.7-8.24 8.24-8.24m-3.53 3.49c-.19 0-.42.07-.64.32-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.7 2.6 4.12 3.65.58.25 1.02.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.23-.16-.49-.29-.26-.13-1.53-.76-1.77-.85-.24-.09-.41-.13-.58.13-.17.26-.67.85-.82 1.02-.15.17-.3.19-.56.06-.26-.13-1.1-.4-2.09-1.29-.77-.69-1.29-1.54-1.44-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-.8-1.92-.21-.51-.43-.44-.59-.45h-.5Z"/>
    </svg>
  )
}

interface TripsDashboardTableProps {
  trips: any[]
  drivers?: any[]
}

type FilterTab = 'open' | 'finished' | 'cancelled' | 'all'

export function TripsDashboardTable({ trips: initialTrips, drivers = [] }: TripsDashboardTableProps) {
  const [trips, setTrips] = useState(initialTrips)
  const [activeTab, setActiveTab] = useState<FilterTab>('open')
  const [searchTerm, setSearchTerm] = useState('')
  const [isPending, startTransition] = useTransition()

  // Estado para Edição
  const [editingTrip, setEditingTrip] = useState<any | null>(null)
  const [editCte, setEditCte] = useState('')
  const [editServiceType, setEditServiceType] = useState('Estadia')
  const [editSender, setEditSender] = useState('')
  const [editDestination, setEditDestination] = useState('')
  const [editInvoices, setEditInvoices] = useState('')
  const [editDriverId, setEditDriverId] = useState('')
  const [editStatus, setEditStatus] = useState('in_transit')

  // Estado para Cancelamento / Exclusão
  const [actionTrip, setActionTrip] = useState<any | null>(null)

  const openTripsCount = useMemo(() => {
    return trips.filter((t) => t.status !== 'finished' && t.status !== 'cancelled').length
  }, [trips])

  const finishedTripsCount = useMemo(() => {
    return trips.filter((t) => t.status === 'finished').length
  }, [trips])

  const cancelledTripsCount = useMemo(() => {
    return trips.filter((t) => t.status === 'cancelled').length
  }, [trips])

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      // Filtro de Status
      if (activeTab === 'open' && (trip.status === 'finished' || trip.status === 'cancelled')) return false
      if (activeTab === 'finished' && trip.status !== 'finished') return false
      if (activeTab === 'cancelled' && trip.status !== 'cancelled') return false

      // Filtro de Busca
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const matchesToken = trip.token?.toLowerCase().includes(term)
        const matchesCte = trip.cte_number?.toLowerCase().includes(term)
        const matchesSender = trip.sender?.toLowerCase().includes(term)
        const matchesDestination = trip.destination?.toLowerCase().includes(term)
        const matchesDriver = trip.drivers?.name?.toLowerCase().includes(term)
        const matchesPlate = trip.drivers?.default_plate?.toLowerCase().includes(term)
        const matchesInvoices = trip.invoices?.some((inv: string) => inv.toLowerCase().includes(term))

        return (
          matchesToken ||
          matchesCte ||
          matchesSender ||
          matchesDestination ||
          matchesDriver ||
          matchesPlate ||
          matchesInvoices
        )
      }

      return true
    })
  }, [trips, activeTab, searchTerm])

  const formatShortDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_transit':
      case 'pending':
        return {
          label: 'Em Trânsito',
          color: 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]',
        }
      case 'arrived':
        return {
          label: 'Na Portaria',
          color: 'bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]',
        }
      case 'unloading':
        return {
          label: 'Em Descarga',
          color: 'bg-blue-50 text-blue-800 border-blue-200',
        }
      case 'finished':
        return {
          label: 'Concluído',
          color: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
        }
      case 'cancelled':
        return {
          label: 'Cancelado',
          color: 'bg-red-50 text-red-700 border-red-200',
        }
      default:
        return {
          label: status,
          color: 'bg-[#F5F5F4] text-[#57534E] border-[#E7E5E4]',
        }
    }
  }

  const openEditModal = (trip: any) => {
    setEditingTrip(trip)
    setEditCte(trip.cte_number || '')
    setEditServiceType(trip.service_type || 'Estadia')
    setEditSender(trip.sender || '')
    setEditDestination(trip.destination || '')
    setEditInvoices(Array.isArray(trip.invoices) ? trip.invoices.join(', ') : '')
    setEditDriverId(trip.driver_id || '')
    setEditStatus(trip.status || 'in_transit')
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTrip) return

    const parsedInvoices = editInvoices
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean)

    startTransition(async () => {
      const res = await updateTrip(editingTrip.id, {
        cte_number: editCte,
        service_type: editServiceType,
        sender: editSender,
        destination: editDestination,
        invoices: parsedInvoices,
        driver_id: editDriverId || undefined,
        status: editStatus,
      })

      if (res.success && res.data) {
        setTrips((prev) => prev.map((t) => (t.id === editingTrip.id ? res.data : t)))
        setEditingTrip(null)
      } else {
        alert('Erro ao atualizar transporte: ' + (res.error || 'Erro desconhecido'))
      }
    })
  }

  const handleCancelStatus = (tripId: string) => {
    startTransition(async () => {
      const res = await cancelTrip(tripId)
      if (res.success && res.data) {
        setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, status: 'cancelled' } : t)))
        setActionTrip(null)
      } else {
        alert('Erro ao cancelar: ' + (res.error || 'Erro desconhecido'))
      }
    })
  }

  const handleDeletePermanent = (tripId: string) => {
    startTransition(async () => {
      const res = await deleteTrip(tripId)
      if (res.success) {
        setTrips((prev) => prev.filter((t) => t.id !== tripId))
        setActionTrip(null)
      } else {
        alert('Erro ao excluir: ' + (res.error || 'Erro desconhecido'))
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Controles de Filtro e Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Abas de Filtro: Em Aberto (Default), Concluídos, Cancelados, Todos */}
        <div className="inline-flex items-center p-1 bg-[#F5F5F4] rounded-[8px] border border-[#E7E5E4] text-xs font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('open')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] transition-all font-mono whitespace-nowrap ${
              activeTab === 'open'
                ? 'bg-white text-[#0D9488] font-bold shadow-sm border border-[#E7E5E4]'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <span>Em Aberto</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'open'
                  ? 'bg-teal-100 text-[#0D9488]'
                  : 'bg-[#E7E5E4] text-[#57534E]'
              }`}
            >
              {openTripsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('finished')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] transition-all font-mono whitespace-nowrap ${
              activeTab === 'finished'
                ? 'bg-white text-[#059669] font-bold shadow-sm border border-[#E7E5E4]'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <span>Concluídos</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'finished'
                  ? 'bg-emerald-100 text-[#059669]'
                  : 'bg-[#E7E5E4] text-[#57534E]'
              }`}
            >
              {finishedTripsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cancelled')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] transition-all font-mono whitespace-nowrap ${
              activeTab === 'cancelled'
                ? 'bg-white text-red-600 font-bold shadow-sm border border-[#E7E5E4]'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <span>Cancelados</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'cancelled'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-[#E7E5E4] text-[#57534E]'
              }`}
            >
              {cancelledTripsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] transition-all font-mono whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-white text-[#1C1917] font-bold shadow-sm border border-[#E7E5E4]'
                : 'text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <span>Todos</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'all'
                  ? 'bg-slate-200 text-[#1C1917]'
                  : 'bg-[#E7E5E4] text-[#57534E]'
              }`}
            >
              {trips.length}
            </span>
          </button>
        </div>

        {/* Campo de Busca Rápida */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#A8A29E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar CT-e, token, motorista..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-[#E7E5E4] rounded-[6px] text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#A8A29E] hover:text-[#1C1917]"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo da Tabela */}
      {filteredTrips.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/40 space-y-3">
          <Truck className="w-12 h-12 text-[#A8A29E] mx-auto" />
          <h3 className="font-serif-title text-base font-bold text-[#1C1917]">
            {activeTab === 'open'
              ? 'Nenhum transporte em aberto no momento'
              : activeTab === 'finished'
              ? 'Nenhum transporte concluído encontrado'
              : activeTab === 'cancelled'
              ? 'Nenhum transporte cancelado'
              : 'Nenhum transporte localizado'}
          </h3>
          <p className="text-xs text-[#78716C] max-w-md mx-auto">
            {activeTab === 'open'
              ? 'Todos os transportes foram finalizados ou você pode emitir um novo transporte.'
              : 'Verifique os filtros selecionados ou cadastre novos transportes.'}
          </p>
        </div>
      ) : (
        <div className="border border-[#E7E5E4] rounded-[8px] bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F5F5F4] border-b border-[#E7E5E4] text-[#57534E] text-xs font-mono uppercase">
                <tr>
                  <th className="px-4 py-3.5">Token / DACTE</th>
                  <th className="px-4 py-3.5">Serviço</th>
                  <th className="px-4 py-3.5">Remetente → Destino(s)</th>
                  <th className="px-4 py-3.5">Motorista / Placa</th>
                  <th className="px-4 py-3.5">Chegada & Finalização</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]">
                {filteredTrips.map((trip: any) => {
                  const statusBadge = getStatusBadge(trip.status)

                  const whatsappUrl = trip.drivers?.phone
                    ? `https://wa.me/55${trip.drivers.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `🚚 *AuditCargo* - CT-e ${trip.cte_number || ''} (${trip.service_type || 'Estadia'})\n` +
                          `Motorista: ${trip.drivers?.name || ''}\n` +
                          `Destino: ${trip.destination}\n\n` +
                          `📲 *Acesse o link do transporte:*\n${typeof window !== 'undefined' ? window.location.origin : ''}/v/${trip.token}`
                      )}`
                    : null

                  return (
                    <tr key={trip.id} className="hover:bg-[#FAFAF9] transition-colors">
                      <td className="px-4 py-4">
                        <div className="font-mono font-bold text-[#0F172A] flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-[#F5F5F4] rounded-[4px] border border-[#E7E5E4]">
                            {trip.token}
                          </span>
                        </div>
                        {trip.cte_number && (
                          <div className="text-[11px] font-mono text-[#0D9488] mt-1 flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            CT-e: {trip.cte_number}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-semibold bg-[#F5F5F4] text-[#0F172A] border border-[#E7E5E4]">
                          {trip.service_type || "Estadia"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {trip.sender && (
                          <div className="text-xs text-[#78716C] font-mono truncate max-w-[200px]">
                            De: {trip.sender}
                          </div>
                        )}
                        <div className="font-semibold text-[#1C1917] mt-0.5">
                          Para: {trip.destination}
                        </div>
                        {trip.invoices?.length > 0 && (
                          <div className="text-xs text-[#78716C] font-mono mt-0.5">
                            NFs: {trip.invoices.join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-[#1C1917]">{trip.drivers?.name || "S/ Motorista"}</div>
                        <div className="text-xs text-[#78716C] font-mono">
                          Placa: {trip.drivers?.default_plate || "N/A"}
                        </div>
                      </td>

                      {/* COLUNA: DATA/HORA DE CHEGADA E FINALIZAÇÃO */}
                      <td className="px-4 py-4 text-xs font-mono">
                        {trip.arrival_time ? (
                          <div className="text-[#0F766E] flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>Chegou: <strong>{formatShortDateTime(trip.arrival_time)}</strong></span>
                          </div>
                        ) : (
                          <span className="text-[#A8A29E] flex items-center gap-1">
                            <Clock className="w-3 h-3 opacity-40 shrink-0" />
                            A caminho
                          </span>
                        )}

                        {trip.completion_time && (
                          <div className="text-[#059669] flex items-center gap-1 mt-1">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>Fim: <strong>{formatShortDateTime(trip.completion_time)}</strong></span>
                          </div>
                        )}

                        {trip.checkin_photo_url && (
                          <div className="mt-1.5">
                            <a
                              href={trip.checkin_photo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-mono text-[#0D9488] hover:underline"
                              title="Visualizar Foto Comprobatória"
                            >
                              <Camera className="w-3 h-3 shrink-0" />
                              <span>Ver Foto</span>
                            </a>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium border ${statusBadge.color}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* COLUNA: AÇÕES (WHATSAPP, LINK, EDITAR, CANCELAR) */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão WhatsApp */}
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center p-2 rounded-[6px] bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all shadow-2xs border border-[#25D366]/30"
                              title="Enviar no WhatsApp"
                            >
                              <WhatsAppIcon className="w-4 h-4" />
                            </a>
                          )}

                          {/* Link Motorista */}
                          <Link
                            href={`/v/${trip.token}`}
                            target="_blank"
                            className="p-2 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[6px] transition-colors"
                            title="Abrir tela móvel do motorista"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </Link>

                          {/* Botão Editar Transporte */}
                          <button
                            type="button"
                            onClick={() => openEditModal(trip)}
                            className="p-2 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[6px] transition-colors"
                            title="Editar Dados do Transporte"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Botão Cancelar / Excluir */}
                          <button
                            type="button"
                            onClick={() => setActionTrip(trip)}
                            className="p-2 text-[#57534E] hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors"
                            title="Cancelar ou Excluir Transporte"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE TRANSPORTE */}
      {editingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-[10px] border border-[#E7E5E4] shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#F5F5F4] border-b border-[#E7E5E4]">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#0D9488]" />
                <h3 className="font-bold text-sm text-[#1C1917]">
                  Editar Transporte #{editingTrip.token}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                className="text-[#78716C] hover:text-[#1C1917]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="editCte">CT-e / DACTE</Label>
                  <Input
                    id="editCte"
                    value={editCte}
                    onChange={(e) => setEditCte(e.target.value)}
                    placeholder="Ex: 204"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="editServiceType">Tipo de Serviço</Label>
                  <select
                    id="editServiceType"
                    value={editServiceType}
                    onChange={(e) => setEditServiceType(e.target.value)}
                    className="flex h-9 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-2.5 text-xs text-[#1C1917]"
                  >
                    <option value="Estadia">Estadia</option>
                    <option value="Descarga">Descarga</option>
                    <option value="Devolução">Devolução</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Coleta">Coleta</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="editStatus">Status da Operação</Label>
                <select
                  id="editStatus"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="flex h-9 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-2.5 text-xs text-[#1C1917] font-medium"
                >
                  <option value="in_transit">Em Trânsito (A caminho)</option>
                  <option value="arrived">Na Portaria (Chegada registrada)</option>
                  <option value="unloading">Em Descarga (Operação)</option>
                  <option value="finished">Concluído (Finalizado)</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="editSender">Remetente</Label>
                <Input
                  id="editSender"
                  value={editSender}
                  onChange={(e) => setEditSender(e.target.value)}
                  placeholder="Nome do Remetente / Município"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="editDestination">Destinatário / Destino *</Label>
                <Input
                  id="editDestination"
                  value={editDestination}
                  onChange={(e) => setEditDestination(e.target.value)}
                  placeholder="Nome do Destinatário - Município"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="editInvoices">Notas Fiscais (separadas por vírgula)</Label>
                <Input
                  id="editInvoices"
                  value={editInvoices}
                  onChange={(e) => setEditInvoices(e.target.value)}
                  placeholder="Ex: NF-1020, NF-1021"
                />
              </div>

              {drivers.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="editDriverId">Motorista Designado</Label>
                  <select
                    id="editDriverId"
                    value={editDriverId}
                    onChange={(e) => setEditDriverId(e.target.value)}
                    className="flex h-9 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-2.5 text-xs text-[#1C1917]"
                  >
                    <option value="">Selecione o motorista...</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.default_plate ? `(${d.default_plate})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E5E4]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTrip(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#0D9488] hover:bg-[#0F766E]"
                  disabled={isPending}
                >
                  {isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE CANCELAMENTO OU EXCLUSÃO */}
      {actionTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-[10px] border border-[#E7E5E4] shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#1C1917]">
                  Cancelar ou Excluir Transporte?
                </h3>
                <p className="text-xs text-[#78716C] font-mono">
                  Token: <strong>{actionTrip.token}</strong> | Destino: {actionTrip.destination}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#57534E] leading-relaxed">
              Você pode <strong>Cancelar</strong> a operação (mantendo os registros históricos para auditoria com status &quot;Cancelado&quot;) ou <strong>Excluir Definitivamente</strong> o registro do banco de dados.
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleCancelStatus(actionTrip.id)}
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-[6px] border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold transition-all"
              >
                <Ban className="w-3.5 h-3.5" />
                Marcar como Cancelado (Recomendado)
              </button>

              <button
                type="button"
                onClick={() => handleDeletePermanent(actionTrip.id)}
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-[6px] border border-red-300 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Definitivamente do Sistema
              </button>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setActionTrip(null)}
                className="text-xs text-[#78716C] hover:text-[#1C1917] underline"
              >
                Voltar sem alterar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
