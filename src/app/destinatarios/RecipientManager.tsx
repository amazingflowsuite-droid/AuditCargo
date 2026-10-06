'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createRecipient, updateRecipient, deleteRecipient } from "../actions"
import { formatCNPJ, formatCEP, formatPhone } from "@/utils/masks"
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, FileText, X, Check, Users, Filter, Mail } from "lucide-react"

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
  const [filterSenderId, setFilterSenderId] = useState<string>('all')

  // Novo destinatário
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

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCompanyId, setEditCompanyId] = useState('')
  const [editSenderId, setEditSenderId] = useState('')
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editZipCode, setEditZipCode] = useState('')
  const [editCnpj, setEditCnpj] = useState('')
  const [editIe, setEditIe] = useState('')
  const [editPhone, setEditPhone] = useState('')

  // Deleção
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filteredByCompanySenders = senders.filter((s) => !companyId || s.company_id === companyId)

  const displayedRecipients = recipients.filter((r) => {
    if (filterSenderId === 'all') return true
    if (filterSenderId === 'unassigned') return !r.sender_id
    return r.sender_id === filterSenderId
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
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
      if (res.success && res.data) {
        setRecipients([res.data, ...recipients])
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

  const startEdit = (r: any) => {
    setEditingId(r.id)
    setEditCompanyId(r.company_id)
    setEditSenderId(r.sender_id || '')
    setEditName(r.name)
    setEditEmail(r.email || '')
    setEditAddress(r.address || '')
    setEditCity(r.city || '')
    setEditZipCode(r.zip_code || '')
    setEditCnpj(r.cnpj || '')
    setEditIe(r.ie || '')
    setEditPhone(r.phone || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleUpdate = async (id: string) => {
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

    startTransition(async () => {
      const res = await updateRecipient(id, formData)
      if (res.success && res.data) {
        setRecipients(recipients.map((r) => (r.id === id ? res.data : r)))
        setEditingId(null)
      }
    })
  }

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const res = await deleteRecipient(id)
      if (res.success) {
        setRecipients(recipients.filter((r) => r.id !== id))
        setDeletingId(null)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Formulário de Cadastro */}
      <Card className="lg:col-span-1 h-fit shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#0D9488]" />
            Novo Destinatário
          </CardTitle>
          <CardDescription>Cadastre clientes e vincule ao Remetente expedidor.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3.5">
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

              {/* Vínculo de 1 Remetente -> N Destinatários */}
              <div className="space-y-1">
                <Label htmlFor="sender_id">Remetente Vinculado (Expedidor)</Label>
                <select
                  id="sender_id"
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
                <Label htmlFor="name">Nome do Destinatário (Razão Social)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Atacadão S/A - Loja 22"
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
                    placeholder="Ex: 987.654.321.000"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="address">Endereço Completo / Doca</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Av. Brasil, 1500 - Doca 08"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="city">Município / UF</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Campinas - SP"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="phone">Telefone / Fone (Portaria)</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(19) 3333-3333"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email" className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-[#0D9488]" />
                    E-mail Notificação Chegada
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="recebimento@destinatario.com.br"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={isPending}>
                {isPending ? 'Salvando...' : 'Salvar Destinatário'}
              </Button>
            </form>
        </CardContent>
      </Card>

      {/* Lista de Destinatários com Filtro por Remetente */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
            Destinatários Cadastrados ({displayedRecipients.length})
          </h2>

          {/* Filtro por Remetente */}
          {senders.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-[#0D9488]" />
              <select
                value={filterSenderId}
                onChange={(e) => setFilterSenderId(e.target.value)}
                className="h-8 rounded-[4px] border border-[#D6D3D1] bg-[#FAFAF9] px-2 text-xs text-[#1C1917]"
              >
                <option value="all">Todos os Remetentes</option>
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    Remetente: {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {displayedRecipients.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
            <Users className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#1C1917]">Nenhum destinatário encontrado</p>
            <p className="text-xs text-[#78716C] mt-1">
              Cadastre pontos de entrega para agilizar a emissão de transportes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {displayedRecipients.map((r) => {
              const isEditing = editingId === r.id

              return (
                <Card key={r.id} className="relative hover:border-[#0D9488]/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        {companies.length > 1 && (
                          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#0F172A] border border-[#E7E5E4] w-fit">
                            {r.companies?.name || "Empresa"}
                          </span>
                        )}
                        {r.senders?.name && (
                          <span className="text-[10px] font-mono text-[#0D9488]">
                            De: {r.senders.name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
                          title="Editar Destinatário"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeletingId(r.id)}
                            className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                            title="Excluir Destinatário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-2 text-xs">
                        <div>
                          <Label className="text-[11px]">Remetente Vinculado</Label>
                          <select
                            value={editSenderId}
                            onChange={(e) => setEditSenderId(e.target.value)}
                            className="flex h-8 w-full rounded-[4px] border border-[#D6D3D1] bg-[#FAFAF9] px-2 text-xs text-[#1C1917] mt-0.5"
                          >
                            <option value="">Sem remetente específico</option>
                            {senders.map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.city})
                              </option>
                            ))}
                          </select>
                        </div>
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
                          <Label className="text-[11px]">Endereço / Doca</Label>
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

                        <div>
                          <Label className="text-[11px] flex items-center gap-1">
                            <Mail className="w-3 h-3 text-[#0D9488]" /> E-mail Notificação Chegada
                          </Label>
                          <Input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="recebimento@empresa.com.br"
                            className="h-8 text-xs mt-0.5"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            className="gap-1 h-7 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                            onClick={() => handleUpdate(r.id)}
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
                        <CardTitle className="text-base font-bold mt-2">{r.name}</CardTitle>
                        <CardDescription className="text-xs font-mono space-y-0.5 mt-1">
                          {r.cnpj && <span className="block">CNPJ: {r.cnpj}</span>}
                          {r.ie && <span className="block">IE: {r.ie}</span>}
                        </CardDescription>
                      </>
                    )}
                  </CardHeader>

                  {!isEditing && (
                    <CardContent className="pt-0 text-xs text-[#57534E] space-y-1.5 border-t border-[#E7E5E4] pt-2 mt-1">
                      {r.city && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                          <span>{r.city} {r.zip_code ? `- CEP: ${r.zip_code}` : ''}</span>
                        </div>
                      )}
                      {r.address && (
                        <div className="text-[11px] text-[#78716C] truncate">{r.address}</div>
                      )}
                      {r.phone && (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-[#0D9488] shrink-0" />
                          <span>{r.phone}</span>
                        </div>
                      )}
                      {r.email && (
                        <div className="flex items-center gap-1.5 text-[11px] text-teal-700 bg-teal-50/80 px-2 py-1 rounded-[4px] border border-teal-100 font-mono">
                          <Mail className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                          <span className="truncate">{r.email}</span>
                        </div>
                      )}
                    </CardContent>
                  )}

                  {deletingId === r.id && (
                    <div className="absolute inset-0 bg-[#FAFAF9]/95 backdrop-blur-xs rounded-[8px] p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-red-200">
                      <p className="text-xs text-[#1C1917] font-semibold">
                        Deseja excluir o destinatário <strong>{r.name}</strong>?
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          onClick={() => handleDelete(r.id)}
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
