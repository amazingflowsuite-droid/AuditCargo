import { getNotificationEmails } from "../actions"
import { requireAuth } from "@/utils/supabase/auth"
import { EmailManager } from "./EmailManager"

export default async function EmailsPage() {
  const currentUser = await requireAuth()
  const emails = await getNotificationEmails(currentUser.organization_id)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            E-mails em Cópia (Cc)
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Gerencie os e-mails operacionais que receberão cópias automáticas dos comunicados de chegada e saída de cargas.
          </p>
        </div>
      </div>

      <EmailManager initialEmails={emails} userRole={currentUser.role} />
    </div>
  )
}
