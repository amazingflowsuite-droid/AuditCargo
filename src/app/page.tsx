import Link from "next/link"
import { getTrips } from "./actions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Compass,
  PlusCircle,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  MessageSquare,
  FileText,
  Calendar,
  Camera,
} from "lucide-react"

export default async function Home() {
  const trips = await getTrips()

  const inTransitTrips = trips.filter(
    (t: any) => t.status === "in_transit" || t.status === "pending"
  )
  const arrivedTrips = trips.filter((t: any) => t.status === "arrived")
  const unloadingTrips = trips.filter((t: any) => t.status === "unloading")
  const finishedTrips = trips.filter((t: any) => t.status === "finished")

  const formatShortDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#1C1917] tracking-tight">
            Painel da Torre de Controle
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Monitoramento de transportes, telemetria de portarias e auditoria de estadias (Lei 11.442/07).
          </p>
        </div>

        <Link href="/novo-transporte">
          <Button className="gap-2 h-11 px-5 shadow-sm">
            <PlusCircle className="w-4 h-4 text-[#0D9488]" />
            Novo Transporte
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:border-[#D6D3D1] transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-mono tracking-wider">
              Total de Transportes
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-[#0F172A]">{trips.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-[#78716C]">
            Operações registradas no sistema
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#D97706]">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-mono tracking-wider flex items-center gap-1.5 text-[#D97706]">
              <Clock className="w-3.5 h-3.5" /> Em Trânsito
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-[#0F172A]">
              {inTransitTrips.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-[#78716C]">
            A caminho do destino
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#0D9488]">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-mono tracking-wider flex items-center gap-1.5 text-[#0D9488]">
              <AlertCircle className="w-3.5 h-3.5" /> Na Portaria / Doca
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-[#0F172A]">
              {arrivedTrips.length + unloadingTrips.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-[#78716C]">
            Franquia / Descarga em andamento
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#059669]">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-mono tracking-wider flex items-center gap-1.5 text-[#059669]">
              <CheckCircle2 className="w-3.5 h-3.5" /> Concluídos
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-[#0F172A]">
              {finishedTrips.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-[#78716C]">
            Canhoto / Dossiê emitido
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Transportes Recentes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
            Transportes & Cargas Recentes
          </h2>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/40 space-y-3">
            <Truck className="w-12 h-12 text-[#A8A29E] mx-auto" />
            <h3 className="font-serif-title text-base font-bold text-[#1C1917]">Nenhum transporte em andamento</h3>
            <p className="text-xs text-[#78716C] max-w-md mx-auto">
              Emita novos transportes com DACTE, notas fiscais e múltiplos destinatários para auditoria automática.
            </p>
            <div className="pt-2">
              <Link href="/novo-transporte">
                <Button variant="accent">Emitir Primeiro Transporte</Button>
              </Link>
            </div>
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
                    <th className="px-4 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]">
                  {trips.map((trip: any) => {
                    const statusBadge = {
                      in_transit: {
                        label: "Em Trânsito",
                        color: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]",
                      },
                      pending: {
                        label: "Em Trânsito",
                        color: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]",
                      },
                      arrived: {
                        label: "Na Portaria",
                        color: "bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]",
                      },
                      unloading: {
                        label: "Em Descarga",
                        color: "bg-blue-50 text-blue-800 border-blue-200",
                      },
                      finished: {
                        label: "Concluído",
                        color: "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]",
                      },
                    }[trip.status as string] || {
                      label: trip.status === "in_transit" ? "Em Trânsito" : trip.status,
                      color: "bg-[#F5F5F4] text-[#57534E] border-[#E7E5E4]",
                    }

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
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {trip.drivers?.phone && (
                              <a
                                href={`https://wa.me/55${trip.drivers.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                  `🚚 AuditCargo - CT-e ${trip.cte_number || ''} (${trip.service_type || 'Estadia'}): Acesse ${typeof window !== 'undefined' ? window.location.origin : ''}/v/${trip.token}`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-[#059669] hover:bg-[#ECFDF5] rounded-[4px] transition-colors"
                                title="Enviar no WhatsApp"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </a>
                            )}
                            <Link
                              href={`/v/${trip.token}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 text-xs text-[#0D9488] font-semibold hover:underline"
                            >
                              Ver tela móvel <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
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
      </div>
    </div>
  )
}
