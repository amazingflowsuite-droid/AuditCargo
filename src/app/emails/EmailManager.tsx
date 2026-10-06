'use client'

import { useState, useTransition } from 'react'
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
  ShieldCheck,
  Power,
  Info,
} from "lucide-react"

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

  // Novo e-mail
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [active, setActive] = useState(true)

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editActive, setEditActive] = useState(true)

  // Deleção
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedbackError(null)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('email', email)
    formData.append('active', String(active))

    startTransition(async () => {
      const res = await createNotificationEmail(formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        setEmails([res.data, ...emails])
        setName('')
        setEmail('')
        setActive(true)
      }
    })
  }

  const startEdit = (item: any) => {
    setFeedbackError(null)
    setEditingId(item.id)
    setEditName(item.name)
    setEditEmail(item.email)
    setEditActive(item.active !== false)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleUpdate = async (id: string) => {
    setFeedbackError(null)
    const formData = new FormData()
    formData.append('name', editName)
    formData.append('email', editEmail)
    formData.append('active', String(editActive))

    startTransition(async () => {
      const res = await updateNotificationEmail(id, formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        setEmails(emails.map((e) => (e.id === id ? res.data : e)))
        setEditingId(null)
      }
    })
  }

  const handleToggle = async (id: string, currentStatus: boolean) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await toggleNotificationEmail(id, !currentStatus)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        setEmails(emails.map((e) => (e.id === id ? res.data : e)))
      }
    })
  }

  const handleDelete = async (id: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteNotificationEmail(id)
      if (res.error) {
        setFeedbackError(res.error)
        setDeletingId(null)
      } else if (res.success) {
        setEmails(emails.filter((e) => e.id !== id))
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
          Sempre que um motorista registrar a <strong>Chegada no Destino</strong> ou a <strong>Finalização da Descarga</strong>, o sistema enviará o comunicado oficial diretamente para o e-mail do destinatário e colocará em cópia (Cc) todos os e-mails ativos cadastrados nesta lista.
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
            className="text-red-500 hover:text-red-700 text-xs font-bold"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário de Cadastro */}
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
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome do Contato ou Setor</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Claudemir Nogueira / Torre SP"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Endereço de E-mail</Label>
                <Input
                  id="email"
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
                  id="active"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 text-[#0D9488] rounded border-gray-300 focus:ring-[#0D9488]"
                />
                <Label htmlFor="active" className="text-xs text-[#57534E] cursor-pointer">
                  Ativar recebimento imediato de cópias
                </Label>
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? 'Salvando...' : 'Cadastrar E-mail'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Lista de E-mails */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Contatos em Cópia Cadastrados ({emails.length})
            </h2>
          </div>

          {emails.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <Mail className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">Nenhum e-mail cadastrado em cópia</p>
              <p className="text-xs text-[#78716C] mt-1">
                Cadastre os e-mails da equipe operacional para receberem automaticamente os avisos de chegada e saída.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {emails.map((item: any) => {
                const isEditing = editingId === item.id
                const isDeleting = deletingId === item.id
                const isActive = item.active !== false

                if (isEditing) {
                  return (
                    <Card key={item.id} className="border-[#0D9488] shadow-md bg-[#F0FDFA]/30">
                      <CardHeader className="pb-3 border-b border-[#CCFBF1]">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-bold text-[#0F766E] flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5" /> Editando Contato
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#78716C]"
                            onClick={cancelEdit}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-3 space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Nome / Setor</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9 text-xs"
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
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1.5"
                            onClick={() => handleUpdate(item.id)}
                            disabled={isPending}
                          >
                            <Check className="w-3.5 h-3.5" /> Salvar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={cancelEdit}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                }

                return (
                  <Card key={item.id} className="hover:border-[#0D9488]/40 transition-colors relative flex flex-col justify-between">
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
                            onClick={() => handleToggle(item.id, isActive)}
                            disabled={isPending}
                          >
                            <Power className={`w-3.5 h-3.5 ${isActive ? 'text-[#059669]' : 'text-gray-400'}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#78716C] hover:text-[#0D9488]"
                            title="Editar contato"
                            onClick={() => startEdit(item)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-[#78716C] hover:text-red-600"
                              title="Excluir e-mail"
                              onClick={() => setDeletingId(item.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <CardTitle className="text-base font-bold mt-2 text-[#1C1917]">{item.name}</CardTitle>
                      
                      <CardDescription className="text-xs flex items-center gap-1.5 text-[#0D9488] font-mono mt-1 font-semibold truncate">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        {item.email}
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
                              onClick={() => handleDelete(item.id)}
                              disabled={isPending}
                            >
                              Sim, excluir
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setDeletingId(null)}
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
