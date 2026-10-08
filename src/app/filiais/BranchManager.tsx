'use client'

import React, { useState, useTransition, useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBranch, updateBranch, deleteBranch } from "../actions"
import { formatPhone } from "@/utils/masks"
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Building2,
  X,
  Check,
  Mail,
  Phone,
  User,
  AlertCircle,
  Search,
} from "lucide-react"

// ==========================================
// 📝 SUB-COMPONENTE: FORMULÁRIO DE NOVA FILIAL
// (Estado isolado para evitar re-renderização na lista de cards - Otimização de INP)
// ==========================================

const CreateBranchForm = memo(function CreateBranchForm({
  companies,
  onBranchCreated,
  onError,
}: {
  companies: any[]
  onBranchCreated: (newBranch: any) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [contact, setContact] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || name.trim().length < 3) {
      onError('O nome da filial / CD deve conter pelo menos 3 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', companyId)
    formData.append('name', name)
    formData.append('code', code.toUpperCase())
    formData.append('city', city)
    formData.append('state', state.toUpperCase().slice(0, 2))
    formData.append('email', email)
    formData.append('phone', phone)
    formData.append('contact', contact)

    startTransition(async () => {
      const res = await createBranch(formData)
      if (res.error) {
        onError(res.error)
        return
      }
      if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === companyId) || res.data.companies
        onBranchCreated({ ...res.data, companies: companyObj })
        setName('')
        setCode('')
        setCity('')
        setState('')
        setEmail('')
        setPhone('')
        setContact('')
      }
    })
  }

  return (
    <Card className="lg:col-span-1 h-fit shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0D9488]" />
          Nova Filial
        </CardTitle>
        <CardDescription>Cadastre uma unidade de saída ou filial operacional.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {companies.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="create_company_id">Empresa Responsável</Label>
              <select
                id="create_company_id"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3.5 py-2.5 text-sm text-[#1C1917] focus-ring"
              >
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="create_name">Nome da Filial / CD</Label>
            <Input
              id="create_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Filial Campinas CD-1"
              minLength={3}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_code">Código / Sigla</Label>
            <Input
              id="create_code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: FIL-01 ou CPQ"
              className="uppercase font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="create_city">Cidade</Label>
              <Input
                id="create_city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Campinas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create_state">UF</Label>
              <Input
                id="create_state"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="SP"
                maxLength={2}
                className="uppercase font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_email">E-mail Operacional da Filial</Label>
            <Input
              id="create_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: filial.gru@empresa.com.br"
            />
            <p className="text-[11px] text-[#78716C]">
              E-mail utilizado como remetente operacional e cópia nos comunicados de chegada e saída das cargas desta filial.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="create_contact">Contato / Responsável</Label>
              <Input
                id="create_contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Ex: Operações / Carlos"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create_phone">Telefone / WhatsApp</Label>
              <Input
                id="create_phone"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="Ex: (11) 98765-4321"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar Filial'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
})

// ==========================================
// 📇 SUB-COMPONENTE: CARD DA FILIAL
// ==========================================

const BranchCard = memo(function BranchCard({
  branch,
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
  onError,
  isPending,
}: {
  branch: any
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
  onError: (msg: string) => void
  isPending: boolean
}) {
  // Estados locais para edição rápida dentro do card
  const [editCompanyId, setEditCompanyId] = useState(branch.company_id || companies[0]?.id || '')
  const [editName, setEditName] = useState(branch.name || '')
  const [editCode, setEditCode] = useState(branch.code || '')
  const [editCity, setEditCity] = useState(branch.city || '')
  const [editState, setEditState] = useState(branch.state || '')
  const [editEmail, setEditEmail] = useState(branch.email || '')
  const [editPhone, setEditPhone] = useState(formatPhone(branch.phone || ''))
  const [editContact, setEditContact] = useState(branch.contact || '')

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim() || editName.trim().length < 3) {
      onError('O nome da filial / CD deve conter pelo menos 3 caracteres.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', editCompanyId)
    formData.append('name', editName)
    formData.append('code', editCode.toUpperCase())
    formData.append('city', editCity)
    formData.append('state', editState.toUpperCase().slice(0, 2))
    formData.append('email', editEmail)
    formData.append('phone', editPhone)
    formData.append('contact', editContact)

    onSaveEdit(formData)
  }

  return (
    <Card className="relative hover:border-[#0D9488]/40 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#0F172A] border border-[#E7E5E4]">
            {branch.code || "S/ COD"}
          </span>

          {/* Botões de Ação */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onStartEdit}
              className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
              title="Editar Filial"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={onStartDelete}
                className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                title="Excluir Filial"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleUpdateSubmit} className="space-y-3 pt-2">
            {companies.length > 1 && (
              <div>
                <Label className="text-xs">Empresa</Label>
                <select
                  value={editCompanyId}
                  onChange={(e) => setEditCompanyId(e.target.value)}
                  className="flex h-9 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-2 text-xs text-[#1C1917] mt-1"
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
              <Label className="text-xs">Nome da Filial</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 text-xs mt-1"
                minLength={3}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Código</Label>
                <Input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  className="h-9 text-xs mt-1 uppercase font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input
                  value={editState}
                  onChange={(e) => setEditState(e.target.value.toUpperCase().slice(0, 2))}
                  className="h-9 text-xs mt-1 uppercase font-mono"
                  maxLength={2}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cidade</Label>
              <Input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="h-9 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">E-mail Operacional</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-9 text-xs mt-1"
                placeholder="filial.gru@empresa.com.br"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Contato / Responsável</Label>
                <Input
                  value={editContact}
                  onChange={(e) => setEditContact(e.target.value)}
                  className="h-9 text-xs mt-1"
                  placeholder="Operações / Carlos"
                />
              </div>
              <div>
                <Label className="text-xs">Telefone / WhatsApp</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                  className="h-9 text-xs mt-1"
                  placeholder="(11) 98765-4321"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="submit"
                size="sm"
                className="gap-1 h-8 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                disabled={isPending}
              >
                <Check className="w-3.5 h-3.5" /> Salvar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 h-8 text-xs"
                onClick={onCancelEdit}
              >
                <X className="w-3.5 h-3.5" /> Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <>
            {companies.length > 1 && (
              <div className="text-xs text-[#57534E] flex items-center gap-1 mt-1">
                <Building2 className="w-3.5 h-3.5 text-[#0D9488]" />
                {branch.companies?.name || "Empresa"}
              </div>
            )}
            <CardTitle className="text-base font-bold mt-2 text-[#1C1917]">{branch.name}</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1 text-[#78716C]">
              <MapPin className="w-3.5 h-3.5 text-[#0D9488]" />
              {branch.city ? `${branch.city}/${branch.state || ""}` : "Localização não informada"}
            </CardDescription>

            <div className="space-y-1.5 pt-2 border-t border-[#E7E5E4] mt-2.5">
              {branch.email && (
                <div className="text-xs flex items-center gap-1.5 text-[#0D9488] font-mono">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <a
                    href={`mailto:${branch.email}`}
                    className="truncate hover:underline"
                    title="Enviar e-mail para filial"
                  >
                    {branch.email}
                  </a>
                </div>
              )}
              {branch.phone && (
                <div className="text-xs flex items-center gap-1.5 text-[#57534E] font-mono">
                  <Phone className="w-3.5 h-3.5 shrink-0 text-[#0D9488]" />
                  <span>{formatPhone(branch.phone)}</span>
                </div>
              )}
              {branch.contact && (
                <div className="text-xs flex items-center gap-1.5 text-[#78716C]">
                  <User className="w-3.5 h-3.5 shrink-0 text-[#0D9488]" />
                  <span>{branch.contact}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardHeader>

      {/* Confirmação de Exclusão */}
      {isDeleting && (
        <div className="absolute inset-0 bg-[#FAFAF9]/95 backdrop-blur-xs rounded-[8px] p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-red-200">
          <p className="text-xs text-[#1C1917] font-semibold">
            Deseja excluir a filial <strong>{branch.name}</strong>?
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
// 📍 COMPONENTE PRINCIPAL: BranchManager
// ==========================================

export function BranchManager({
  initialBranches,
  companies,
  userRole = 'admin',
}: {
  initialBranches: any[]
  companies: any[]
  userRole?: 'admin' | 'operator'
}) {
  const isAdmin = userRole === 'admin'
  const [branches, setBranches] = useState(initialBranches)
  const [isPending, startTransition] = useTransition()
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Edição e exclusão
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtro memorizado de busca (Otimização de Performance)
  const filteredBranches = useMemo(() => {
    if (!searchTerm.trim()) return branches
    const term = searchTerm.toLowerCase().trim()

    return branches.filter((b) => {
      const matchName = b.name?.toLowerCase().includes(term)
      const matchCode = b.code?.toLowerCase().includes(term)
      const matchCity = b.city?.toLowerCase().includes(term)
      const matchState = b.state?.toLowerCase().includes(term)
      const matchContact = b.contact?.toLowerCase().includes(term)
      const matchEmail = b.email?.toLowerCase().includes(term)
      return matchName || matchCode || matchCity || matchState || matchContact || matchEmail
    })
  }, [branches, searchTerm])

  const handleBranchCreated = (newBranch: any) => {
    setBranches((prev) => [newBranch, ...prev])
  }

  const handleUpdate = (id: string, formData: FormData) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await updateBranch(id, formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        const companyId = formData.get('company_id') as string
        const companyObj = companies.find((c) => c.id === companyId) || res.data.companies
        setBranches((prev) =>
          prev.map((b) => (b.id === id ? { ...res.data, companies: companyObj } : b))
        )
        setEditingId(null)
      }
    })
  }

  const handleDelete = (id: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteBranch(id)
      if (res.error) {
        setFeedbackError(res.error)
        setDeletingId(null)
      } else if (res.success) {
        setBranches((prev) => prev.filter((b) => b.id !== id))
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
        <CreateBranchForm
          companies={companies}
          onBranchCreated={handleBranchCreated}
          onError={setFeedbackError}
        />

        {/* Lista e Busca de Filiais */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Filiais Registradas ({filteredBranches.length} de {branches.length})
            </h2>

            {/* Barra de busca rápida */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por filial, sigla, cidade..."
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

          {filteredBranches.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <MapPin className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">
                {searchTerm ? 'Nenhuma filial encontrada na busca' : 'Nenhuma filial cadastrada'}
              </p>
              <p className="text-xs text-[#78716C] mt-1">
                {searchTerm
                  ? 'Verifique os termos pesquisados ou limpe o campo de busca.'
                  : 'Adicione a primeira filial para poder selecionar como ponto de saída de carga.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredBranches.map((b: any) => (
                <BranchCard
                  key={b.id}
                  branch={b}
                  companies={companies}
                  isAdmin={isAdmin}
                  isEditing={editingId === b.id}
                  isDeleting={deletingId === b.id}
                  onStartEdit={() => {
                    setFeedbackError(null)
                    setEditingId(b.id)
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(formData) => handleUpdate(b.id, formData)}
                  onStartDelete={() => setDeletingId(b.id)}
                  onCancelDelete={() => setDeletingId(null)}
                  onConfirmDelete={() => handleDelete(b.id)}
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
