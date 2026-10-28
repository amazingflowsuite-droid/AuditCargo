import Link from "next/link"
import { getTrips, getDrivers } from "./actions"
import { requireAuth } from "@/utils/supabase/auth"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
} from "lucide-react"
import { TripsDashboardTable } from "@/components/TripsDashboardTable"
import { SyncEmailCteButton } from "@/components/SyncEmailCteButton"
import { ImportEdiButton } from "@/components/ImportEdiButton"
import { getTripIncidents } from "@/utils/trip-audit"

export default async function Home() {
  const currentUser = await requireAuth()
  const [trips, drivers] = await Promise.all([
    getTrips(currentUser.organization_id),
    getDrivers(currentUser.organization_id)
  ])

  const inTransitTrips = trips.filter(
    (t: any) => t.status === "in_transit" || t.status === "pending"
  )
  const arrivedTrips = trips.filter((t: any) => t.status === "arrived")
  const unloadingTrips = trips.filter((t: any) => t.status === "unloading")
  const finishedTrips = trips.filter((t: any) => t.status === "finished")
  const tripsWithOpenIncidents = trips.filter((t: any) =>
    getTripIncidents(t.sefaz_metadata).some((inc) => inc.status === "open")
  )

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#1C1917] tracking-tight">
            Painel de Controle
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SyncEmailCteButton />
          <ImportEdiButton />
          <Link href="/novo-transporte">
            <Button className="gap-2 h-11 px-5 shadow-sm">
              <PlusCircle className="w-4 h-4 text-[#0D9488]" />
              Novo Transporte
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

        <Card
          className={`border-l-4 ${tripsWithOpenIncidents.length > 0
              ? "border-l-amber-600 bg-amber-50/40 border-amber-300"
              : "border-l-stone-400"
            }`}
        >
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-mono tracking-wider flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Com Imprevisto
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-[#0F172A]">
              {tripsWithOpenIncidents.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-[#78716C]">
            {tripsWithOpenIncidents.length > 0
              ? "Aguardando tratativa da central"
              : "Nenhuma ocorrência aberta"}
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

      {/* Tabela de Transportes com Filtros, Edição, Cancelamento e Busca */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
            Transportes & Cargas Recentes
          </h2>
        </div>

        <TripsDashboardTable trips={trips} drivers={drivers} userRole={currentUser.role} />
      </div>
    </div>
  )
}
