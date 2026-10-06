'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createCompany, updateCompany, deleteCompany } from "../actions"
import { formatCNPJ } from "@/utils/masks"
import { Building2, Plus, Pencil, Trash2, ShieldCheck, X, Check } from "lucide-react"

export function CompanyManager({ initialCompanies }: { initialCompanies: any[] }) {
  const [companies, setCompanies] = useState(initialCompanies)
  const [isPending, startTransition] = useTransition()
  
  // Novo cadastro
  const [newName, setNewName] = useState('')
  const [newCnpj, setNewCnpj] = useState('')

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCnpj, setEditCnpj] = useState('')

  // Deleção
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.append('name', newName)
    formData.append('cnpj', newCnpj)

    startTransition(async () => {
      const res = await createCompany(formData)
      if (res.success && res.data) {
        setCompanies([res.data, ...companies])
        setNewName('')
        setNewCnpj('')
      }
    })
  }

  const startEdit = (company: any) => {
    setEditingId(company.id)
    setEditName(company.name)
    setEditCnpj(company.cnpj || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditCnpj('')
  }

  const handleUpdate = async (id: string) => {
    const formData = new FormData()
    formData.append('name', editName)
    formData.append('cnpj', editCnpj)

    startTransition(async () => {
      const res = await updateCompany(id, formData)
      if (res.success && res.data) {
        setCompanies(companies.map(c => c.id === id ? res.data : c))
        setEditingId(null)
      }
    })
  }

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const res = await deleteCompany(id)
      if (res.success) {
        setCompanies(companies.filter(c => c.id !== id))
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
            Nova Empresa
          </CardTitle>
          <CardDescription>Cadastre uma transportadora ou contratante no sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Razão Social / Nome Fantasia</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Logística Express Ltda"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ (com máscara automática)</Label>
              <Input
                id="cnpj"
                value={newCnpj}
                onChange={(e) => setNewCnpj(formatCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar Empresa'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Lista de Empresas com Alteração e Exclusão */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
            Empresas Cadastradas ({companies.length})
          </h2>
        </div>

        {companies.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#D6D3D1] rounded-[8px] p-6 bg-[#F5F5F4]/50">
            <Building2 className="w-10 h-10 text-[#A8A29E] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#1C1917]">Nenhuma empresa encontrada</p>
            <p className="text-xs text-[#78716C] mt-1">
              Cadastre a primeira empresa no formulário ao lado.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {companies.map((company) => {
              const isEditing = editingId === company.id

              return (
                <Card key={company.id} className="relative hover:border-[#0D9488]/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="w-8 h-8 rounded-[6px] bg-[#0F172A] flex items-center justify-center text-white text-xs font-bold">
                        <Building2 className="w-4 h-4 text-[#0D9488]" />
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(company)}
                          className="p-1.5 text-[#57534E] hover:text-[#0D9488] hover:bg-[#F5F5F4] rounded-[4px] transition-colors"
                          title="Editar Empresa"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(company.id)}
                          className="p-1.5 text-[#57534E] hover:text-[#DC2626] hover:bg-red-50 rounded-[4px] transition-colors"
                          title="Excluir Empresa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 pt-2">
                        <div>
                          <Label className="text-xs">Razão Social</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9 text-xs mt-1"
                            required
                          />
                        </div>
                        <div>
                          <Label className="text-xs">CNPJ</Label>
                          <Input
                            value={editCnpj}
                            onChange={(e) => setEditCnpj(formatCNPJ(e.target.value))}
                            className="h-9 text-xs font-mono mt-1"
                            maxLength={18}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            className="gap-1 h-8 text-xs bg-[#0D9488] hover:bg-[#0F766E]"
                            onClick={() => handleUpdate(company.id)}
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
                  {deletingId === company.id && (
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
                          onClick={() => handleDelete(company.id)}
                          disabled={isPending}
                        >
                          Confirmar Exclusão
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
