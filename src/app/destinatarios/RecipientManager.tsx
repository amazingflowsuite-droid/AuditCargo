'use client'

import React, { useState, useTransition, useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createRecipient, updateRecipient, deleteRecipient } from "../actions"
import { formatCNPJ, formatCEP, formatPhone } from "@/utils/masks"
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  FileText,
  X,
  Check,
  Users,
  Filter,
  Mail,
  AlertCircle,
  Search,
} from "lucide-react"

// ==========================================
// 📝 SUB-COMPONENTE: FORMULÁRIO DE NOVO DESTINATÁRIO
// (Estado isolado para evitar re-renderização na lista de cards - Otimização de INP)
// ==========================================

const CreateRecipientForm = memo(function CreateRecipientForm({
  companies,
  senders,
  onRecipientCreated,
  onError,
}: {
  companies: any[]
  senders: any[]
  onRecipientCreated: (newRec: any) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [senderId, setSenderId] = useState(senders[0]?.id || '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [ie, setIe] = useState('')
  const [phone, setPhone] = useState('')

  const filteredByCompanySenders = useMemo(() => {
    return senders.filter((s) => !companyId || s.company_id === companyId)
  }, [senders, companyId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || name.trim().length < 3) {
      onError('Razão Social / Nome do Destinatário deve possuir pelo menos 3 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', companyId)
    if (senderId) formData.append('sender_id', senderId)
    formData.append('name', name)
    formData.append('email', email)
    formData.append('address', address)
    formData.append('city', city)
    formData.append('zip_code', zipCode)
    formData.append('cnpj', cnpj)
    formData.append('ie', ie)
    formData.append('phone', phone)

    startTransition(async () => {
      const res = await createRecipient(formData)
      if (res.error) {
        onError(res.error)
      } else if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === companyId)
        const senderObj = senders.find((s) => s.id === senderId)
        onRecipientCreated({
          ...res.data,
          companies: companyObj,
          senders: senderObj ? { name: senderObj.name, city: senderObj.city } : null,
        })
        setName('')
        setEmail('')
        setAddress('')
        setCity('')
        setZipCode('')
        setCnpj('')
        setIe('')
        setPhone('')
      }
    })
  }

  return (
    <Card className="lg:col-span-1 h-fit shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0D9488]" />
          Novo Destinatário
        </CardTitle>
        <CardDescription>Cadastre clientes e vincule ao Remetente expedidor.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {companies.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="create_company_id">Empresa Responsável</Label>
              <select
                id="create_company_id"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                className="flex h-10 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-xs text-[#1C1917] focus-ring"
              >
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="create_sender_id">Remetente Vinculado (Expedidor)</Label>
            <select
              id="create_sender_id"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="flex h-10 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-xs text-[#1C1917] focus-ring"
            >
              <option value="">Selecione o Remetente deste cliente...</option>
              {filteredByCompanySenders.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.city})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="create_name">Nome do Destinatário (Razão Social)</Label>
            <Input
              id="create_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Atacadão S/A - Loja 22"
              minLength={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="create_cnpj">CNPJ</Label>
              <Input
                id="create_cnpj"
                value={cnpj}
                onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create_ie">Inscrição Estadual (IE)</Label>
              <Input
                id="create_ie"
                value={ie}
                onChange={(e) => setIe(e.target.value)}
                placeholder="Ex: 987.654.321.000"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="create_address">Endereço Completo / Doca</Label>
            <Input
              id="create_address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Av. Brasil, 1500 - Doca 08"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="create_city">Município / UF</Label>
              <Input
                id="create_city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Campinas - SP"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create_zip_code">CEP</Label>
              <Input
                id="create_zip_code"
                value={zipCode}
                onChange={(e) => setZipCode(formatCEP(e.target.value))}
                placeholder="00000-000"
                maxLength={9}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="create_phone">Telefone Portaria</Label>
              <Input
                id="create_phone"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(19) 3333-4444"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create_email">E-mail Notificação</Label>
              <Input
                id="create_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="portaria@atacadao.com"
              />
            </div>
          </div>

          <Button type="submit" className="w-full mt-2" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar Destinatário'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
})

// ==========================================
// 📇 SUB-COMPONENTE: CARD DO DESTINATÁRIO
// ==========================================

const RecipientCard = memo(function RecipientCard({
  recipient,
  companies,
  senders,
  isAdmin,
  isEditing,
  isDeleting,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  onError,
  isPending,
}: {
  recipient: any
  companies: any[]
  senders: any[]
  isAdmin: boolean
  isEditing: boolean
  isDeleting: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (formData: FormData) => void
  onStartDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onError: (msg: string) => void
  isPending: boolean
}) {
  // Estados locais para edição
  const [editCompanyId, setEditCompanyId] = useState(recipient.company_id || companies[0]?.id || '')
  const [editSenderId, setEditSenderId] = useState(recipient.sender_id || '')
  const [editName, setEditName] = useState(recipient.name || '')
  const [editEmail, setEditEmail] = useState(recipient.email || '')
  const [editAddress, setEditAddress] = useState(recipient.address || '')
  const [editCity, setEditCity] = useState(recipient.city || '')
  const [editZipCode, setEditZipCode] = useState(formatCEP(recipient.zip_code || ''))
  const [editCnpj, setEditCnpj] = useState(formatCNPJ(recipient.cnpj || ''))
  const [editIe, setEditIe] = useState(recipient.ie || '')
  const [editPhone, setEditPhone] = useState(formatPhone(recipient.phone || ''))

  const filteredByCompanySenders = useMemo(() => {
    return senders.filter((s) => !editCompanyId || s.company_id === editCompanyId)
  }, [senders, editCompanyId])

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim() || editName.trim().length < 3) {
      onError('Razão Social / Nome do Destinatário deve ter pelo menos 3 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', editCompanyId)
    if (editSenderId) formData.append('sender_id', editSenderId)
    formData.append('name', editName)
    formData.append('email', editEmail)
    formData.append('address', editAddress)
    formData.append('city', editCity)
    formData.append('zip_code', editZipCode)
    formData.append('cnpj', editCnpj)
    formData.append('ie', editIe)
    formData.append('phone', editPhone)

    onSaveEdit(formData)
  }

  return (
    <Card className="relative hover:border-[#0D9488]/40 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {companies.length > 1 && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#0F172A] border border-[#E7E5E4]">
                {recipient.companies?.name || "Empresa"}
              </span>
            )}
            {recipient.senders?.name ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-[4px] bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1] flex items-center gap-1">
                <Users className="w-3 h-3 text-[#0D9488]" />
                {recipient.senders.name}
              </span>
            ) : (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#78716C] border border-[#E7E5E4]">
                Sem remetente vinculado
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onStartEdit}
              className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
              title="Editar Destinatário"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={onStartDelete}
                className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                title="Excluir Destinatário"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleUpdateSubmit} className="space-y-2 pt-2 text-xs">
            {companies.length > 1 && (
              <div>
                <Label className="text-[11px]">Empresa</Label>
                <select
                  value={editCompanyId}
                  onChange={(e) => setEditCompanyId(e.target.value)}
                  className="flex h-8 w-full rounded-[6px] border border-[#D6D3D1] bg-white px-2 text-xs text-[#1C1917] mt-0.5"
                >
                  {companies.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label className="text-[11px]">Remetente Vinculado</Label>
              <select
                value={editSenderId}
                onChange={(e) => setEditSenderId(e.target.value)}
                className="flex h-8 w-full rounded-[6px] border border-[#D6D3D1] bg-white px-2 text-xs text-[#1C1917] mt-0.5"
              >
                <option value="">Nenhum (Livre)</option>
                {filteredByCompanySenders.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px]">Nome / Razão Social</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-xs mt-0.5"
                minLength={3}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[11px]">CNPJ</Label>
                <Input
                  value={editCnpj}
                  onChange={(e) => setEditCnpj(formatCNPJ(e.target.value))}
                  className="h-8 text-xs font-mono mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[11px]">IE</Label>
                <Input
                  value={editIe}
                  onChange={(e) => setEditIe(e.target.value)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            </div>

            <div>
              <Label className="text-[11px]">Endereço / Doca</Label>
              <Input
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="h-8 text-xs mt-0.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[11px]">Município - UF</Label>
                <Input
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="h-8 text-xs mt-0.5"
                  required
                />
              </div>
              <div>
                <Label className="text-[11px]">CEP</Label>
                <Input
                  value={editZipCode}
                  onChange={(e) => setEditZipCode(formatCEP(e.target.value))}
                  className="h-8 text-xs font-mono mt-0.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[11px]">Telefone</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[11px]">E-mail</Label>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="submit"
                size="sm"
                className="gap-1 h-7 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                disabled={isPending}
              >
                <Check className="w-3 h-3" /> Salvar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={onCancelEdit}
              >
                <X className="w-3 h-3" /> Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <>
            <CardTitle className="text-base font-bold mt-2">{recipient.name}</CardTitle>
            <CardDescription className="text-xs font-mono space-y-0.5 mt-1">
              {recipient.cnpj && <span className="block">CNPJ: {formatCNPJ(recipient.cnpj)}</span>}
              {recipient.ie && <span className="block">IE: {recipient.ie}</span>}
            </CardDescription>
          </>
        )}
      </CardHeader>

      {!isEditing && (
        <CardContent className="pt-0 text-xs text-[#57534E] space-y-2 border-t border-[#E7E5E4] pt-2 mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {recipient.city && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                <span>{recipient.city} {recipient.zip_code ? `- CEP: ${formatCEP(recipient.zip_code)}` : ''}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              {recipient.phone && (
                <div className="flex items-center gap-1 font-mono text-[11px]">
                  <Phone className="w-3 h-3 text-[#0D9488] shrink-0" />
                  <span>{formatPhone(recipient.phone)}</span>
                </div>
              )}
              {recipient.email && (
                <a
                  href={`mailto:${recipient.email}`}
                  className="inline-flex items-center gap-1 text-[11px] text-[#0D9488] hover:underline font-mono"
                  title="Enviar e-mail para portaria"
                >
                  <Mail className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{recipient.email}</span>
                </a>
              )}
            </div>
          </div>

          {recipient.address && (
            <div className="text-[11px] text-[#78716C] truncate">{recipient.address}</div>
          )}
        </CardContent>
      )}

      {isDeleting && (
        <div className="absolute inset-0 bg-[#FAFAF9]/95 backdrop-blur-xs rounded-[8px] p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-red-200">
          <p className="text-xs text-[#1C1917] font-semibold">
            Deseja excluir o destinatário <strong>{recipient.name}</strong>?
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              onClick={onConfirmDelete}
              disabled={isPending}
            >
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={onCancelDelete}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
})

// ==========================================
// 🏢 COMPONENTE PRINCIPAL: RecipientManager
// ==========================================

export function RecipientManager({
  initialRecipients,
  companies,
  senders = [],
  userRole = 'admin',
}: {
  initialRecipients: any[]
  companies: any[]
  senders?: any[]
  userRole?: 'admin' | 'operator'
}) {
  const isAdmin = userRole === 'admin'
  const [recipients, setRecipients] = useState(initialRecipients)
  const [isPending, startTransition] = useTransition()
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [filterSenderId, setFilterSenderId] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Edição e exclusão
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtro memorizado de busca e de remetente (Otimização de Performance)
  const filteredRecipients = useMemo(() => {
    let result = recipients

    // Filtro por Remetente
    if (filterSenderId === 'unassigned') {
      result = result.filter((r) => !r.sender_id)
    } else if (filterSenderId !== 'all') {
      result = result.filter((r) => r.sender_id === filterSenderId)
    }

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      const cleanTermDigits = term.replace(/\D/g, '')

      result = result.filter((r) => {
        const matchName = r.name?.toLowerCase().includes(term)
        const matchCity = r.city?.toLowerCase().includes(term)
        const matchEmail = r.email?.toLowerCase().includes(term)
        const matchSender = r.senders?.name?.toLowerCase().includes(term)
        const matchCnpj = cleanTermDigits && r.cnpj?.replace(/\D/g, '').includes(cleanTermDigits)
        return matchName || matchCity || matchEmail || matchSender || matchCnpj
      })
    }

    return result
  }, [recipients, filterSenderId, searchTerm])

  const handleRecipientCreated = (newRec: any) => {
    setRecipients((prev) => [newRec, ...prev])
  }

  const handleUpdate = (id: string, formData: FormData) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await updateRecipient(id, formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        const senderId = formData.get('sender_id') as string
        const senderObj = senders.find((s) => s.id === senderId)
        const companyId = formData.get('company_id') as string
        const companyObj = companies.find((c) => c.id === companyId)

        setRecipients((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...res.data,
                  companies: companyObj,
                  senders: senderObj ? { name: senderObj.name, city: senderObj.city } : null,
                }
              : r
          )
        )
        setEditingId(null)
      }
    })
  }

  const handleDelete = (id: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteRecipient(id)
      if (res.error) {
        setFeedbackError(res.error)
        setDeletingId(null)
      } else if (res.success) {
        setRecipients((prev) => prev.filter((r) => r.id !== id))
        setDeletingId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
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
        <CreateRecipientForm
          companies={companies}
          senders={senders}
          onRecipientCreated={handleRecipientCreated}
          onError={setFeedbackError}
        />

        {/* Lista e Filtros de Destinatários */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Destinatários Registrados ({filteredRecipients.length} de {recipients.length})
            </h2>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Filtro por Remetente */}
              <div className="flex items-center gap-1.5 bg-white border border-[#D6D3D1] rounded-[6px] px-2 py-1">
                <Filter className="w-3.5 h-3.5 text-[#78716C]" />
                <select
                  value={filterSenderId}
                  onChange={(e) => setFilterSenderId(e.target.value)}
                  className="text-xs bg-transparent border-none text-[#1C1917] focus:outline-none max-w-[160px]"
                >
                  <option value="all">Todos os Remetentes</option>
                  <option value="unassigned">Sem Remetente</option>
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Barra de busca rápida */}
              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 text-[#78716C] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar loja, CNPJ ou cidade..."
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

          {filteredRecipients.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <Building2 className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">
                {searchTerm || filterSenderId !== 'all'
                  ? 'Nenhum destinatário encontrado com os filtros aplicados'
                  : 'Nenhum destinatário cadastrado'}
              </p>
              <p className="text-xs text-[#78716C] mt-1">
                {searchTerm || filterSenderId !== 'all'
                  ? 'Tente alterar os termos da busca ou selecione "Todos os Remetentes".'
                  : 'Cadastre os clientes, atacados ou lojas de entrega.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecipients.map((r: any) => (
                <RecipientCard
                  key={r.id}
                  recipient={r}
                  companies={companies}
                  senders={senders}
                  isAdmin={isAdmin}
                  isEditing={editingId === r.id}
                  isDeleting={deletingId === r.id}
                  onStartEdit={() => {
                    setFeedbackError(null)
                    setEditingId(r.id)
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(formData) => handleUpdate(r.id, formData)}
                  onStartDelete={() => setDeletingId(r.id)}
                  onCancelDelete={() => setDeletingId(null)}
                  onConfirmDelete={() => handleDelete(r.id)}
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
