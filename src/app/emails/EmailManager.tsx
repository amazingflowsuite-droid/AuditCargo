'use client'

import React, { useState, useTransition, useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createNotificationEmail,
  updateNotificationEmail,
  deleteNotificationEmail,
  toggleNotificationEmail,
} from "../actions"
import {
  Mail,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  AlertCircle,
  Power,
  Info,
  Search,
  Filter,
} from "lucide-react"

// ==========================================
// 📝 SUB-COMPONENTE: FORMULÁRIO DE NOVO E-MAIL
// (Estado isolado para evitar re-renderização na lista de cards - Otimização de INP)
// ==========================================

const CreateEmailForm = memo(function CreateEmailForm({
  onEmailCreated,
  onError,
}: {
  onEmailCreated: (newEmail: any) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [active, setActive] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || name.trim().length < 2) {
      onError('O nome ou setor responsável deve ter pelo menos 2 caracteres.')
      return
    }

    const emailTrimmed = email.trim().toLowerCase()
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      onError('Por favor, informe um endereço de e-mail válido (ex: contato@empresa.com.br).')
      return
    }

    const formData = new FormData()
    formData.append('name', name)
    formData.append('email', emailTrimmed)
    formData.append('active', String(active))

    startTransition(async () => {
      const res = await createNotificationEmail(formData)
      if (res.error) {
        onError(res.error)
      } else if (res.success && res.data) {
        onEmailCreated(res.data)
        setName('')
        setEmail('')
        setActive(true)
      }
    })
  }

  return (
    <Card className="lg:col-span-1 h-fit shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0D9488]" />
          Novo E-mail em Cópia
        </CardTitle>
        <CardDescription>
          Adicione contatos internos ou da torre de controle para serem notificados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create_name">Nome do Contato ou Setor</Label>
            <Input
              id="create_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Claudemir Nogueira / Torre SP"
              minLength={2}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_email">Endereço de E-mail</Label>
            <Input
              id="create_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@gmail.com"
              required
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="create_active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 text-[#0D9488] rounded border-gray-300 focus:ring-[#0D9488]"
            />
            <Label htmlFor="create_active" className="text-xs text-[#57534E] cursor-pointer">
              Ativar recebimento imediato de cópias
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Cadastrar E-mail'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
})

// ==========================================
// 📇 SUB-COMPONENTE: CARD DE E-MAIL EM CÓPIA
// ==========================================

