import { requireSuperAdmin } from "@/utils/supabase/auth"
import { getTenantsAction } from "@/app/actions"
import { MasterManager } from "./MasterManager"

export const metadata = {
  title: "Painel Master - Gestão de Tenants | AuditCargo SaaS",
  description: "Área de Super Administrador para provisionamento e monitoramento de empresas clientes.",
}

export default async function MasterPage() {
  const superAdmin = await requireSuperAdmin()
  const rawTenants = await getTenantsAction()

  // Sanitiza dados para o boundary Client Component
  const tenants = Array.isArray(rawTenants)
    ? rawTenants.map((t) => ({
        id: String(t.id),
        name: String(t.name || ''),
        cnpj: t.cnpj ? String(t.cnpj) : null,
        slug: String(t.slug || ''),
        active: Boolean(t.active),
        created_at: t.created_at ? String(t.created_at) : new Date().toISOString(),
        logo_url: t.logo_url ? String(t.logo_url) : null,
        user_count: Number(t.user_count || 0),
        trip_count: Number(t.trip_count || 0),
        admin_info: t.admin_info
          ? {
              name: String(t.admin_info.name || ''),
              email: String(t.admin_info.email || ''),
            }
          : null,
      }))
    : []

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/30 mb-2">
            <span>Área Restrita Amazing Flow</span>
          </div>
          <h1 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#1C1917] tracking-tight">
            Painel Master • Gestão de Tenants (SaaS)
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Provisione novas empresas clientes, gerencie acessos e monitore a operação de cada organização.
          </p>
        </div>
      </div>

      <MasterManager initialTenants={tenants} currentUserId={superAdmin.id} />
    </div>
  )
}
