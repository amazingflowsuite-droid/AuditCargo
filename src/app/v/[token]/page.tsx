import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DriverActions } from "./DriverActions"
import { Truck, MapPin, Clock, CheckCircle2, ShieldCheck, FileText, Calendar } from "lucide-react"

export default async function DriverTripPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data: trip } = await supabase
    .from("trips")
    .select(`
      *,
      companies(name),
      branches(name, city),
      drivers(name, default_plate, phone)
    `)
    .eq("token", token.toUpperCase())
    .single()

  if (!trip) {
    notFound()
  }

  // Mapeamento amigável de status em Português
  const statusLabel = {
    in_transit: {
      text: "Em Trânsito",
      color: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]",
    },
    pending: {
      text: "Em Trânsito",
      color: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]",
    },
    arrived: {
      text: "Chegou no Destino / Portaria",
      color: "bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]",
    },
    unloading: {
      text: "Em Descarga",
      color: "bg-blue-50 text-blue-800 border-blue-200",
    },
    finished: {
      text: "Descarga Finalizada",
      color: "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]",
    },
  }[trip.status as string] || {
    text: trip.status === "in_transit" ? "Em Trânsito" : trip.status,
    color: "bg-gray-100 text-gray-800 border-gray-200",
  }

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div className="max-w-md mx-auto space-y-5 pb-12">
      {/* Mobile Header Branding */}
      <div className="flex items-center justify-between p-3.5 rounded-[8px] bg-[#0F172A] text-white shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[6px] bg-[#0D9488] flex items-center justify-center text-white">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-serif-title text-base font-bold leading-tight">AuditCargo</h1>
            <p className="text-[10px] text-[#A8A29E] font-mono">Telemetria de Portaria</p>
          </div>
        </div>
        <div className="text-right font-mono">
          <span className="text-[10px] text-[#A8A29E] uppercase block">Token</span>
          <span className="text-sm font-bold text-teal-400 tracking-wider">{trip.token}</span>
        </div>
      </div>

      {/* Saudação do Motorista */}
      <Card className="border-l-4 border-l-[#0D9488] shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardDescription className="text-xs uppercase font-mono tracking-wider">
            Condutor do Transporte
          </CardDescription>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#0D9488]" />
            {trip.drivers?.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 text-xs text-[#57534E] flex items-center justify-between font-mono">
          <span>Placa: <strong>{trip.drivers?.default_plate || "N/A"}</strong></span>
          <span>{trip.companies?.name}</span>
        </CardContent>
      </Card>

      {/* Detalhes da Carga & Destino */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[#78716C]">Destino Legal</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-[4px] border ${statusLabel.color}`}>
              {statusLabel.text}
            </span>
          </div>
          <CardTitle className="text-lg font-bold mt-1 text-[#1C1917] flex items-start gap-2">
            <MapPin className="w-5 h-5 text-[#0D9488] shrink-0 mt-0.5" />
            <span>{trip.destination}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 pt-2 space-y-3">
          {trip.sender && (
            <div className="text-xs text-[#57534E]">
              <span className="text-[#78716C]">Remetente:</span> <strong>{trip.sender}</strong>
            </div>
          )}

          {trip.cte_number && (
            <div className="text-xs text-[#0D9488] font-mono flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> CT-e / DACTE: {trip.cte_number}
            </div>
          )}

          {trip.invoices?.length > 0 && (
            <div className="p-2.5 rounded-[6px] bg-[#F5F5F4] border border-[#E7E5E4] text-xs space-y-1">
              <span className="font-semibold text-[#1C1917] flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-[#0D9488]" /> Notas Fiscais
              </span>
              <p className="font-mono text-[#57534E]">{trip.invoices.join(", ")}</p>
            </div>
          )}

          {/* Horários gravados */}
          {(trip.arrival_time || trip.completion_time) && (
            <div className="pt-2 border-t border-[#E7E5E4] space-y-1.5 text-xs font-mono">
              {trip.arrival_time && (
                <div className="text-[#0F766E] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Chegada: <strong>{formatDateTime(trip.arrival_time)}</strong></span>
                </div>
              )}
              {trip.completion_time && (
                <div className="text-[#047857] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Finalização: <strong>{formatDateTime(trip.completion_time)}</strong></span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ações do Motorista com Botões e Reversão */}
      <DriverActions
        tripId={trip.id}
        status={trip.status}
        token={trip.token}
        arrivalTime={trip.arrival_time}
        completionTime={trip.completion_time}
        checkinPhotoUrl={trip.checkin_photo_url}
      />
    </div>
  )
}
