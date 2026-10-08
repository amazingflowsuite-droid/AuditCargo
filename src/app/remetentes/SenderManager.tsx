'use client'

import React, { useState, useTransition, useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createSender,
  updateSender,
  deleteSender,
  createRecipient,
  deleteRecipient,
} from "../actions"
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
  ChevronDown,
  ChevronUp,
  Users,
  Mail,
  AlertCircle,
  Search,
} from "lucide-react"

// ==========================================
// 📝 SUB-COMPONENTE: FORMULÁRIO DE NOVO REMETENTE
// (Estado isolado para evitar re-renderização na lista - Otimização de INP)
// ==========================================

const CreateSenderForm = memo(function CreateSenderForm({
  companies,
  onSenderCreated,
  onError,
}: {
  companies: any[]
  onSenderCreated: (newSender: any) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [ie, setIe] = useState('')
  const [phone, setPhone] = useState('')
  const [franchiseHours, setFranchiseHours] = useState('0')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || name.trim().length < 3) {
      onError('Razão Social / Nome do Remetente deve conter pelo menos 3 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', companyId)
    formData.append('name', name)
    formData.append('address', address)
    formData.append('city', city)
    formData.append('zip_code', zipCode)
    formData.append('cnpj', cnpj)
    formData.append('ie', ie)
    formData.append('phone', phone)
    formData.append('franchise_hours', franchiseHours)

    startTransition(async () => {
      const res = await createSender(formData)
      if (res.error) {
        onError(res.error)
      } else if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === companyId)
        onSenderCreated({ ...res.data, companies: companyObj, recipients: [] })
        setName('')
        setAddress('')
        setCity('')
        setZipCode('')
        setCnpj('')
        setIe('')
        setPhone('')
        setFranchiseHours('0')
      }
    })
  }

  return (
    <Card className="lg:col-span-1 h-fit shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0D9488]" />
          Novo Remetente
        </CardTitle>
        <CardDescription>Cadastre o expedidor de mercadorias (indústria, fábrica ou armazém).</CardDescription>
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
            <Label htmlFor="create_name">Nome do Remetente (Razão Social)</Label>
            <Input
              id="create_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Cervejaria Ambev S/A"
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
                placeholder="Ex: 123.456.789.000"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="create_address">Endereço Completo</Label>
            <Input
              id="create_address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Rod. Marechal Rondon, Km 320"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="create_city">Município / UF</Label>
              <Input
                id="create_city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Agudos - SP"
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
              <Label htmlFor="create_phone">Telefone / Fone</Label>
              <Input
                id="create_phone"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create_franchise">Franquia de Espera (Horas)</Label>
              <Input
                id="create_franchise"
                type="number"
                step="0.5"
                min="0"
                value={franchiseHours}
                onChange={(e) => setFranchiseHours(e.target.value)}
                placeholder="Ex: 4"
              />
            </div>
          </div>

          <Button type="submit" className="w-full mt-2" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar Remetente'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
})

// ==========================================
// 🏢 SUB-COMPONENTE: FORMULÁRIO DE DESTINATÁRIO VINCULADO
// ==========================================

