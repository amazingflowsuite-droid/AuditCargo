'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Clock, AlertCircle, CheckCircle2, Building2, TimerReset } from "lucide-react"

export function EstadiasReport({ trips }: { trips: any[] }) {
  const [filterSender, setFilterSender] = useState('')

  const processedTrips = useMemo(() => {
    return trips.map(t => {
      const start = new Date(t.arrival_time)
      const end = new Date(t.completion_time)
      const waitTimeMs = end.getTime() - start.getTime()
      const waitTimeHours = waitTimeMs / (1000 * 60 * 60)
      
      const franchiseHours = t.senders?.franchise_hours || 0
      const excessHours = Math.max(0, waitTimeHours - franchiseHours)
      
      return {
        ...t,
        start,
        end,
        waitTimeHours,
        franchiseHours,
        excessHours,
        isExcess: excessHours > 0
      }
    })
  }, [trips])

  const filteredTrips = useMemo(() => {
    return processedTrips.filter(t => {
      if (filterSender) {
        const senderName = t.senders?.name || t.sender || ''
        if (!senderName.toLowerCase().includes(filterSender.toLowerCase())) {
          return false
        }
      }
      return true
    })
  }, [processedTrips, filterSender])

  const totalFinished = filteredTrips.length
  const totalWithin = filteredTrips.filter(t => !t.isExcess).length
  const totalExceeded = filteredTrips.filter(t => t.isExcess).length
  const totalExcessHours = filteredTrips.reduce((acc, t) => acc + t.excessHours, 0)

  const formatHours = (h: number) => {
    const hours = Math.floor(h)
    const mins = Math.round((h - hours) * 60)
    return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
  }

  return (
    <div className="space-y-6">
      {/* Resumo de Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-[#57534E]">Total Finalizadas</p>
              <CheckCircle2 className="h-4 w-4 text-[#A8A29E]" />
            </div>
            <div className="text-3xl font-bold text-[#1C1917]">{totalFinished}</div>
            <p className="text-xs text-[#78716C] mt-1">no período</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-l-4 border-l-[#10B981]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-[#57534E]">Dentro da Franquia</p>
              <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
            </div>
            <div className="text-3xl font-bold text-[#1C1917]">{totalWithin}</div>
            <p className="text-xs text-[#78716C] mt-1">viagens isentas</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-[#EF4444]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-[#57534E]">Com Excesso</p>
              <AlertCircle className="h-4 w-4 text-[#EF4444]" />
            </div>
            <div className="text-3xl font-bold text-[#1C1917]">{totalExceeded}</div>
            <p className="text-xs text-[#78716C] mt-1">viagens sujeitas a multa</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-[#F59E0B]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-[#57534E]">Horas Excedidas</p>
              <TimerReset className="h-4 w-4 text-[#F59E0B]" />
            </div>
            <div className="text-3xl font-bold text-[#1C1917]">{formatHours(totalExcessHours)}</div>
            <p className="text-xs text-[#78716C] mt-1">tempo total faturável</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-4">
          <div>
            <CardTitle className="text-lg">Detalhamento por Viagem</CardTitle>
            <CardDescription>Visualize o tempo de permanência de cada veículo no destino.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-[#A8A29E]" />
              <Input
                placeholder="Filtrar Remetente..."
                value={filterSender}
                onChange={(e) => setFilterSender(e.target.value)}
                className="pl-9 bg-[#FAFAF9]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] font-mono text-[#78716C] uppercase bg-[#F5F5F4] border-b border-[#E7E5E4]">
                <tr>
                  <th className="px-4 py-3 font-medium">Viagem / DACTE</th>
                  <th className="px-4 py-3 font-medium">Remetente (Pagador)</th>
                  <th className="px-4 py-3 font-medium">Chegada</th>
                  <th className="px-4 py-3 font-medium">Saída</th>
                  <th className="px-4 py-3 font-medium">Permanência</th>
                  <th className="px-4 py-3 font-medium">Franquia</th>
                  <th className="px-4 py-3 font-medium text-right">Excedente</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]">
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[#78716C]">
                      Nenhuma viagem finalizada encontrada para os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((t) => (
                    <tr key={t.id} className="hover:bg-[#F5F5F4]/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1C1917]">{t.cte_number || 'Sem Documento'}</div>
                        <div className="text-xs text-[#78716C]">{t.drivers?.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1C1917]">{t.senders?.name || t.sender || '-'}</div>
                        <div className="text-xs text-[#78716C] truncate max-w-[150px]" title={t.destination}>{t.destination}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#57534E]">
                        {t.start.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#57534E]">
                        {t.end.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {formatHours(t.waitTimeHours)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {t.franchiseHours}h
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-right font-medium">
                        {t.excessHours > 0 ? (
                          <span className="text-[#EF4444]">+{formatHours(t.excessHours)}</span>
                        ) : (
                          <span className="text-[#A8A29E]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.isExcess ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                            Cobrar
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                            Isento
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
