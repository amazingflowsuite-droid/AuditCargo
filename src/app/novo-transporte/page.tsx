import { getCompanies, getBranches, getDrivers, getSenders, getRecipients } from "../actions"
import { requireAuth } from "@/utils/supabase/auth"
import { NewTransportForm } from "./NewTransportForm"

export default async function NovoTransportePage() {
  const currentUser = await requireAuth()
  const orgId = currentUser.organization_id

  const [companies, branches, drivers, senders, recipients] = await Promise.all([
    getCompanies(orgId),
    getBranches(orgId),
    getDrivers(orgId),
    getSenders(orgId),
    getRecipients(undefined, orgId),
  ])

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7E5E4] pb-5">
        <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
          Emissão de Novo Transporte
        </h1>
      </div>

      <NewTransportForm
        companies={companies}
        branches={branches}
        drivers={drivers}
        senders={senders}
        recipients={recipients}
      />
    </div>
  )
}