const EmailCard = memo(function EmailCard({
  item,
  isAdmin,
  isEditing,
  isDeleting,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggle,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  onError,
  isPending,
}: {
  item: any
  isAdmin: boolean
  isEditing: boolean
  isDeleting: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (formData: FormData) => void
  onToggle: (currentStatus: boolean) => void
  onStartDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onError: (msg: string) => void
  isPending: boolean
}) {
  const [editName, setEditName] = useState(item.name || '')
  const [editEmail, setEditEmail] = useState(item.email || '')
  const [editActive, setEditActive] = useState(item.active !== false)

  const isActive = item.active !== false

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!editName.trim() || editName.trim().length < 2) {
      onError('O nome ou setor responsável deve ter pelo menos 2 caracteres.')
      return
    }

    const emailTrimmed = editEmail.trim().toLowerCase()
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      onError('Por favor, informe um endereço de e-mail válido (ex: contato@empresa.com.br).')
      return
    }

    const formData = new FormData()
    formData.append('name', editName)
    formData.append('email', emailTrimmed)
    formData.append('active', String(editActive))

    onSaveEdit(formData)
  }

  if (isEditing) {
    return (
      <Card className="border-[#0D9488] shadow-md bg-[#F0FDFA]/30">
        <CardHeader className="pb-3 border-b border-[#CCFBF1]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-[#0F766E] flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Editando Contato
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-[#78716C]"
              onClick={onCancelEdit}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          <form onSubmit={handleUpdateSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome / Setor</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 text-xs"
                minLength={2}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id={`edit-active-${item.id}`}
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="w-4 h-4 text-[#0D9488] rounded border-gray-300"
              />
              <Label htmlFor={`edit-active-${item.id}`} className="text-xs cursor-pointer">
                Recebendo cópias (Ativo)
              </Label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5"
                disabled={isPending}
              >
                <Check className="w-3.5 h-3.5" /> Salvar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onCancelEdit}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="hover:border-[#0D9488]/40 transition-colors relative flex flex-col justify-between">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] border ${
              isActive
                ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
                : 'bg-[#F5F5F4] text-[#78716C] border-[#E7E5E4]'
            }`}
          >
            {isActive ? '● Ativo em Cópia' : '○ Pausado'}
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-[#78716C] hover:text-[#0D9488]"
              title={isActive ? 'Pausar notificações' : 'Ativar notificações'}
              onClick={() => onToggle(isActive)}
              disabled={isPending}
            >
              <Power className={`w-3.5 h-3.5 ${isActive ? 'text-[#059669]' : 'text-gray-400'}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-[#78716C] hover:text-[#0D9488]"
              title="Editar contato"
              onClick={onStartEdit}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-[#78716C] hover:text-red-600"
                title="Excluir e-mail"
                onClick={onStartDelete}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <CardTitle className="text-base font-bold mt-2 text-[#1C1917]">{item.name}</CardTitle>

        <CardDescription className="text-xs flex items-center gap-1.5 text-[#0D9488] font-mono mt-1 font-semibold truncate">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          <a href={`mailto:${item.email}`} className="hover:underline">
            {item.email}
          </a>
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 text-xs text-[#78716C] font-mono border-t border-[#E7E5E4] pt-2 mt-auto">
        {isDeleting ? (
          <div className="py-1 space-y-2">
            <p className="text-[11px] text-red-600 font-sans font-medium">Remover este e-mail da cópia?</p>
            <div className="flex items-center gap-2 font-sans">
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onConfirmDelete}
                disabled={isPending}
              >
                Sim, excluir
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onCancelDelete}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px]">
            <span>Notificações:</span>
            <span className="font-semibold text-[#1C1917]">
              {isActive ? 'Chegada & Saída' : 'Desativadas'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
})

// ==========================================
// 📧 COMPONENTE PRINCIPAL: EmailManager
// ==========================================

export function EmailManager({
  initialEmails,
  userRole = 'admin',
}: {
  initialEmails: any[]
  userRole?: 'admin' | 'operator'
}) {
  const isAdmin = userRole === 'admin'
  const [emails, setEmails] = useState(initialEmails)
  const [isPending, startTransition] = useTransition()
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // Edição e deleção
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtro memorizado de busca e status (Otimização de Performance)
  const filteredEmails = useMemo(() => {
    let result = emails

    // Filtro por status
    if (filterStatus === 'active') {
      result = result.filter((item) => item.active !== false)
    } else if (filterStatus === 'inactive') {
      result = result.filter((item) => item.active === false)
    }

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      result = result.filter((item) => {
        const matchName = item.name?.toLowerCase().includes(term)
        const matchEmail = item.email?.toLowerCase().includes(term)
        return matchName || matchEmail
      })
    }

    return result
  }, [emails, filterStatus, searchTerm])

  const handleEmailCreated = (newEmail: any) => {
    setEmails((prev) => [newEmail, ...prev])
  }

  const handleUpdate = (id: string, formData: FormData) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await updateNotificationEmail(id, formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        setEmails((prev) => prev.map((e) => (e.id === id ? res.data : e)))
        setEditingId(null)
      }
    })
  }

  const handleToggle = (id: string, currentStatus: boolean) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await toggleNotificationEmail(id, !currentStatus)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        setEmails((prev) => prev.map((e) => (e.id === id ? res.data : e)))
      }
    })
  }

  const handleDelete = (id: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteNotificationEmail(id)
      if (res.error) {
        setFeedbackError(res.error)
        setDeletingId(null)
      } else if (res.success) {
        setEmails((prev) => prev.filter((e) => e.id !== id))
        setDeletingId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Aviso informativo de funcionamento */}
      <div className="p-4 rounded-[8px] bg-[#F0FDFA] border border-[#99F6E4] flex items-start gap-3">
        <Info className="w-5 h-5 text-[#0D9488] shrink-0 mt-0.5" />
        <div className="text-xs text-[#0F766E] leading-relaxed">
          <p className="font-semibold text-sm text-[#115E59] mb-0.5">
            Disparo Automático com Cópia (Cc)
          </p>
          Sempre que um motorista registrar a <strong>Chegada no Destino</strong> ou a <strong>Finalização da Descarga</strong>, o sistema enviará o comunicado oficial diretamente para o e-mail do destinatário e colocará em cópia (Cc) todos os e-mails ativos cadastrados nesta lista para a sua organização.
        </div>
      </div>

      {feedbackError && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-[6px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{feedbackError}</span>
          </div>
          <button
            onClick={() => setFeedbackError(null)}
            className="text-red-500 hover:text-red-700 text-xs font-bold focus:outline-none"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário desacoplado de cadastro */}
        <CreateEmailForm
          onEmailCreated={handleEmailCreated}
          onError={setFeedbackError}
        />

        {/* Lista e Filtros de E-mails */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Contatos em Cópia ({filteredEmails.length} de {emails.length})
            </h2>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Filtro por Status */}
              <div className="inline-flex rounded-[6px] border border-[#D6D3D1] bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className={`px-2.5 py-1 rounded-[4px] transition-colors ${
                    filterStatus === 'all'
                      ? 'bg-[#0D9488] text-white font-semibold'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('active')}
                  className={`px-2.5 py-1 rounded-[4px] transition-colors ${
                    filterStatus === 'active'
                      ? 'bg-[#0D9488] text-white font-semibold'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Ativos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('inactive')}
                  className={`px-2.5 py-1 rounded-[4px] transition-colors ${
                    filterStatus === 'inactive'
                      ? 'bg-[#0D9488] text-white font-semibold'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Pausados
                </button>
              </div>

              {/* Barra de busca rápida */}
              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 text-[#78716C] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar nome ou e-mail..."
                  className="pl-8 h-8 text-xs bg-white"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917]"
                    title="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredEmails.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <Mail className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">
                {searchTerm || filterStatus !== 'all'
                  ? 'Nenhum e-mail encontrado com os filtros aplicados'
                  : 'Nenhum e-mail cadastrado em cópia'}
              </p>
              <p className="text-xs text-[#78716C] mt-1">
                {searchTerm || filterStatus !== 'all'
                  ? 'Tente alterar os termos da busca ou selecione o filtro "Todos".'
                  : 'Cadastre os e-mails da equipe operacional para receberem automaticamente os avisos de chegada e saída.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredEmails.map((item: any) => (
                <EmailCard
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  isEditing={editingId === item.id}
                  isDeleting={deletingId === item.id}
                  onStartEdit={() => {
                    setFeedbackError(null)
                    setEditingId(item.id)
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(formData) => handleUpdate(item.id, formData)}
                  onToggle={(currentStatus) => handleToggle(item.id, currentStatus)}
                  onStartDelete={() => setDeletingId(item.id)}
                  onCancelDelete={() => setDeletingId(null)}
                  onConfirmDelete={() => handleDelete(item.id)}
                  onError={setFeedbackError}
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
