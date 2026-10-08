import { redirect } from 'next/navigation'
import { requireAuth } from '@/utils/supabase/auth'
import { createClient } from '@/utils/supabase/server'
import { EstadiasReport } from './EstadiasReport'

export default async function EstadiasPage() {
  const user = await requireAuth()

  // Apenas administradores e superadmins acessam a apuração de estadias
  if (user.role !== 'admin' && !user.is_super_admin) {
    redirect('/')
  }

  // Fail-secure: se usuário não for super admin e não tiver organização vinculada, bloqueia consulta
  const targetOrgId = user.organization_id
  if (!user.is_super_admin && !targetOrgId) {
    return (
      <div className="p-8 text-center bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
        <h2 className="text-lg font-bold">Acesso Restrito</h2>
        <p className="text-sm mt-1">Sua conta de administrador não possui uma organização vinculada.</p>
      </div>
    )
  }

  const supabase = await createClient()

  // Projeção cirúrgica de colunas: evita expor PINs, share_tokens e payloads pesados de trips
  let query = supabase
    .from('trips')
    .select(`
      id,
      cte_number,
      invoices,
      destination,
      arrival_time,
      completion_time,
      sender,
      organization_id,
      drivers(name),
      senders(name, franchise_hours, demurrage_hourly_rate)
    `)
    .not('arrival_time', 'is', null)
    .not('completion_time', 'is', null)
    .order('completion_time', { ascending: false })
    .limit(300)

  if (targetOrgId) {
    query = query.eq('organization_id', targetOrgId)
  }

  const { data: trips, error } = await query

  if (error) {
    console.error('Erro ao buscar estadias:', error)
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif-title font-bold text-[#1C1917] tracking-tight">
            Apuração de Estadias
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Relatório analítico de tempo de espera e custos de estadia por remetente.
          </p>
        </div>
      </div>

      <EstadiasReport trips={trips || []} />
    </div>
  )
}
