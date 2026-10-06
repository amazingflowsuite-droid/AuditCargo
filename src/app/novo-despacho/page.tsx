import { getCompanies, getBranches, getDrivers } from "../actions"
import { NewTripForm } from "./NewTripForm"

export default async function NovoDespachoPage() {
  const [companies, branches, drivers] = await Promise.all([
    getCompanies(),
    getBranches(),
    getDrivers(),
  ])

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7E5E4] pb-5">
        <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
          Despacho Operacional de Cargas
        </h1>
        <p className="text-sm text-[#57534E] mt-1">
          Emita o token de rastreio e auditoria de estadia para o condutor antes da saída do veículo.
        </p>
      </div>

      <NewTripForm companies={companies} branches={branches} drivers={drivers} />
    </div>
  )
}
