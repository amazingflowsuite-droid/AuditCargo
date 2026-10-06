'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Building2,
  Users,
  Truck,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Mail,
  Lock,
  User,
  FileText,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTenantAction, toggleTenantStatusAction } from '@/app/actions'

interface TenantItem {
  id: string
  name: string
  cnpj: string | null
  slug: string
  active: boolean
  created_at: string
  user_count: number
  trip_count: number
  admin_info: {
    name: string
    email: string
  } | null
}

interface MasterManagerProps {
  initialTenants: TenantItem[]
  currentUserId: string
}

export function MasterManager({ initialTenants }: MasterManagerProps) {
  const [tenants, setTenants] = useState<TenantItem[]>(initialTenants)
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [statusConfirmModal, setStatusConfirmModal] = useState<TenantItem | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Campos do formulário
  const [companyName, setCompanyName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  useEffect(() => {
    setTenants(initialTenants)
  }, [initialTenants])

  // Métricas
  const totalTenants = tenants.length
  const activeTenants = tenants.filter((t) => t.active).length
  const totalUsers = tenants.reduce((acc, t) => acc + (t.user_count || 0), 0)
  const totalTrips = tenants.reduce((acc, t) => acc + (t.trip_count || 0), 0)

  // Filtro
  const filteredTenants = tenants.filter((t) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      t.name.toLowerCase().includes(term) ||
      (t.cnpj && t.cnpj.toLowerCase().includes(term)) ||
      t.slug.toLowerCase().includes(term) ||
      (t.admin_info &&
        (t.admin_info.name.toLowerCase().includes(term) ||
          t.admin_info.email.toLowerCase().includes(term)))
    )
  })

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    const formData = new FormData()
    formData.append('companyName', companyName)
    formData.append('cnpj', cnpj)
    formData.append('adminName', adminName)
    formData.append('adminEmail', adminEmail)
    formData.append('adminPassword', adminPassword)

    startTransition(async () => {
      const res = await createTenantAction(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        setSuccessMsg(`Empresa "${companyName}" provisionada com sucesso! O administrador já pode acessar.`)
        setModalOpen(false)
        setCompanyName('')
        setCnpj('')
        setAdminName('')
        setAdminEmail('')
        setAdminPassword('')
        // Atualiza a lista local temporariamente até revalidate
        setTenants((prev) => [
          {
            id: Math.random().toString(),
            name: companyName,
            cnpj: cnpj || null,
            slug: companyName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            active: true,
            created_at: new Date().toISOString(),
            user_count: 1,
            trip_count: 0,
            admin_info: {
              name: adminName,
              email: adminEmail,
            },
          },
          ...prev,
        ])
      }
    })
  }

  const handleToggleStatus = (tenant: TenantItem) => {
    const newStatus = !tenant.active
    startTransition(async () => {
      const res = await toggleTenantStatusAction(tenant.id, newStatus)
      if (res?.error) {
        setError(res.error)
      } else {
        setTenants((prev) =>
          prev.map((item) => (item.id === tenant.id ? { ...item, active: newStatus } : item))
        )
        setStatusConfirmModal(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Mensagens de Feedback */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-[8px] flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-[8px] flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cards de Métricas Master */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-[#E7E5E4] shadow-xs bg-white rounded-[10px]">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase text-[#78716C] tracking-wider">Total de Clientes</p>
              <h3 className="text-2xl font-bold text-[#1C1917] mt-1">{totalTenants}</h3>
            </div>
            <div className="w-10 h-10 rounded-[8px] bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-[#E7E5E4] shadow-xs bg-white rounded-[10px]">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase text-[#78716C] tracking-wider">Clientes Ativos</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">{activeTenants}</h3>
            </div>
            <div className="w-10 h-10 rounded-[8px] bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-[#E7E5E4] shadow-xs bg-white rounded-[10px]">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase text-[#78716C] tracking-wider">Usuários no SaaS</p>
              <h3 className="text-2xl font-bold text-[#0D9488] mt-1">{totalUsers}</h3>
            </div>
            <div className="w-10 h-10 rounded-[8px] bg-teal-50 text-[#0D9488] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-[#E7E5E4] shadow-xs bg-white rounded-[10px]">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase text-[#78716C] tracking-wider">Transportes Gerados</p>
              <h3 className="text-2xl font-bold text-[#1C1917] mt-1">{totalTrips}</h3>
            </div>
            <div className="w-10 h-10 rounded-[8px] bg-slate-100 text-[#0F172A] flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Ações: Busca + Botão Novo Cliente */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#A8A29E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar empresa, CNPJ, slug ou gestor..."
            className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-[#E7E5E4] rounded-[6px] text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>

        <Button
          onClick={() => {
            setError('')
            setModalOpen(true)
          }}
          className="gap-2 h-10 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white shadow-sm font-semibold rounded-[6px]"
        >
          <Plus className="w-4 h-4 text-[#0D9488]" />
          Nova Empresa Cliente
        </Button>
      </div>

      {/* Tabela de Tenants */}
      <Card className="border border-[#E7E5E4] shadow-xs overflow-hidden rounded-[10px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#1C1917] divide-y divide-[#E7E5E4]">
            <thead className="bg-[#F5F5F4] text-[#57534E] uppercase font-mono tracking-wider text-[11px]">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Organização / Tenant</th>
                <th className="px-5 py-3.5 font-semibold">CNPJ</th>
                <th className="px-5 py-3.5 font-semibold">Gestor Administrador</th>
                <th className="px-5 py-3.5 font-semibold">Atividade (Usuários / Cargas)</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E5E4] bg-white">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#78716C]">
                    Nenhuma empresa encontrada com os termos buscados.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-[#FAFAF9] transition-colors">
                    <td className="px-5 py-4 font-medium">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[8px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700 shrink-0 font-bold">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-[#1C1917]">{t.name}</div>
                          <div className="text-[10px] font-mono text-[#78716C] mt-0.5">slug: {t.slug}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono text-[#57534E]">
                      {t.cnpj || <span className="text-[#A8A29E] italic">Não informado</span>}
                    </td>

                    <td className="px-5 py-4">
                      {t.admin_info ? (
                        <div>
                          <span className="font-semibold text-[#1C1917]">{t.admin_info.name}</span>
                          <div className="text-[11px] font-mono text-[#57534E] flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-[#0D9488]" />
                            {t.admin_info.email}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#A8A29E] italic text-[11px]">Nenhum admin vinculado</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-teal-50 text-[#0D9488] border border-teal-200">
                          <Users className="w-3 h-3" /> {t.user_count} usuários
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                          <Truck className="w-3 h-3" /> {t.trip_count} viagens
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {t.active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold bg-red-50 text-red-800 border border-red-200">
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                          Bloqueado
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setStatusConfirmModal(t)}
                        className={`h-8 px-2.5 text-xs font-semibold ${
                          t.active
                            ? 'text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200'
                            : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        {t.active ? 'Bloquear Acesso' : 'Reativar Empresa'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Cadastrar Nova Empresa Cliente */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-[12px] border border-[#E7E5E4] shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#0F172A] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[6px] bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Provisionar Novo Cliente (Tenant)</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Criação atômica de Organização e Administrador</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="p-6 space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-[8px] text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  O sistema criará o ambiente isolado para o cliente, configurando automaticamente a empresa principal com a filial Matriz e o acesso de Administrador.
                </span>
              </div>

              <div className="space-y-3 pt-1">
                <div className="text-xs font-mono uppercase tracking-wider text-[#78716C] font-semibold border-b border-[#E7E5E4] pb-1">
                  1. Dados da Organização
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-xs font-semibold">
                    Razão Social / Nome da Empresa *
                  </Label>
                  <Input
                    id="companyName"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Transportes São Bento Ltda"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cnpj" className="text-xs font-semibold">
                    CNPJ da Empresa (Opcional)
                  </Label>
                  <Input
                    id="cnpj"
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="text-xs font-mono uppercase tracking-wider text-[#78716C] font-semibold border-b border-[#E7E5E4] pb-1">
                  2. Administrador Responsável
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adminName" className="text-xs font-semibold">
                    Nome Completo do Gestor *
                  </Label>
                  <Input
                    id="adminName"
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Ex: Roberto Alves"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adminEmail" className="text-xs font-semibold">
                    E-mail de Acesso do Administrador *
                  </Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="roberto@saobento.com.br"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adminPassword" className="text-xs font-semibold">
                    Senha Provisória (Mínimo 6 caracteres) *
                  </Label>
                  <Input
                    id="adminPassword"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E7E5E4]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold"
                >
                  {isPending ? 'Provisionando...' : 'Criar Empresa Cliente'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Alteração de Status */}
      {statusConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-[10px] border border-[#E7E5E4] shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="font-bold text-base text-[#1C1917]">
                {statusConfirmModal.active ? 'Bloquear Empresa?' : 'Reativar Empresa?'}
              </h3>
            </div>
            <p className="text-xs text-[#57534E] leading-relaxed">
              {statusConfirmModal.active ? (
                <>
                  Ao bloquear a empresa <strong>{statusConfirmModal.name}</strong>, todos os usuários vinculados a ela perderão o acesso ao sistema imediatamente.
                </>
              ) : (
                <>
                  Ao reativar a empresa <strong>{statusConfirmModal.name}</strong>, os colaboradores voltarão a ter acesso normal ao painel.
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusConfirmModal(null)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => handleToggleStatus(statusConfirmModal)}
                disabled={isPending}
                className={statusConfirmModal.active ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
              >
                {isPending ? 'Processando...' : statusConfirmModal.active ? 'Sim, Bloquear' : 'Sim, Reativar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
