import { getCompanies } from "../actions"
import { CompanyManager } from "./CompanyManager"

export default async function EmpresasPage() {
  const companies = await getCompanies()

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            Empresas & Contratantes
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Gestão multi-tenant: empresas transportadoras ou embarcadores operando no AuditCargo.
          </p>
        </div>
      </div>

      <CompanyManager initialCompanies={companies} />
    </div>
  )
}
