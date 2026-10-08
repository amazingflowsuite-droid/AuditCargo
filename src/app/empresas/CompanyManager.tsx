'use client'

import React, { useState, useTransition, useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createCompany, updateCompany, deleteCompany } from "../actions"
import { formatCNPJ, formatPhone } from "@/utils/masks"
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  X,
  Check,
  Phone,
  Mail,
  Globe,
  User,
  Search,
  AlertCircle,
} from "lucide-react"

// ==========================================
// 📝 SUB-COMPONENTE: FORMULÁRIO DE NOVA EMPRESA
// (Estado isolado para evitar re-renderização na lista de cards - Otimização de INP)
// ==========================================

const CreateCompanyForm = memo(function CreateCompanyForm({
  onCompanyCreated,
  onError,
}: {
  onCompanyCreated: (newCompany: any) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || name.trim().length < 2) {
      onError('A Razão Social ou Nome Fantasia deve ter pelo menos 2 caracteres.')
      return
    }

    const cnpjDigits = cnpj.replace(/\D/g, '')
    if (cnpjDigits && cnpjDigits.length !== 14) {
      onError('O CNPJ deve conter exatamente 14 dígitos numéricos.')
      return
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      onError('Por favor, informe um endereço de e-mail corporativo válido.')
      return
    }

    const formData = new FormData()
    formData.append('name', name.trim())
    formData.append('cnpj', cnpj)
    formData.append('contact', contact.trim())
    formData.append('phone', phone.trim())
    formData.append('email', email.trim().toLowerCase())
    formData.append('website', website.trim())

    startTransition(async () => {
      const res = await createCompany(formData)
      if (res.error) {
        onError(res.error)
      } else if (res.success && res.data) {
        onCompanyCreated(res.data)
        setName('')
        setCnpj('')
        setContact('')
        setPhone('')
        setEmail('')
        setWebsite('')
      }
    })
  }

  return (
    <Card className="lg:col-span-1 h-fit shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0D9488]" />
          Nova Empresa
        </CardTitle>
        <CardDescription>
          Cadastre os dados corporativos da transportadora para telemetria e assinatura automática de e-mails.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreate} className="space-y-3.5">
          <div className="space-y-1">
            <Label htmlFor="name">Razão Social / Nome Fantasia *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Transvale Cargas Ltda"
              required
            />
          </div>

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
            <Label htmlFor="contact">Pessoa de Contato / Atendimento</Label>
            <Input
              id="contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Ex: Atendimento Operacional / Carlos Silva"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">Telefone / WhatsApp</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(00) 00000-0000"
              maxLength={15}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">E-mail Operacional (Notificações)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operacional@empresa.com.br"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="website">Site Corporativo</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="www.suaempresa.com.br"
            />
          </div>

          <Button type="submit" className="w-full mt-2 bg-[#0D9488] hover:bg-[#0F766E]" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar Empresa'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
})

// ==========================================
// 🏢 SUB-COMPONENTE: CARD INDIVIDUAL DA EMPRESA
// (Memoizado para evitar re-renderizações em cascata)
// ==========================================

