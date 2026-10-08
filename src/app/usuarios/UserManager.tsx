'use client'

import React, { useState, useEffect, useTransition, useMemo, memo } from 'react'
import {
  UserPlus,
  Shield,
  User,
  Key,
  CheckCircle2,
  XCircle,
  Trash2,
  Mail,
  Lock,
  AlertCircle,
  X,
  Search,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createUserAction, toggleUserStatusAction, deleteUserAction } from '@/app/actions'

interface UserManagerProps {
  initialUsers: any[]
  currentUserId: string
}

// ==========================================
// 📝 SUB-COMPONENTE: MODAL DE NOVO USUÁRIO
// (Isolado com memo para evitar re-render da tabela enquanto o admin digita a senha/nome)
// ==========================================

const CreateUserModal = memo(function CreateUserModal({
  isOpen,
  onClose,
  onUserCreated,
  onError,
}: {
  isOpen: boolean
  onClose: () => void
  onUserCreated: (newUser: any) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'operator'>('operator')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || name.trim().length < 2) {
      onError('O nome completo deve conter pelo menos 2 caracteres.')
      return
    }

    const emailTrimmed = email.trim().toLowerCase()
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      onError('Por favor, informe um endereço de e-mail corporativo válido.')
      return
    }

    if (!password || password.length < 6) {
      onError('A senha provisória deve conter no mínimo 6 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('name', name.trim())
    formData.append('email', emailTrimmed)
    formData.append('password', password)
    formData.append('role', role)

    startTransition(async () => {
      const res = await createUserAction(formData)
      if (res?.error) {
        onError(res.error)
      } else if (res?.success && res.data) {
        onUserCreated(res.data)
        setName('')
        setEmail('')
        setPassword('')
        setRole('operator')
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-[10px] border border-[#E7E5E4] shadow-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-[#F5F5F4] border-b border-[#E7E5E4]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#0D9488]" />
            <h3 className="font-bold text-base text-[#1C1917]">Cadastrar Novo Colaborador</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#78716C] hover:text-[#1C1917]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create_name" className="text-xs font-semibold">
              Nome Completo
            </Label>
            <Input
              id="create_name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Carlos Silva"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_email" className="text-xs font-semibold">
              E-mail de Acesso
            </Label>
            <Input
              id="create_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="carlos@empresa.com.br"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_password" className="text-xs font-semibold">
              Senha Provisória (Mínimo 6 caracteres)
            </Label>
            <Input
              id="create_password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nível de Permissão</Label>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label
                className={`flex items-center gap-2 p-3 border rounded-[6px] cursor-pointer transition-all ${
                  role === 'operator'
                    ? 'border-[#0D9488] bg-teal-50/40 text-[#0D9488] font-semibold'
                    : 'border-[#E7E5E4] hover:bg-[#FAFAF9]'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="operator"
                  checked={role === 'operator'}
                  onChange={() => setRole('operator')}
                  className="sr-only"
                />
                <User className="w-4 h-4" />
                <div>
                  <div className="text-xs">Operador</div>
                  <div className="text-[10px] text-[#78716C] font-normal">Acesso operacional</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-2 p-3 border rounded-[6px] cursor-pointer transition-all ${
                  role === 'admin'
                    ? 'border-[#0D9488] bg-teal-50/40 text-[#0D9488] font-semibold'
                    : 'border-[#E7E5E4] hover:bg-[#FAFAF9]'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={role === 'admin'}
                  onChange={() => setRole('admin')}
                  className="sr-only"
                />
                <Shield className="w-4 h-4" />
                <div>
                  <div className="text-xs">Administrador</div>
                  <div className="text-[10px] text-[#78716C] font-normal">Acesso total</div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E5E4]">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
            >
              {isPending ? 'Salvando...' : 'Cadastrar Usuário'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
})

// ==========================================
// 👤 SUB-COMPONENTE: LINHA DE USUÁRIO NA TABELA
// (Memoizado para manter INP baixo na lista)
// ==========================================

const UserTableRow = memo(function UserTableRow({
  u,
  isCurrent,
  onToggleStatus,
  onRequestDelete,
  isPending,
}: {
  u: any
  isCurrent: boolean
  onToggleStatus: (u: any) => void
  onRequestDelete: (u: any) => void
  isPending: boolean
}) {
  return (
    <tr className="hover:bg-[#FAFAF9] transition-colors">
      <td className="px-4 py-3.5 font-medium">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#F5F5F4] flex items-center justify-center text-[#0F172A] border border-[#E7E5E4]">
            {u.role === 'admin' ? (
              <Shield className="w-4 h-4 text-[#0D9488]" />
            ) : (
              <User className="w-4 h-4 text-[#57534E]" />
            )}
          </div>
          <div>
            <span className="font-semibold text-sm text-[#1C1917]">{u.name}</span>
            {isCurrent && (
              <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-50 text-[#0D9488] border border-teal-200">
                Você
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 font-mono text-[#57534E]">{u.email}</td>
      <td className="px-4 py-3.5">
        {u.role === 'admin' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Shield className="w-3 h-3 text-emerald-600" />
            Administrador
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <User className="w-3 h-3 text-slate-500" />
            Operador
          </span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {u.active ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Ativo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-600 font-medium">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            Inativo
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {!isCurrent && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleStatus(u)}
                disabled={isPending}
                className="h-8 px-2.5 text-xs text-[#57534E]"
              >
                {u.active ? 'Inativar' : 'Ativar'}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRequestDelete(u)}
                disabled={isPending}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Excluir Colaborador"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
})

// ==========================================
// 👥 COMPONENTE PRINCIPAL: USER MANAGER
// ==========================================

export function UserManager({ initialUsers, currentUserId }: UserManagerProps) {
  const [users, setUsers] = useState(initialUsers)

  useEffect(() => {
    setUsers(initialUsers)
  }, [initialUsers])

  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteModalUser, setDeleteModalUser] = useState<any | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users
    const term = searchTerm.toLowerCase()
    return users.filter((u) => {
      return (
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.role && u.role.toLowerCase().includes(term))
      )
    })
  }, [users, searchTerm])

  const handleUserCreated = (newUser: any) => {
    setSuccessMsg(`Colaborador ${newUser.name} cadastrado com sucesso!`)
    setError('')
    // Atualiza lista local com o objeto real retornado pelo backend contendo o UUID real do Postgres
    setUsers((prev) => [newUser, ...prev])
  }

  const handleToggleStatus = (u: any) => {
    if (u.id === currentUserId) return
    const newStatus = !u.active
    startTransition(async () => {
      const res = await toggleUserStatusAction(u.id, newStatus)
      if (res?.error) {
        setError(res.error)
      } else {
        setUsers((prev) =>
          prev.map((item) => (item.id === u.id ? { ...item, active: newStatus } : item))
        )
      }
    })
  }

  const handleDeleteUser = (u: any) => {
    if (u.id === currentUserId) return
    startTransition(async () => {
      const res = await deleteUserAction(u.id)
      if (res?.error) {
        setError(res.error)
      } else {
        setUsers((prev) => prev.filter((item) => item.id !== u.id))
        setDeleteModalUser(null)
        setSuccessMsg(`Colaborador removido com sucesso.`)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Feedback Messages */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-[6px] flex items-center justify-between">
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
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-[6px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra Superior: Busca + Botão Novo Usuário */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#A8A29E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail ou perfil..."
            className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-[#E7E5E4] rounded-[6px] text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>

        <Button
          onClick={() => {
            setError('')
            setModalOpen(true)
          }}
          className="gap-2 h-10 px-4 bg-[#0D9488] hover:bg-[#0F766E] text-white shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Tabela de Usuários */}
      <Card className="border border-[#E7E5E4] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#1C1917] divide-y divide-[#E7E5E4]">
            <thead className="bg-[#F5F5F4] text-[#57534E] uppercase font-mono tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Colaborador</th>
                <th className="px-4 py-3.5 font-semibold">E-mail de Acesso</th>
                <th className="px-4 py-3.5 font-semibold">Nível de Permissão</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E5E4] bg-white">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[#78716C]">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <UserTableRow
                    key={u.id}
                    u={u}
                    isCurrent={u.id === currentUserId}
                    onToggleStatus={handleToggleStatus}
                    onRequestDelete={setDeleteModalUser}
                    isPending={isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Novo Usuário Isolado */}
      <CreateUserModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onUserCreated={handleUserCreated}
        onError={setError}
      />

      {/* Modal: Confirmar Exclusão */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-[10px] border border-[#E7E5E4] shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-bold text-base text-[#1C1917]">Excluir Colaborador?</h3>
            </div>
            <p className="text-xs text-[#57534E]">
              Tem certeza que deseja remover o acesso de <strong>{deleteModalUser.name}</strong> (
              {deleteModalUser.email})? Esta ação não pode ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteModalUser(null)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => handleDeleteUser(deleteModalUser)}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isPending ? 'Excluindo...' : 'Sim, Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

