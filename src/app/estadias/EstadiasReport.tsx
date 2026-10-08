'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  Building2,
  TimerReset,
  Printer,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileSpreadsheet,
} from "lucide-react"

export function EstadiasReport({ trips }: { trips: any[] }) {
  const [filterSender, setFilterSender] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  // Formatação de moeda BRL
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  const processedTrips = useMemo(() => {
    return trips.map(t => {
      const start = new Date(t.arrival_time)
      start.setSeconds(0, 0)
      const end = new Date(t.completion_time)
      end.setSeconds(0, 0)
      const waitTimeMs = end.getTime() - start.getTime()
      const waitTimeMinutes = Math.floor(waitTimeMs / (1000 * 60))
      const waitTimeHours = waitTimeMinutes / 60
      
      const franchiseHours = Number(t.senders?.franchise_hours || 0)
      const hourlyRate = Number(t.senders?.demurrage_hourly_rate || 0)
      const excessHours = Math.max(0, waitTimeHours - franchiseHours)
      const excessCost = excessHours * hourlyRate
      
      // Data formatada para filtro local YYYY-MM-DD
      const endYear = end.getFullYear()
      const endMonth = String(end.getMonth() + 1).padStart(2, '0')
      const endDay = String(end.getDate()).padStart(2, '0')
      const localDateStr = `${endYear}-${endMonth}-${endDay}`

      return {
        ...t,
        start,
        end,
        localDateStr,
        waitTimeHours,
        franchiseHours,
        hourlyRate,
        excessHours,
        excessCost,
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
      if (filterDate) {
        if (t.localDateStr !== filterDate) {
          return false
        }
      }
      return true
    })
  }, [processedTrips, filterSender, filterDate])

  // Totalizadores dos registros filtrados
  const totalFinished = filteredTrips.length
  const totalWithin = filteredTrips.filter(t => !t.isExcess).length
  const totalExceeded = filteredTrips.filter(t => t.isExcess).length
  const totalExcessHours = filteredTrips.reduce((acc, t) => acc + t.excessHours, 0)
  const totalExcessCost = filteredTrips.reduce((acc, t) => acc + t.excessCost, 0)

  // Paginação client-side para evitar sobrecarga de nós DOM e otimizar INP
  const totalPages = Math.ceil(filteredTrips.length / pageSize) || 1
  const paginatedTrips = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredTrips.slice(startIndex, startIndex + pageSize)
  }, [filteredTrips, currentPage, pageSize])

  const formatHours = (h: number) => {
    const hours = Math.floor(h)
    const mins = Math.round((h - hours) * 60)
    return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
  }

  // Exportação CSV formatada com UTF-8 BOM para compatibilidade com Microsoft Excel
  const handleExportCSV = () => {
    if (filteredTrips.length === 0) return

    const headers = [
      'Viagem / CTe',
      'Notas Fiscais',
      'Motorista',
      'Remetente (Pagador)',
      'Destino',
      'Chegada',
      'Saida',
      'Permanencia (Horas)',
      'Franquia (Horas)',
      'Excedente (Horas)',
      'Taxa Horaria (R$)',
      'Total a Cobrar (R$)',
      'Status'
    ]

    const rows = filteredTrips.map(t => [
      `"${(t.cte_number || 'S/ DACTE').replace(/"/g, '""')}"`,
      `"${(t.invoices?.join(', ') || '').replace(/"/g, '""')}"`,
      `"${(t.drivers?.name || '').replace(/"/g, '""')}"`,
      `"${(t.senders?.name || t.sender || '').replace(/"/g, '""')}"`,
      `"${(t.destination || '').replace(/"/g, '""')}"`,
      `"${t.start.toLocaleString('pt-BR')}"`,
      `"${t.end.toLocaleString('pt-BR')}"`,
      t.waitTimeHours.toFixed(2).replace('.', ','),
      t.franchiseHours.toFixed(2).replace('.', ','),
      t.excessHours.toFixed(2).replace('.', ','),
      t.hourlyRate.toFixed(2).replace('.', ','),
      t.excessCost.toFixed(2).replace('.', ','),
      t.isExcess ? 'Cobrar' : 'Isento'
    ])

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `apuracao-estadias-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Resumo de Indicadores com Visão Financeira */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1.5">
              <p className="text-xs font-medium text-[#57534E]">Total Finalizadas</p>
              <CheckCircle2 className="h-4 w-4 text-[#A8A29E]" />
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{totalFinished}</div>
            <p className="text-[11px] text-[#78716C] mt-0.5">no período filtrado</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-l-4 border-l-[#10B981]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1.5">
              <p className="text-xs font-medium text-[#57534E]">Dentro da Franquia</p>
              <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{totalWithin}</div>
            <p className="text-[11px] text-[#78716C] mt-0.5">viagens isentas</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-[#EF4444]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1.5">
              <p className="text-xs font-medium text-[#57534E]">Com Excesso</p>
              <AlertCircle className="h-4 w-4 text-[#EF4444]" />
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{totalExceeded}</div>
            <p className="text-[11px] text-[#78716C] mt-0.5">viagens a cobrar</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-[#F59E0B]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1.5">
              <p className="text-xs font-medium text-[#57534E]">Horas Excedidas</p>
              <TimerReset className="h-4 w-4 text-[#F59E0B]" />
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{formatHours(totalExcessHours)}</div>
            <p className="text-[11px] text-[#78716C] mt-0.5">tempo faturável</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-[#0D9488] bg-teal-50/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1.5">
              <p className="text-xs font-medium text-[#0F766E]">Total a Cobrar</p>
              <DollarSign className="h-4 w-4 text-[#0D9488]" />
            </div>
            <div className="text-2xl font-bold text-[#0F766E]">{formatCurrency(totalExcessCost)}</div>
            <p className="text-[11px] text-[#0D9488] mt-0.5 font-medium">valor apurado em R$</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela & Painel de Ações */}
      <Card className="shadow-sm print-section">
        <CardHeader className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-4">
          <div>
            <CardTitle className="text-lg">Detalhamento por Viagem</CardTitle>
            <CardDescription>Visualize o tempo de permanência de cada veículo no destino e os valores a faturar.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="relative w-full sm:w-56">
              <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-[#A8A29E]" />
              <Input
                placeholder="Filtrar Remetente..."
                value={filterSender}
                onChange={(e) => {
                  setFilterSender(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9 bg-[#FAFAF9]"
              />
            </div>
            <div className="relative w-full sm:w-48 group">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-[#A8A29E] pointer-events-none" />
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9 pr-14 bg-[#FAFAF9] text-[#57534E]"
              />
              {filterDate && (
                <button 
                  onClick={() => {
                    setFilterDate('')
                    setCurrentPage(1)
                  }}
                  className="absolute right-2 top-2.5 text-[10px] uppercase font-bold text-[#EF4444] hover:text-[#B91C1C] transition-colors bg-red-50 px-1.5 py-0.5 rounded"
                >
                  Limpar
                </button>
              )}
            </div>

            <Button 
              variant="outline" 
              className="gap-2 w-full sm:w-auto text-[#0D9488] border-[#0D9488]/30 hover:bg-[#0D9488]/10"
              onClick={handleExportCSV}
              disabled={filteredTrips.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar CSV
            </Button>

            <Button 
              variant="outline" 
              className="gap-2 w-full sm:w-auto"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] font-mono text-[#78716C] uppercase bg-[#F5F5F4] border-b border-[#E7E5E4]">
                <tr>
                  <th className="px-4 py-3 font-medium">Viagem / Notas</th>
                  <th className="px-4 py-3 font-medium">Remetente (Pagador)</th>
                  <th className="px-4 py-3 font-medium">Chegada</th>
                  <th className="px-4 py-3 font-medium">Saída</th>
                  <th className="px-4 py-3 font-medium">Permanência</th>
                  <th className="px-4 py-3 font-medium">Franquia</th>
                  <th className="px-4 py-3 font-medium text-right">Excedente</th>
                  <th className="px-4 py-3 font-medium text-right">Valor Estadia</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]">
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[#78716C]">
                      Nenhuma viagem finalizada encontrada para os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  paginatedTrips.map((t) => (
                    <tr key={t.id} className="hover:bg-[#F5F5F4]/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1C1917]">
                          {t.cte_number || 'S/ DACTE'} 
                          {t.invoices && t.invoices.length > 0 && (
                            <span className="text-[#0D9488] ml-1">({t.invoices.join(', ')})</span>
                          )}
                        </div>
                        <div className="text-xs text-[#78716C]">{t.drivers?.name || 'Motorista não informado'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1C1917]">{t.senders?.name || t.sender || '-'}</div>
                        <div className="text-xs text-[#78716C] truncate max-w-[150px]" title={t.destination}>{t.destination || '-'}</div>
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
                      <td className="px-4 py-3 font-mono text-xs text-right font-medium">
                        {t.excessCost > 0 ? (
                          <span className="text-[#0F766E] font-semibold">{formatCurrency(t.excessCost)}</span>
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

          {/* Rodapé de Paginação */}
          {filteredTrips.length > pageSize && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#E7E5E4] bg-[#FAFAF9] print:hidden">
              <span className="text-xs text-[#78716C]">
                Exibindo <span className="font-medium text-[#1C1917]">{((currentPage - 1) * pageSize) + 1}</span> a{' '}
                <span className="font-medium text-[#1C1917]">{Math.min(currentPage * pageSize, filteredTrips.length)}</span> de{' '}
                <span className="font-medium text-[#1C1917]">{filteredTrips.length}</span> viagens
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-2.5 gap-1 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </Button>
                <span className="text-xs font-medium text-[#57534E] px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-2.5 gap-1 text-xs"
                >
                  Próximo
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

