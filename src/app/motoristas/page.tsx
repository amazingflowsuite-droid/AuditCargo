import { getDrivers, getCompanies } from "../actions"
import { requireAuth } from "@/utils/supabase/auth"
import { DriverManager } from "./DriverManager"

export default async function MotoristasPage() {
  const currentUser = await requireAuth()
  const [drivers, companies] = await Promise.all([
    getDrivers(currentUser.organization_id),
    getCompanies(currentUser.organization_id),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            Gestão de Motoristas
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Cadastre, edite e gerencie condutores, credenciais de PIN e telefones para envio de links de viagem.
          </p>
        </div>
      </div>

      <DriverManager initialDrivers={drivers} companies={companies} userRole={currentUser.role} />
    </div>
  )
}
