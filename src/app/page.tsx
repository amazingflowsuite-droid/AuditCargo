import Link from "next/link"
import { getTrips, getDrivers, getSswSyncStatusAction } from "./actions"
import { requireAuth } from "@/utils/supabase/auth"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"
import { TripsDashboardTable } from "@/components/TripsDashboardTable"
import { SyncEmailCteButton } from "@/components/SyncEmailCteButton"

export default async function Home() {
  const currentUser = await requireAuth()
  const [trips, drivers, sswHealth] = await Promise.all([
    getTrips(currentUser.organization_id, "7d"),
    getDrivers(currentUser.organization_id),
    getSswSyncStatusAction(currentUser.organization_id),
  ])

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
          <SyncEmailCteButton initialHealth={sswHealth} />
          <Link href="/novo-transporte">
            <Button className="gap-2 h-11 px-5 shadow-sm">
              <PlusCircle className="w-4 h-4 text-[#0D9488]" />
              Novo Transporte
            </Button>
          </Link>
        </div>
      </div>

      {/* KPIs Sincronizados + Tabela de Transportes com Filtro de Período (Padrão: 7 dias) */}
      <TripsDashboardTable
        trips={trips}
        drivers={drivers}
        userRole={currentUser.role}
        initialPeriod="7d"
      />
    </div>
  )
}
