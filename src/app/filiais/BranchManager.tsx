'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBranch, updateBranch, deleteBranch } from "../actions"
import { MapPin, Plus, Pencil, Trash2, Building2, X, Check } from "lucide-react"

export function BranchManager({
  initialBranches,
  companies,
}: {
  initialBranches: any[]
  companies: any[]
}) {
  const [branches, setBranches] = useState(initialBranches)
  const [isPending, startTransition] = useTransition()

  // Novo cadastro
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCompanyId, setEditCompanyId] = useState('')
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editState, setEditState] = useState('')

  // Deleção
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.append('company_id', companyId)
    formData.append('name', name)
    formData.append('code', code)
    formData.append('city', city)
    formData.append('state', state)

    startTransition(async () => {
      const res = await createBranch(formData)
      if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === companyId)
        setBranches([{ ...res.data, companies: companyObj }, ...branches])
        setName('')
        setCode('')
        setCity('')
        setState('')
      }
    })
  }

  const startEdit = (b: any) => {
    setEditingId(b.id)
    setEditCompanyId(b.company_id)
    setEditName(b.name)
    setEditCode(b.code || '')
    setEditCity(b.city || '')
    setEditState(b.state || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleUpdate = async (id: string) => {
    const formData = new FormData()
    formData.append('company_id', editCompanyId)
    formData.append('name', editName)
    formData.append('code', editCode)
    formData.append('city', editCity)
    formData.append('state', editState)

    startTransition(async () => {
      const res = await updateBranch(id, formData)
      if (res.success && res.data) {
        const companyObj = companies.find((c) => c.id === editCompanyId)
        setBranches(branches.map((b) => (b.id === id ? { ...res.data, companies: companyObj } : b)))
        setEditingId(null)
      }
    })
  }

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const res = await deleteBranch(id)
      if (res.success) {
        setBranches(branches.filter((b) => b.id !== id))
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
            Nova Filial
          </CardTitle>
          <CardDescription>Cadastre uma unidade de saída ou filial operacional.</CardDescription>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-[6px] text-xs text-amber-900">
              Você precisa cadastrar pelo menos uma <strong>Empresa</strong> antes de adicionar filiais.
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company_id">Empresa Responsável</Label>
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
                <Label htmlFor="name">Nome da Filial / CD</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Filial Campinas CD-1"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="code">Código / Sigla</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: FIL-01 ou CPQ"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Campinas"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">UF</Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? 'Salvando...' : 'Salvar Filial'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Lista de Filiais com Alteração e Exclusão */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
          Filiais Registradas ({branches.length})
        </h2>

        {branches.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
            <MapPin className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#1C1917]">Nenhuma filial cadastrada</p>
            <p className="text-xs text-[#78716C] mt-1">
              Adicione a primeira filial para poder selecionar como ponto de saída de carga.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {branches.map((b) => {
              const isEditing = editingId === b.id

              return (
                <Card key={b.id} className="relative hover:border-[#0D9488]/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#F5F5F4] text-[#0F172A] border border-[#E7E5E4]">
                        {b.code || "S/ COD"}
                      </span>

                      {/* Botões de Ação */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(b)}
                          className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
                          title="Editar Filial"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(b.id)}
                          className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                          title="Excluir Filial"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 pt-2">
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
                        <div>
                          <Label className="text-xs">Nome da Filial</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9 text-xs mt-1"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Código</Label>
                            <Input
                              value={editCode}
                              onChange={(e) => setEditCode(e.target.value)}
                              className="h-9 text-xs mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">UF</Label>
                            <Input
                              value={editState}
                              onChange={(e) => setEditState(e.target.value.toUpperCase())}
                              className="h-9 text-xs mt-1"
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

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            className="gap-1 h-8 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                            onClick={() => handleUpdate(b.id)}
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
                        <div className="text-xs text-[#57534E] flex items-center gap-1 mt-1">
                          <Building2 className="w-3.5 h-3.5 text-[#0D9488]" />
                          {b.companies?.name || "Empresa"}
                        </div>
                        <CardTitle className="text-base font-bold mt-2">{b.name}</CardTitle>
                        <CardDescription className="text-xs flex items-center gap-1 text-[#78716C]">
                          <MapPin className="w-3.5 h-3.5" />
                          {b.city ? `${b.city}/${b.state || ""}` : "Localização não informada"}
                        </CardDescription>
                      </>
                    )}
                  </CardHeader>

                  {/* Confirmação de Exclusão */}
                  {deletingId === b.id && (
                    <div className="absolute inset-0 bg-[#FAFAF9]/95 backdrop-blur-xs rounded-[8px] p-4 flex flex-col justify-center items-center text-center space-y-3 z-10 border border-red-200">
                      <p className="text-xs text-[#1C1917] font-semibold">
                        Deseja excluir a filial <strong>{b.name}</strong>?
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          onClick={() => handleDelete(b.id)}
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