const CompanyCard = memo(function CompanyCard({
  company,
  isAdmin,
  onCompanyUpdated,
  onCompanyDeleted,
  onError,
}: {
  company: any
  isAdmin: boolean
  onCompanyUpdated: (updatedCompany: any) => void
  onCompanyDeleted: (id: string) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Estados locais de edição
  const [editName, setEditName] = useState(company.name || '')
  const [editCnpj, setEditCnpj] = useState(company.cnpj || '')
  const [editContact, setEditContact] = useState(company.contact || '')
  const [editPhone, setEditPhone] = useState(company.phone || '')
  const [editEmail, setEditEmail] = useState(company.email || '')
  const [editWebsite, setEditWebsite] = useState(company.website || '')

  const startEdit = () => {
    setEditName(company.name || '')
    setEditCnpj(company.cnpj || '')
    setEditContact(company.contact || '')
    setEditPhone(company.phone || '')
    setEditEmail(company.email || '')
    setEditWebsite(company.website || '')
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
  }

  const handleUpdate = async () => {
    if (!editName.trim() || editName.trim().length < 2) {
      onError('A Razão Social deve ter pelo menos 2 caracteres.')
      return
    }

    const cnpjDigits = editCnpj.replace(/\D/g, '')
    if (cnpjDigits && cnpjDigits.length !== 14) {
      onError('O CNPJ deve conter exatamente 14 dígitos numéricos.')
      return
    }

    if (editEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail.trim())) {
      onError('Por favor, informe um e-mail corporativo válido.')
      return
    }

    const formData = new FormData()
    formData.append('name', editName.trim())
    formData.append('cnpj', editCnpj)
    formData.append('contact', editContact.trim())
    formData.append('phone', editPhone.trim())
    formData.append('email', editEmail.trim().toLowerCase())
    formData.append('website', editWebsite.trim())

    startTransition(async () => {
      const res = await updateCompany(company.id, formData)
      if (res.error) {
        onError(res.error)
      } else if (res.success && res.data) {
        onCompanyUpdated(res.data)
        setIsEditing(false)
      }
    })
  }

  const handleDelete = async () => {
    startTransition(async () => {
      const res = await deleteCompany(company.id)
      if (res.error) {
        onError(res.error)
        setIsDeleting(false)
      } else if (res.success) {
        onCompanyDeleted(company.id)
        setIsDeleting(false)
      }
    })
  }

  return (
    <Card className="relative hover:border-[#0D9488]/40 transition-colors flex flex-col justify-between">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="w-8 h-8 rounded-[6px] bg-[#0F172A] flex items-center justify-center text-white text-xs font-bold">
            <Building2 className="w-4 h-4 text-[#0D9488]" />
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startEdit}
              className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
              title="Editar Empresa"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsDeleting(true)}
                className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                title="Excluir Empresa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-2.5 pt-2">
            <div>
              <Label className="text-xs">Razão Social *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-xs mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs">CNPJ</Label>
              <Input
                value={editCnpj}
                onChange={(e) => setEditCnpj(formatCNPJ(e.target.value))}
                className="h-8 text-xs font-mono mt-1"
                maxLength={18}
              />
            </div>
            <div>
              <Label className="text-xs">Contato / Responsável</Label>
              <Input
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
                className="h-8 text-xs mt-1"
                placeholder="Atendimento Operacional"
              />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                className="h-8 text-xs font-mono mt-1"
                placeholder="(00) 00000-0000"
                maxLength={15}
              />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-8 text-xs mt-1"
                placeholder="contato@empresa.com"
              />
            </div>
            <div>
              <Label className="text-xs">Site</Label>
              <Input
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                className="h-8 text-xs mt-1"
                placeholder="www.empresa.com"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                className="gap-1 h-8 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                onClick={handleUpdate}
                disabled={isPending}
              >
                <Check className="w-3.5 h-3.5" /> Salvar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-8 text-xs"
                onClick={cancelEdit}
              >
                <X className="w-3.5 h-3.5" /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <CardTitle className="text-base font-bold mt-2">{company.name}</CardTitle>
            <CardDescription className="text-xs font-mono">
              CNPJ: {company.cnpj || "Não informado"}
            </CardDescription>

            {/* Detalhes de Contato, Fone, E-mail, Site */}
            <div className="pt-3 space-y-1.5 text-xs text-[#57534E]">
              {company.contact && (
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                  <span className="truncate">{company.contact}</span>
                </div>
              )}

              {company.phone && (
                <div className="flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                  <span>{company.phone}</span>
                </div>
              )}

              {company.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                  <span className="truncate">{company.email}</span>
                </div>
              )}

              {company.website && (
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                  <span className="truncate text-teal-700 underline">{company.website}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardHeader>

      {!isEditing && (
        <CardContent className="pt-0 text-xs text-[#78716C] font-mono flex items-center justify-between border-t border-[#E7E5E4] pt-2 mt-2">
          <span>ID: {company.id.substring(0, 8)}...</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-[#047857]">
            <ShieldCheck className="w-3 h-3" /> Ativa
          </span>
        </CardContent>
      )}

      {/* Confirmação de Exclusão */}
      {isDeleting && (
        <div className="absolute inset-0 bg-[#FAFAF9]/95 backdrop-blur-xs rounded-[8px] p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-red-200">
          <p className="text-xs text-[#1C1917] font-semibold">
            Deseja realmente excluir <strong>{company.name}</strong>?
          </p>
          <p className="text-[11px] text-[#78716C]">
            Todas as filiais e viagens desta empresa também serão removidas.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setIsDeleting(false)}
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
// 🏢 COMPONENTE PRINCIPAL: COMPANY MANAGER
// ==========================================

export function CompanyManager({
  initialCompanies,
  userRole = 'admin',
}: {
  initialCompanies: any[]
  userRole?: 'admin' | 'operator'
}) {
  const isAdmin = userRole === 'admin'
  const [companies, setCompanies] = useState(initialCompanies)
  const [search, setSearch] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleCompanyCreated = (newCompany: any) => {
    setCompanies(prev => [newCompany, ...prev])
    setErrorMessage(null)
  }

  const handleCompanyUpdated = (updatedCompany: any) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c))
    setErrorMessage(null)
  }

  const handleCompanyDeleted = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id))
    setErrorMessage(null)
  }

  // Busca instantânea com useMemo
  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies
    const q = search.toLowerCase()
    return companies.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.cnpj && c.cnpj.includes(q)) ||
      (c.contact && c.contact.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    )
  }, [companies, search])

  return (
    <div className="space-y-6">
      {/* Banner de Feedback de Erro */}
      {errorMessage && (
        <div className="flex items-center justify-between p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700 text-xs font-bold uppercase ml-3"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário de Cadastro Isolado */}
        <CreateCompanyForm
          onCompanyCreated={handleCompanyCreated}
          onError={setErrorMessage}
        />

        {/* Lista de Empresas */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Empresas Cadastradas ({filteredCompanies.length}{filteredCompanies.length !== companies.length ? ` de ${companies.length}` : ''})
            </h2>

            {/* Barra de Busca Instantânea */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-[#A8A29E]" />
              <Input
                placeholder="Buscar por nome, CNPJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-9 bg-white"
              />
            </div>
          </div>

          {filteredCompanies.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <Building2 className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">Nenhuma empresa encontrada</p>
              <p className="text-xs text-[#78716C] mt-1">
                {search ? 'Tente ajustar os termos da sua pesquisa.' : 'Cadastre a primeira empresa no formulário ao lado.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredCompanies.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  isAdmin={isAdmin}
                  onCompanyUpdated={handleCompanyUpdated}
                  onCompanyDeleted={handleCompanyDeleted}
                  onError={setErrorMessage}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

