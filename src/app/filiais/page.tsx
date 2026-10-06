import { getBranches, getCompanies } from "../actions"
import { BranchManager } from "./BranchManager"

export default async function FiliaisPage() {
  const [branches, companies] = await Promise.all([getBranches(), getCompanies()])

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            Filiais & Centros de Distribuição
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Pontos de origem, garagens e centros logísticos vinculados a cada empresa.
          </p>
        </div>
      </div>

      <BranchManager initialBranches={branches} companies={companies} />
    </div>
  )
}
