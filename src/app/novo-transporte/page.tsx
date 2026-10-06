import { getCompanies, getBranches, getDrivers, getSenders, getRecipients } from "../actions"
import { NewTransportForm } from "./NewTransportForm"

export default async function NovoTransportePage() {
  const [companies, branches, drivers, senders, recipients] = await Promise.all([
    getCompanies(),
    getBranches(),
    getDrivers(),
    getSenders(),
    getRecipients(),
  ])

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7E5E4] pb-5">
        <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
          Emissão de Novo Transporte
        </h1>
        <p className="text-sm text-[#57534E] mt-1">
          Geração de token de auditoria com DACTE (CT-e), seleção de Remetente e múltiplos Destinatários.
        </p>
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
