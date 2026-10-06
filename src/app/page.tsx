import Link from "next/link"
import { getTrips } from "./actions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  PlusCircle,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { TripsDashboardTable } from "@/components/TripsDashboardTable"

export default async function Home() {
  const trips = await getTrips()

  const inTransitTrips = trips.filter(
    (t: any) => t.status === "in_transit" || t.status === "pending"
  )
  const arrivedTrips = trips.filter((t: any) => t.status === "arrived")
  const unloadingTrips = trips.filter((t: any) => t.status === "unloading")
  const finishedTrips = trips.filter((t: any) => t.status === "finished")

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#1C1917] tracking-tight">
            Painel de Controle
          </h1>
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

      {/* Tabela de Transportes com Filtros e Busca */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
            Transportes & Cargas Recentes
          </h2>
        </div>

        <TripsDashboardTable trips={trips} />
      </div>
    </div>
  )
}
