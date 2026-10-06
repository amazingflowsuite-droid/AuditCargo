'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createDriver, updateDriver, deleteDriver } from "../actions"
import { Truck, Plus, Phone, CreditCard, Building2, Pencil, Trash2, X, Check, Lock, AlertCircle } from "lucide-react"

export function DriverManager({
  initialDrivers,
  companies,
}: {
  initialDrivers: any[]
  companies: any[]
}) {
  const [drivers, setDrivers] = useState(initialDrivers)
  const [isPending, startTransition] = useTransition()
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  // Novo motorista
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [defaultPlate, setDefaultPlate] = useState('')
  const [cpf, setCpf] = useState('')
  const [pin, setPin] = useState('')

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCompanyId, setEditCompanyId] = useState('')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editPlate, setEditPlate] = useState('')
  const [editCpf, setEditCpf] = useState('')
  const [editPin, setEditPin] = useState('')

  // Deleção
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedbackError(null)

    const formData = new FormData()
    formData.append('company_id', companyId)
    formData.append('name', name)
    formData.append('phone', phone)
    formData.append('default_plate', defaultPlate)
    formData.append('cpf', cpf)
    formData.append('pin', pin || '1234')

    startTransition(async () => {
      const res = await createDriver(formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === companyId)
        setDrivers([{ ...res.data, companies: companyObj }, ...drivers])
        setName('')
        setPhone('')
        setDefaultPlate('')
        setCpf('')
        setPin('')
      }
    })
  }

  const startEdit = (d: any) => {
    setFeedbackError(null)
    setEditingId(d.id)
    setEditCompanyId(d.company_id || companies[0]?.id || '')
    setEditName(d.name)
    setEditPhone(d.phone || '')
    setEditPlate(d.default_plate || '')
    setEditCpf(d.cpf || '')
    setEditPin(d.pin || '1234')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleUpdate = async (id: string) => {
    setFeedbackError(null)
    const formData = new FormData()
    formData.append('company_id', editCompanyId)
    formData.append('name', editName)
    formData.append('phone', editPhone)
    formData.append('default_plate', editPlate)
    formData.append('cpf', editCpf)
    formData.append('pin', editPin)

    startTransition(async () => {
      const res = await updateDriver(id, formData)
      if (res.error) {
        setFeedbackError(res.error)
      } else if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === editCompanyId)
        setDrivers(drivers.map((d) => (d.id === id ? { ...res.data, companies: companyObj } : d)))
        setEditingId(null)
      }
    })
  }

  const handleDelete = async (id: string) => {
    setFeedbackError(null)
    startTransition(async () => {
      const res = await deleteDriver(id)
      if (res.error) {
        setFeedbackError(res.error)
        setDeletingId(null)
      } else if (res.success) {
        setDrivers(drivers.filter((d) => d.id !== id))
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
        {/* Formulário de Cadastro */}
        <Card className="lg:col-span-1 h-fit shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#0D9488]" />
              Novo Motorista
            </CardTitle>
            <CardDescription>Cadastre motoristas com WhatsApp e PIN para despacho instantâneo.</CardDescription>
          </CardHeader>
          <CardContent>
            {companies.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-[6px] text-xs text-amber-900">
                Você precisa cadastrar pelo menos uma <strong>Empresa</strong> antes de adicionar motoristas.
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="company_id">Empresa Vinculada</Label>
                  <select
                    id="company_id"
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

                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Roberto Silveira"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">WhatsApp / Celular (com DDD)</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="11999998888"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="default_plate">Placa Padrão</Label>
                    <Input
                      id="default_plate"
                      value={defaultPlate}
                      onChange={(e) => setDefaultPlate(e.target.value)}
                      placeholder="ABC-1234"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pin">PIN de Acesso (4 dígitos)</Label>
                  <Input
                    id="pin"
                    type="text"
                    maxLength={4}
                    pattern="\d{4}"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 1234"
                    required
                  />
                  <p className="text-[10px] text-[#78716C]">Senha que o motorista usará para acessar o link da viagem.</p>
                </div>

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar Motorista'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Lista de Motoristas */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
              Motoristas Registrados ({drivers.length})
            </h2>
          </div>

          {drivers.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
              <Truck className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1C1917]">Nenhum motorista cadastrado</p>
              <p className="text-xs text-[#78716C] mt-1">
                Cadastre os motoristas da frota ou agregados para vinculá-los às viagens.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {drivers.map((d: any) => {
                const isEditing = editingId === d.id
                const isDeleting = deletingId === d.id

                if (isEditing) {
                  return (
                    <Card key={d.id} className="border-[#0D9488] shadow-md bg-[#F0FDFA]/30">
                      <CardHeader className="pb-3 border-b border-[#CCFBF1]">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-bold text-[#0F766E] flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5" /> Editando Motorista
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

                        <div className="space-y-1">
                          <Label className="text-xs">Nome</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9 text-xs"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">WhatsApp / Celular</Label>
                          <Input
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="h-9 text-xs"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Placa</Label>
                            <Input
                              value={editPlate}
                              onChange={(e) => setEditPlate(e.target.value)}
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">CPF</Label>
                            <Input
                              value={editCpf}
                              onChange={(e) => setEditCpf(e.target.value)}
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
                            className="h-9 text-xs font-mono font-bold"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1.5"
                            onClick={() => handleUpdate(d.id)}
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
                  <Card key={d.id} className="hover:border-[#0D9488]/40 transition-colors relative flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]">
                            {d.default_plate || "Sem placa"}
                          </span>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#57534E] border border-[#E7E5E4] flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5 text-[#0D9488]" />
                            PIN: {d.pin || '1234'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#78716C] hover:text-[#0D9488]"
                            title="Editar motorista"
                            onClick={() => startEdit(d)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#78716C] hover:text-red-600"
                            title="Excluir motorista"
                            onClick={() => setDeletingId(d.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <CardTitle className="text-base font-bold mt-2 text-[#1C1917]">{d.name}</CardTitle>
                      
                      <div className="text-xs text-[#57534E] flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                        <span className="truncate">{d.companies?.name || "Empresa"}</span>
                      </div>

                      <CardDescription className="text-xs flex items-center gap-1.5 text-[#57534E] font-mono mt-1">
                        <Phone className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                        {d.phone}
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
                              onClick={() => handleDelete(d.id)}
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
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 truncate max-w-[150px]">
                            <CreditCard className="w-3 h-3 shrink-0" /> CPF: {d.cpf || "Não inf."}
                          </span>
                          <a
                            href={`https://wa.me/55${d.phone.replace(/\D/g, '')}`}
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
