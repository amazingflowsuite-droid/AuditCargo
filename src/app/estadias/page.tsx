import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/utils/supabase/auth'
import { createClient } from '@/utils/supabase/server'
import { EstadiasReport } from './EstadiasReport'

export default async function EstadiasPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin' && !user.is_super_admin) {
    redirect('/')
  }

  const supabase = await createClient()

  // Fetch completed trips that have an arrival_time and completion_time
  let query = supabase
    .from('trips')
    .select(`
      *,
      drivers(name),
      companies(name),
      senders(name, franchise_hours, demurrage_hourly_rate)
    `)
    .not('arrival_time', 'is', null)
    .not('completion_time', 'is', null)
    .order('completion_time', { ascending: false })

  if (user.organization_id) {
    query = query.eq('organization_id', user.organization_id)
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
            Relatório analítico de tempo de espera.
          </p>
        </div>
      </div>

      <EstadiasReport trips={trips || []} />
    </div>
  )
}