const CreateSubRecipientForm = memo(function CreateSubRecipientForm({
  sender,
  onRecipientCreated,
  onCancel,
  onError,
}: {
  sender: any
  onRecipientCreated: (newRec: any) => void
  onCancel: () => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [recName, setRecName] = useState('')
  const [recEmail, setRecEmail] = useState('')
  const [recAddress, setRecAddress] = useState('')
  const [recCity, setRecCity] = useState('')
  const [recZipCode, setRecZipCode] = useState('')
  const [recCnpj, setRecCnpj] = useState('')
  const [recIe, setRecIe] = useState('')
  const [recPhone, setRecPhone] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!recName.trim() || recName.trim().length < 3) {
      onError('Nome do Destinatário deve ter pelo menos 3 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', sender.company_id || '')
    formData.append('sender_id', sender.id)
    formData.append('name', recName)
    formData.append('email', recEmail)
    formData.append('address', recAddress)
    formData.append('city', recCity)
    formData.append('zip_code', recZipCode)
    formData.append('cnpj', recCnpj)
    formData.append('ie', recIe)
    formData.append('phone', recPhone)

    startTransition(async () => {
      const res = await createRecipient(formData)
      if (res.error) {
        onError(res.error)
      } else if (res.success && res.data) {
        onRecipientCreated(res.data)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-white rounded-[6px] border border-[#0D9488]/40 space-y-2 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#0D9488] uppercase font-mono">
          Novo Destinatário de {sender.name}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 focus:outline-none"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <Input
          placeholder="Nome do Destinatário / Loja"
          value={recName}
          onChange={(e) => setRecName(e.target.value)}
          className="h-8 text-xs"
          minLength={3}
          required
        />
        <Input
          placeholder="CNPJ"
          value={recCnpj}
          onChange={(e) => setRecCnpj(formatCNPJ(e.target.value))}
          className="h-8 text-xs font-mono"
        />
        <Input
          placeholder="Endereço / Doca"
          value={recAddress}
          onChange={(e) => setRecAddress(e.target.value)}
          className="h-8 text-xs"
        />
        <Input
          placeholder="Município - UF"
          value={recCity}
          onChange={(e) => setRecCity(e.target.value)}
          className="h-8 text-xs"
          required
        />
        <Input
          placeholder="CEP"
          value={recZipCode}
          onChange={(e) => setRecZipCode(formatCEP(e.target.value))}
          className="h-8 text-xs font-mono"
        />
        <Input
          placeholder="Telefone Portaria"
          value={recPhone}
          onChange={(e) => setRecPhone(formatPhone(e.target.value))}
          className="h-8 text-xs"
        />
      </div>

      <Input
        placeholder="E-mail Notificação Chegada (Ex: portaria@destinatario.com.br)"
        type="email"
        value={recEmail}
        onChange={(e) => setRecEmail(e.target.value)}
        className="h-8 text-xs"
      />

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          className="h-7 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
          disabled={!recName || isPending}
        >
          {isPending ? 'Salvando...' : 'Salvar Destinatário'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
})

// ==========================================
// 📇 SUB-COMPONENTE: CARD DO REMETENTE
// ==========================================

const SenderCard = memo(function SenderCard({
  sender,
  companies,
  isAdmin,
  isEditing,
  isDeleting,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  onAddRecipient,
  onDeleteRecipient,
  onError,
  isPending,
}: {
  sender: any
  companies: any[]
  isAdmin: boolean
  isEditing: boolean
  isDeleting: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (formData: FormData) => void
  onStartDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onAddRecipient: (senderId: string, newRec: any) => void
  onDeleteRecipient: (senderId: string, recipientId: string) => void
  onError: (msg: string) => void
  isPending: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isAddingRecipient, setIsAddingRecipient] = useState(false)

  // Estados locais para edição
  const [editCompanyId, setEditCompanyId] = useState(sender.company_id || companies[0]?.id || '')
  const [editName, setEditName] = useState(sender.name || '')
  const [editAddress, setEditAddress] = useState(sender.address || '')
  const [editCity, setEditCity] = useState(sender.city || '')
  const [editZipCode, setEditZipCode] = useState(formatCEP(sender.zip_code || ''))
  const [editCnpj, setEditCnpj] = useState(formatCNPJ(sender.cnpj || ''))
  const [editIe, setEditIe] = useState(sender.ie || '')
  const [editPhone, setEditPhone] = useState(formatPhone(sender.phone || ''))
  const [editFranchiseHours, setEditFranchiseHours] = useState(
    sender.franchise_hours !== undefined ? String(sender.franchise_hours) : '0'
  )

  const subRecipients = sender.recipients || []

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim() || editName.trim().length < 3) {
      onError('Razão Social / Nome do Remetente deve conter pelo menos 3 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', editCompanyId)
    formData.append('name', editName)
    formData.append('address', editAddress)
    formData.append('city', editCity)
    formData.append('zip_code', editZipCode)
    formData.append('cnpj', editCnpj)
    formData.append('ie', editIe)
    formData.append('phone', editPhone)
    formData.append('franchise_hours', editFranchiseHours)

    onSaveEdit(formData)
  }

  return (
    <Card className="relative hover:border-[#0D9488]/40 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          {companies.length > 1 && (
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#0F172A] border border-[#E7E5E4]">
              {sender.companies?.name || "Empresa"}
            </span>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onStartEdit}
              className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
              title="Editar Remetente"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={onStartDelete}
                className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                title="Excluir Remetente"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleUpdateSubmit} className="space-y-2 pt-2 text-xs">
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
              <Label className="text-[11px]">Endereço</Label>
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
                <Label className="text-[11px]">Telefone</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[11px]">Franquia de Espera (Horas)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={editFranchiseHours}
                  onChange={(e) => setEditFranchiseHours(e.target.value)}
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
            <CardTitle className="text-base font-bold mt-2">{sender.name}</CardTitle>
            <CardDescription className="text-xs font-mono space-y-0.5 mt-1">
              {sender.cnpj && <span className="block">CNPJ: {formatCNPJ(sender.cnpj)}</span>}
              {sender.ie && <span className="block">IE: {sender.ie}</span>}
            </CardDescription>
          </>
        )}
      </CardHeader>

      {!isEditing && (
        <CardContent className="pt-0 text-xs text-[#57534E] space-y-2 border-t border-[#E7E5E4] pt-2 mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {sender.city && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                <span>{sender.city} {sender.zip_code ? `- CEP: ${formatCEP(sender.zip_code)}` : ''}</span>
              </div>
            )}
            <div className="flex items-center gap-4">
              {sender.phone && (
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <Phone className="w-3 h-3 text-[#0D9488] shrink-0" />
                  <span>{formatPhone(sender.phone)}</span>
                </div>
              )}
              {sender.franchise_hours !== undefined && sender.franchise_hours > 0 && (
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#CA8A04] bg-yellow-50 px-1.5 py-0.5 rounded-[4px] border border-yellow-200">
                  <span>⏱ Franquia: {sender.franchise_hours}h</span>
                </div>
              )}
            </div>
          </div>

          {sender.address && (
            <div className="text-[11px] text-[#78716C] truncate">{sender.address}</div>
          )}

          {/* BARRA HIERÁRQUICA: 1 REMETENTE -> N DESTINATÁRIOS ABAIXO */}
          <div className="pt-2 border-t border-[#E7E5E4]/80 mt-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] hover:text-[#0D9488] transition-colors"
              >
                <Users className="w-3.5 h-3.5 text-[#0D9488]" />
                <span>Destinatários / Clientes ({subRecipients.length})</span>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsExpanded(true)
                  setIsAddingRecipient(true)
                }}
                className="h-7 text-[11px] gap-1 border-[#0D9488] text-[#0D9488] hover:bg-teal-50"
              >
                <Plus className="w-3 h-3" /> Adicionar Destinatário
              </Button>
            </div>

            {/* LISTA DE DESTINATÁRIOS "ABAIXO" DO REMETENTE */}
            {isExpanded && (
              <div className="mt-3 p-3 rounded-[6px] bg-[#F5F5F4] border border-[#E7E5E4] space-y-3">
                {isAddingRecipient && (
                  <CreateSubRecipientForm
                    sender={sender}
                    onRecipientCreated={(newRec) => {
                      onAddRecipient(sender.id, newRec)
                      setIsAddingRecipient(false)
                    }}
                    onCancel={() => setIsAddingRecipient(false)}
                    onError={onError}
                  />
                )}

                {subRecipients.length === 0 ? (
                  <div className="text-center py-4 text-xs text-[#78716C]">
                    Nenhum destinatário cadastrado abaixo deste remetente ainda.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {subRecipients.map((sub: any) => (
                      <div
                        key={sub.id}
                        className="p-2 bg-white rounded-[4px] border border-[#E7E5E4] flex items-center justify-between text-xs hover:border-[#D6D3D1]"
                      >
                        <div>
                          <div className="font-semibold text-[#1C1917] flex items-center gap-2">
                            <span>{sub.name}</span>
                            {sub.email && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-mono border border-teal-100">
                                <Mail className="w-2.5 h-2.5" />
                                {sub.email}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#78716C] flex items-center gap-2 mt-0.5">
                            <span>{sub.city}</span>
                            {sub.cnpj && <span className="font-mono">CNPJ: {formatCNPJ(sub.cnpj)}</span>}
                            {sub.address && <span className="truncate max-w-[150px]">{sub.address}</span>}
                          </div>
                        </div>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onDeleteRecipient(sender.id, sub.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Excluir Destinatário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}

      {isDeleting && (
        <div className="absolute inset-0 bg-[#FAFAF9]/95 backdrop-blur-xs rounded-[8px] p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-red-200">
          <p className="text-xs text-[#1C1917] font-semibold">
            Deseja excluir o remetente <strong>{sender.name}</strong>?
          </p>
          <p className="text-[11px] text-[#78716C]">
            Os destinatários vinculados a ele também serão excluídos.
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
// 🏢 COMPONENTE PRINCIPAL: SenderManager
// ==========================================

export function SenderManager({
  initialSenders,
  companies,
  userRole = 'admin',
}: {
  initialSenders: any[]
  companies: any[]
  userRole?: 'admin' | 'operator'
}) {
  const isAdmin = userRole === 'admin'
  const [senders, setSenders] = useState(initialSenders)
  const [isPending, startTransition] = useTransition()
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Edição e exclusão
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtro memorizado de busca (Otimização de Performance)
  const filteredSenders = useMemo(() => {
    if (!searchTerm.trim()) return senders
    const term = searchTerm.toLowerCase().trim()
    const cleanTermDigits = term.replace(/\D/g, '')

    return senders.filter((s) => {
      const matchName = s.name?.toLowerCase().includes(term)
      const matchCity = s.city?.toLowerCase().includes(term)
      const matchCnpj = cleanTermDigits && s.cnpj?.replace(/\D/g, '').includes(cleanTermDigits)
      const matchSubRecipients = s.recipients?.some(
        (r: any) =>
          r.name?.toLowerCase().includes(term) ||
          (cleanTermDigits && r.cnpj?.replace(/\D/g, '').includes(cleanTermDigits)) ||
          r.city?.toLowerCase().includes(term)
      )

      return matchName || matchCity || matchCnpj || matchSubRecipients
    })
  }, [senders, searchTerm])

  const handleSenderCreated = (newSender: any) => {
    setSenders((prev) => [newSender, ...prev])
  }

  const handleUpdate = (id: string, formData: FormData) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await updateSender(id, formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        setSenders((prev) =>
          prev.map((s) => (s.id === id ? { ...res.data, recipients: s.recipients || [] } : s))
        )
        setEditingId(null)
      }
    })
  }

  const handleDelete = (id: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteSender(id)
      if (res.error) {
        setFeedbackError(res.error)
        setDeletingId(null)
      } else if (res.success) {
        setSenders((prev) => prev.filter((s) => s.id !== id))
        setDeletingId(null)
      }
    })
  }

  const handleAddRecipient = (senderId: string, newRec: any) => {
    setSenders((prev) =>
      prev.map((s) => {
        if (s.id === senderId) {
          return { ...s, recipients: [newRec, ...(s.recipients || [])] }
        }
        return s
      })
    )
  }

  const handleDeleteRecipient = (senderId: string, recipientId: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteRecipient(recipientId)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success) {
        setSenders((prev) =>
          prev.map((s) => {
            if (s.id === senderId) {
              return {
                ...s,
                recipients: (s.recipients || []).filter((r: any) => r.id !== recipientId),
              }
            }
            return s
          })
        )
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
        <CreateSenderForm
          companies={companies}
          onSenderCreated={handleSenderCreated}
          onError={setFeedbackError}
        />

        {/* Lista e Busca de Remetentes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Remetentes & Destinatários ({filteredSenders.length} de {senders.length})
            </h2>

            {/* Barra de busca rápida */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar remetente, CNPJ ou cliente..."
                className="pl-9 h-9 text-xs bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917]"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {filteredSenders.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <Building2 className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">
                {searchTerm ? 'Nenhum remetente encontrado na busca' : 'Nenhum remetente cadastrado'}
              </p>
              <p className="text-xs text-[#78716C] mt-1">
                {searchTerm
                  ? 'Verifique os termos digitados ou limpe a busca para visualizar todos.'
                  : 'Cadastre expedidores para vincular clientes e emitir transportes.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSenders.map((s: any) => (
                <SenderCard
                  key={s.id}
                  sender={s}
                  companies={companies}
                  isAdmin={isAdmin}
                  isEditing={editingId === s.id}
                  isDeleting={deletingId === s.id}
                  onStartEdit={() => {
                    setFeedbackError(null)
                    setEditingId(s.id)
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(formData) => handleUpdate(s.id, formData)}
                  onStartDelete={() => setDeletingId(s.id)}
                  onCancelDelete={() => setDeletingId(null)}
                  onConfirmDelete={() => handleDelete(s.id)}
                  onAddRecipient={handleAddRecipient}
                  onDeleteRecipient={handleDeleteRecipient}
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
