'use client'

import { useState, useTransition } from 'react'
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
} from "lucide-react"

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

  // Novo remetente
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [ie, setIe] = useState('')
  const [phone, setPhone] = useState('')
  const [franchiseHours, setFranchiseHours] = useState('0')

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCompanyId, setEditCompanyId] = useState('')
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editZipCode, setEditZipCode] = useState('')
  const [editCnpj, setEditCnpj] = useState('')
  const [editIe, setEditIe] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editFranchiseHours, setEditFranchiseHours] = useState('0')

  // Deleção
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Controle de expansão de destinatários por remetente
  const [expandedSenderId, setExpandedSenderId] = useState<string | null>(null)
  const [addingRecipientForSenderId, setAddingRecipientForSenderId] = useState<string | null>(null)

  // Novo destinatário rápido sob o remetente
  const [recName, setRecName] = useState('')
  const [recEmail, setRecEmail] = useState('')
  const [recAddress, setRecAddress] = useState('')
  const [recCity, setRecCity] = useState('')
  const [recZipCode, setRecZipCode] = useState('')
  const [recCnpj, setRecCnpj] = useState('')
  const [recIe, setRecIe] = useState('')
  const [recPhone, setRecPhone] = useState('')

  const handleCreateSender = async (e: React.FormEvent) => {
    e.preventDefault()
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
      if (res.success && res.data) {
        setSenders([res.data, ...senders])
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

  const startEdit = (s: any) => {
    setEditingId(s.id)
    setEditCompanyId(s.company_id)
    setEditName(s.name)
    setEditAddress(s.address || '')
    setEditCity(s.city || '')
    setEditZipCode(s.zip_code || '')
    setEditCnpj(s.cnpj || '')
    setEditIe(s.ie || '')
    setEditPhone(s.phone || '')
    setEditFranchiseHours(s.franchise_hours ? String(s.franchise_hours) : '0')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleUpdate = async (id: string) => {
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

    startTransition(async () => {
      const res = await updateSender(id, formData)
      if (res.success && res.data) {
        setSenders(senders.map((s) => (s.id === id ? res.data : s)))
        setEditingId(null)
      }
    })
  }

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const res = await deleteSender(id)
      if (res.success) {
        setSenders(senders.filter((s) => s.id !== id))
        setDeletingId(null)
      }
    })
  }

  // Cadastro de Destinatário Vinculado ao Remetente
  const handleCreateSubRecipient = async (sender: any) => {
    const formData = new FormData()
    formData.append('company_id', sender.company_id)
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
      if (res.success && res.data) {
        // Atualiza a lista local do remetente
        setSenders(
          senders.map((s) => {
            if (s.id === sender.id) {
              const prevList = s.recipients || []
              return { ...s, recipients: [res.data, ...prevList] }
            }
            return s
          })
        )
        setRecName('')
        setRecEmail('')
        setRecAddress('')
        setRecCity('')
        setRecZipCode('')
        setRecCnpj('')
        setRecIe('')
        setRecPhone('')
        setAddingRecipientForSenderId(null)
      }
    })
  }

  const handleDeleteSubRecipient = async (senderId: string, recipientId: string) => {
    startTransition(async () => {
      const res = await deleteRecipient(recipientId)
      if (res.success) {
        setSenders(
          senders.map((s) => {
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Formulário de Cadastro do Remetente */}
      <Card className="lg:col-span-1 h-fit shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#0D9488]" />
            Novo Remetente
          </CardTitle>
          <CardDescription>Cadastre o expedidor de mercadorias (indústria, fábrica ou armazém).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateSender} className="space-y-3.5">
            {companies.length > 1 && (
              <div className="space-y-1">
                <Label htmlFor="company_id">Empresa Responsável</Label>
                <select
                  id="company_id"
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
                <Label htmlFor="name">Nome do Remetente (Razão Social)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Cervejaria Ambev S/A"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ie">Inscrição Estadual (IE)</Label>
                  <Input
                    id="ie"
                    value={ie}
                    onChange={(e) => setIe(e.target.value)}
                    placeholder="Ex: 123.456.789.000"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="address">Endereço Completo</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Rod. Marechal Rondon, Km 320"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="city">Município / UF</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Agudos - SP"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="zip_code">CEP</Label>
                  <Input
                    id="zip_code"
                    value={zipCode}
                    onChange={(e) => setZipCode(formatCEP(e.target.value))}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="phone">Telefone / Fone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="franchiseHours">Franquia Contratada (Horas)</Label>
                  <Input
                    id="franchiseHours"
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

      {/* Lista de Remetentes com Destinatários Vinculados Abaixo */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
          Remetentes & Destinatários ({senders.length})
        </h2>

        {senders.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
            <Building2 className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#1C1917]">Nenhum remetente cadastrado</p>
            <p className="text-xs text-[#78716C] mt-1">
              Cadastre expedidores para vincular clientes e emitir transportes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {senders.map((s) => {
              const isEditing = editingId === s.id
              const isExpanded = expandedSenderId === s.id
              const isAddingRecipient = addingRecipientForSenderId === s.id
              const subRecipients = s.recipients || []

              return (
                <Card key={s.id} className="relative hover:border-[#0D9488]/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      {companies.length > 1 && (
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#0F172A] border border-[#E7E5E4]">
                          {s.companies?.name || "Empresa"}
                        </span>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
                          title="Editar Remetente"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeletingId(s.id)}
                            className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                            title="Excluir Remetente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-2 text-xs">
                        <div>
                          <Label className="text-[11px]">Nome</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 text-xs mt-0.5"
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
                            <Label className="text-[11px]">Município</Label>
                            <Input
                              value={editCity}
                              onChange={(e) => setEditCity(e.target.value)}
                              className="h-8 text-xs mt-0.5"
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
                            size="sm"
                            className="gap-1 h-7 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                            onClick={() => handleUpdate(s.id)}
                            disabled={isPending}
                          >
                            <Check className="w-3 h-3" /> Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-xs"
                            onClick={cancelEdit}
                          >
                            <X className="w-3 h-3" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <CardTitle className="text-base font-bold mt-2">{s.name}</CardTitle>
                        <CardDescription className="text-xs font-mono space-y-0.5 mt-1">
                          {s.cnpj && <span className="block">CNPJ: {s.cnpj}</span>}
                          {s.ie && <span className="block">IE: {s.ie}</span>}
                        </CardDescription>
                      </>
                    )}
                  </CardHeader>

                  {!isEditing && (
                    <CardContent className="pt-0 text-xs text-[#57534E] space-y-2 border-t border-[#E7E5E4] pt-2 mt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {s.city && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                            <span>{s.city} {s.zip_code ? `- CEP: ${s.zip_code}` : ''}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-4">
                          {s.phone && (
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <Phone className="w-3 h-3 text-[#0D9488] shrink-0" />
                              <span>{s.phone}</span>
                            </div>
                          )}
                          {s.franchise_hours !== undefined && s.franchise_hours > 0 && (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#CA8A04] bg-yellow-50 px-1.5 py-0.5 rounded-[4px] border border-yellow-200">
                              <span>⏱ Franquia: {s.franchise_hours}h</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {s.address && (
                        <div className="text-[11px] text-[#78716C] truncate">{s.address}</div>
                      )}

                      {/* BARRA HIERÁRQUICA: 1 REMETENTE -> N DESTINATÁRIOS ABAIXO */}
                      <div className="pt-2 border-t border-[#E7E5E4]/80 mt-2">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setExpandedSenderId(isExpanded ? null : s.id)}
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
                              setExpandedSenderId(s.id)
                              setAddingRecipientForSenderId(s.id)
                            }}
                            className="h-7 text-[11px] gap-1 border-[#0D9488] text-[#0D9488] hover:bg-teal-50"
                          >
                            <Plus className="w-3 h-3" /> Adicionar Destinatário
                          </Button>
                        </div>

                        {/* LISTA DE DESTINATÁRIOS "ABAIXO" DO REMETENTE */}
                        {isExpanded && (
                          <div className="mt-3 p-3 rounded-[6px] bg-[#F5F5F4] border border-[#E7E5E4] space-y-3">
                            {/* Formulário rápido para adicionar novo destinatário */}
                            {isAddingRecipient && (
                              <div className="p-3 bg-white rounded-[6px] border border-[#0D9488]/40 space-y-2 shadow-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-[#0D9488] uppercase font-mono">
                                    Novo Destinatário de {s.name}
                                  </span>
                                  <button
                                    onClick={() => setAddingRecipientForSenderId(null)}
                                    className="text-gray-400 hover:text-gray-600"
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
                                    size="sm"
                                    className="h-7 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                                    onClick={() => handleCreateSubRecipient(s)}
                                    disabled={!recName || isPending}
                                  >
                                    Salvar Destinatário
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => setAddingRecipientForSenderId(null)}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
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
                                        {sub.cnpj && <span className="font-mono">CNPJ: {sub.cnpj}</span>}
                                        {sub.address && <span className="truncate max-w-[150px]">{sub.address}</span>}
                                      </div>
                                    </div>

                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSubRecipient(s.id, sub.id)}
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

                  {deletingId === s.id && (
                    <div className="absolute inset-0 bg-[#FAFAF9]/95 backdrop-blur-xs rounded-[8px] p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-red-200">
                      <p className="text-xs text-[#1C1917] font-semibold">
                        Deseja excluir o remetente <strong>{s.name}</strong>?
                      </p>
                      <p className="text-[11px] text-[#78716C]">
                        Os destinatários vinculados a ele também serão excluídos.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          onClick={() => handleDelete(s.id)}
                          disabled={isPending}
                        >
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => setDeletingId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
