'use client'

import React, { useState, useTransition, useMemo, memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createDriver, updateDriver, deleteDriver } from "../actions"
import {
  Truck,
  Plus,
  Phone,
  CreditCard,
  Building2,
  Pencil,
  Trash2,
  X,
  Check,
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
  Search,
} from "lucide-react"

// ==========================================
// 🛠️ FORMATADORES E MÁSCARAS
// ==========================================

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

function maskCpf(cpf: string | null | undefined) {
  if (!cpf) return "Não inf."
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}

function getWhatsAppUrl(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return '#'
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${fullNumber}`
}

// ==========================================
// 📝 SUB-COMPONENTE: FORMULÁRIO DE NOVO MOTORISTA
// (Estado isolado para evitar re-renderização na lista de motoristas - Otimização de INP)
// ==========================================

const CreateDriverForm = memo(function CreateDriverForm({
  companies,
  onDriverCreated,
  onError,
}: {
  companies: any[]
  onDriverCreated: (newDriver: any) => void
  onError: (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [defaultPlate, setDefaultPlate] = useState('')
  const [cpf, setCpf] = useState('')
  const [pin, setPin] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      onError('Informe um telefone celular válido com DDD (10 ou 11 dígitos).')
      return
    }

    if (!pin || pin.length !== 4) {
      onError('O PIN de acesso do motorista deve possuir exatamente 4 dígitos numéricos.')
      return
    }

    const formData = new FormData()
    formData.append('company_id', companyId)
    formData.append('name', name)
    formData.append('phone', phone)
    formData.append('default_plate', defaultPlate.toUpperCase())
    formData.append('cpf', cpf)
    formData.append('pin', pin)
    if (telegramUsername.trim()) {
      formData.append('telegram_username', telegramUsername.trim())
    }

    startTransition(async () => {
      const res = await createDriver(formData)
      if (res.error) {
        onError(res.error)
      } else if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === companyId)
        onDriverCreated({ ...res.data, companies: companyObj })
        setName('')
        setPhone('')
        setDefaultPlate('')
        setCpf('')
        setPin('')
        setTelegramUsername('')
      }
    })
  }

  return (
    <Card className="lg:col-span-1 h-fit shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0D9488]" />
          Novo Motorista
        </CardTitle>
        <CardDescription>Cadastre motoristas com WhatsApp e PIN para despacho instantâneo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {companies.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="create_company_id">Empresa Vinculada</Label>
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
            <Label htmlFor="create_name">Nome Completo</Label>
            <Input
              id="create_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Roberto Silveira"
              minLength={3}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_phone">WhatsApp / Celular (com DDD)</Label>
            <Input
              id="create_phone"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(11) 99999-8888"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="create_plate">Placa Padrão</Label>
              <Input
                id="create_plate"
                value={defaultPlate}
                onChange={(e) => setDefaultPlate(e.target.value.toUpperCase())}
                placeholder="ABC1D23"
                maxLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create_cpf">CPF (opcional)</Label>
              <Input
                id="create_cpf"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_pin" className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#0D9488]" />
              PIN de Acesso (4 dígitos)
            </Label>
            <Input
              id="create_pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              required
              className="font-mono tracking-widest text-base"
            />
            <p className="text-[10px] text-[#78716C]">
              PIN numérico de segurança que o motorista usará para acessar os links de viagem.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create_telegram" className="text-xs text-[#57534E]">
              Telegram @usuário ou Chat ID (opcional)
            </Label>
            <Input
              id="create_telegram"
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder="Ex: @robertomotorista ou Chat ID"
              className="text-xs font-mono h-9"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar Motorista'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
})

// ==========================================
// 📇 SUB-COMPONENTE: CARD DO MOTORISTA
// ==========================================

const DriverCard = memo(function DriverCard({
  driver,
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
  isPending,
}: {
  driver: any
  companies: any[]
  isAdmin: boolean
  isEditing: boolean
  isDeleting: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (updatedData: FormData) => void
  onStartDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  isPending: boolean
}) {
  const [showPin, setShowPin] = useState(false)

  // Estados locais para edição rápida dentro do card
  const [editCompanyId, setEditCompanyId] = useState(driver.company_id || companies[0]?.id || '')
  const [editName, setEditName] = useState(driver.name || '')
  const [editPhone, setEditPhone] = useState(formatPhone(driver.phone || ''))
  const [editPlate, setEditPlate] = useState(driver.default_plate || '')
  const [editCpf, setEditCpf] = useState(formatCpf(driver.cpf || ''))
  const [editPin, setEditPin] = useState(driver.pin || '')
  const [editTelegram, setEditTelegram] = useState(driver.telegram_username || driver.telegram_chat_id || '')

  if (isEditing) {
    const handleUpdateSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      const formData = new FormData()
      formData.append('company_id', editCompanyId)
      formData.append('name', editName)
      formData.append('phone', editPhone)
      formData.append('default_plate', editPlate.toUpperCase())
      formData.append('cpf', editCpf)
      formData.append('pin', editPin)
      formData.append('telegram_username', editTelegram.trim())
      onSaveEdit(formData)
    }

    return (
      <Card className="border-[#0D9488] shadow-md bg-[#F0FDFA]/30">
        <CardHeader className="pb-3 border-b border-[#CCFBF1]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-[#0F766E] flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Editando Motorista
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
            {companies.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">Empresa</Label>
                <select
                  value={editCompanyId}
                  onChange={(e) => setEditCompanyId(e.target.value)}
                  className="flex h-9 w-full rounded-[6px] border border-[#D6D3D1] bg-white px-2.5 text-xs text-[#1C1917]"
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
              <Label className="text-xs">Nome</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 text-xs"
                minLength={3}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">WhatsApp / Celular</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Placa</Label>
                <Input
                  value={editPlate}
                  onChange={(e) => setEditPlate(e.target.value.toUpperCase())}
                  className="h-9 text-xs uppercase"
                  maxLength={8}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CPF</Label>
                <Input
                  value={editCpf}
                  onChange={(e) => setEditCpf(formatCpf(e.target.value))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#0D9488]" /> PIN (4 dígitos)
              </Label>
              <Input
                value={editPin}
                maxLength={4}
                onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ''))}
                className="h-9 text-xs font-mono font-bold tracking-widest"
                placeholder="4 dígitos"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Telegram @usuário ou Chat ID</Label>
              <Input
                value={editTelegram}
                onChange={(e) => setEditTelegram(e.target.value)}
                className="h-9 text-xs font-mono"
                placeholder="@motorista ou Chat ID"
              />
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]">
              {driver.default_plate || "Sem placa"}
            </span>
            <div className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#57534E] border border-[#E7E5E4] flex items-center gap-1.5">
              <Lock className="w-2.5 h-2.5 text-[#0D9488]" />
              <span>PIN:</span>
              <span className="font-bold tracking-wider">{showPin ? driver.pin : '••••'}</span>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[#78716C] hover:text-[#0D9488] ml-0.5 transition-colors focus:outline-none"
                title={showPin ? "Ocultar PIN" : "Revelar PIN"}
              >
                {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
            {(driver.telegram_username || driver.telegram_chat_id) && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#F0F9FF] text-[#0284C7] border border-[#BAE6FD] flex items-center gap-1">
                <span>TG:</span>
                <span className="font-semibold">{driver.telegram_username || driver.telegram_chat_id}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-[#78716C] hover:text-[#0D9488]"
              title="Editar motorista"
              onClick={onStartEdit}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-[#78716C] hover:text-red-600"
                title="Excluir motorista"
                onClick={onStartDelete}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <CardTitle className="text-base font-bold mt-2 text-[#1C1917]">{driver.name}</CardTitle>

        {companies.length > 1 && (
          <div className="text-xs text-[#57534E] flex items-center gap-1 mt-0.5">
            <Building2 className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
            <span className="truncate">{driver.companies?.name || "Empresa"}</span>
          </div>
        )}

        <CardDescription className="text-xs flex items-center gap-1.5 text-[#57534E] font-mono mt-1">
          <Phone className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
          {formatPhone(driver.phone)}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 text-xs text-[#78716C] font-mono border-t border-[#E7E5E4] pt-2 mt-auto">
        {isDeleting ? (
          <div className="py-1 space-y-2">
            <p className="text-[11px] text-red-600 font-sans font-medium">Excluir este motorista?</p>
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
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 truncate max-w-[150px]" title={driver.cpf || "CPF não informado"}>
              <CreditCard className="w-3 h-3 shrink-0" /> CPF: {maskCpf(driver.cpf)}
            </span>
            <a
              href={getWhatsAppUrl(driver.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0D9488] hover:underline font-semibold font-sans text-xs shrink-0"
            >
              WhatsApp →
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
})

// ==========================================
// 🚛 COMPONENTE PRINCIPAL: DriverManager
// ==========================================

export function DriverManager({
  initialDrivers,
  companies,
  userRole = 'admin',
}: {
  initialDrivers: any[]
  companies: any[]
  userRole?: 'admin' | 'operator'
}) {
  const isAdmin = userRole === 'admin'
  const [drivers, setDrivers] = useState(initialDrivers)
  const [isPending, startTransition] = useTransition()
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Edição e deleção
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtro memorizado de busca (Otimização de Performance)
  const filteredDrivers = useMemo(() => {
    if (!searchTerm.trim()) return drivers
    const term = searchTerm.toLowerCase().trim()
    return drivers.filter((d) => {
      const matchName = d.name?.toLowerCase().includes(term)
      const matchPlate = d.default_plate?.toLowerCase().includes(term)
      const matchPhone = d.phone?.replace(/\D/g, '').includes(term.replace(/\D/g, ''))
      const matchCpf = d.cpf?.replace(/\D/g, '').includes(term.replace(/\D/g, ''))
      return matchName || matchPlate || matchPhone || matchCpf
    })
  }, [drivers, searchTerm])

  const handleDriverCreated = (newDriver: any) => {
    setDrivers((prev) => [newDriver, ...prev])
  }

  const handleUpdate = (id: string, formData: FormData) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await updateDriver(id, formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        const companyId = formData.get('company_id') as string
        const companyObj = companies.find((c) => c.id === companyId)
        setDrivers((prev) =>
          prev.map((d) => (d.id === id ? { ...res.data, companies: companyObj } : d))
        )
        setEditingId(null)
      }
    })
  }

  const handleDelete = (id: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteDriver(id)
      if (res.error) {
        setFeedbackError(res.error)
        setDeletingId(null)
      } else if (res.success) {
        setDrivers((prev) => prev.filter((d) => d.id !== id))
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
            className="text-red-500 hover:text-red-700 text-xs font-bold"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário desacoplado de cadastro */}
        <CreateDriverForm
          companies={companies}
          onDriverCreated={handleDriverCreated}
          onError={setFeedbackError}
        />

        {/* Lista e Busca de Motoristas */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Motoristas Registrados ({filteredDrivers.length} de {drivers.length})
            </h2>

            {/* Barra de busca rápida */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar nome, placa ou fone..."
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

          {filteredDrivers.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <Truck className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">
                {searchTerm ? 'Nenhum motorista encontrado na busca' : 'Nenhum motorista cadastrado'}
              </p>
              <p className="text-xs text-[#78716C] mt-1">
                {searchTerm
                  ? 'Verifique os termos digitados ou limpe a busca para ver todos.'
                  : 'Cadastre os motoristas da frota ou agregados para vinculá-los às viagens.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredDrivers.map((d: any) => (
                <DriverCard
                  key={d.id}
                  driver={d}
                  companies={companies}
                  isAdmin={isAdmin}
                  isEditing={editingId === d.id}
                  isDeleting={deletingId === d.id}
                  onStartEdit={() => {
                    setFeedbackError(null)
                    setEditingId(d.id)
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(formData) => handleUpdate(d.id, formData)}
                  onStartDelete={() => setDeletingId(d.id)}
                  onCancelDelete={() => setDeletingId(null)}
                  onConfirmDelete={() => handleDelete(d.id)}
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
