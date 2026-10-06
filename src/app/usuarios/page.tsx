import { requireAdmin } from '@/utils/supabase/auth'
import { getUsersAction } from '@/app/actions'
import { UserManager } from './UserManager'

export default async function UsuariosPage() {
  const admin = await requireAdmin()
  const users = await getUsersAction()

  const safeUsers = Array.isArray(users)
    ? users.map((u) => ({
        id: String(u.id),
        name: String(u.name || ''),
        email: String(u.email || ''),
        role: (u.role || 'operator') as 'admin' | 'operator',
        active: Boolean(u.active),
        created_at: u.created_at ? String(u.created_at) : new Date().toISOString(),
      }))
    : []

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            Gestão da Equipe & Usuários
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Cadastre operadores, defina níveis de acesso e gerencie os colaboradores da organização{' '}
            <strong className="text-[#0D9488]">{admin.organization?.name || 'sua empresa'}</strong>.
          </p>
        </div>
      </div>

      <UserManager initialUsers={safeUsers} currentUserId={String(admin.id)} />
    </div>
  )
}
