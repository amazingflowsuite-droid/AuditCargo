import { getRecipients, getCompanies, getSenders } from "../actions"
import { requireAuth } from "@/utils/supabase/auth"
import { RecipientManager } from "./RecipientManager"

export default async function DestinatariosPage() {
  const currentUser = await requireAuth()
  const [recipients, companies, senders] = await Promise.all([
    getRecipients(undefined, currentUser.organization_id),
    getCompanies(currentUser.organization_id),
    getSenders(currentUser.organization_id),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            Cadastro de Destinatários
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Gestão de clientes, atacadistas, lojas e centros de recebimento vinculados a cada Remetente.
          </p>
        </div>
      </div>

      <RecipientManager
        initialRecipients={recipients}
        companies={companies}
        senders={senders}
        userRole={currentUser.role}
      />
    </div>
  )
}
