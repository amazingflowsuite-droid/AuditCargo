import { getSenders, getCompanies } from "../actions"
import { requireAuth } from "@/utils/supabase/auth"
import { SenderManager } from "./SenderManager"

export default async function RemetentesPage() {
  const currentUser = await requireAuth()
  const [senders, companies] = await Promise.all([
    getSenders(currentUser.organization_id),
    getCompanies(currentUser.organization_id),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            Cadastro de Remetentes
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Gestão de empresas expedidoras de carga, indústrias e armazéns com dados fiscais e de contato.
          </p>
        </div>
      </div>

      <SenderManager initialSenders={senders} companies={companies} userRole={currentUser.role} />
    </div>
  )
}
