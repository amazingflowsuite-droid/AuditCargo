import { getDrivers, getCompanies, createDriver } from "../actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Truck, Plus, Phone, CreditCard, Building2 } from "lucide-react"

export default async function MotoristasPage() {
  const [drivers, companies] = await Promise.all([getDrivers(), getCompanies()])

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-5">
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917] tracking-tight">
            Gestão de Motoristas
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            Cadastre os condutores para envio automatizado de links de viagem e integração futura via WhatsApp bot.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário de Cadastro */}
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#0D9488]" />
              Novo Motorista
            </CardTitle>
            <CardDescription>Cadastre motoristas com WhatsApp para despacho instantâneo.</CardDescription>
          </CardHeader>
          <CardContent>
            {companies.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-[6px] text-xs text-amber-900">
                Você precisa cadastrar pelo menos uma <strong>Empresa</strong> antes de adicionar motoristas.
              </div>
            ) : (
              <form action={createDriver} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="company_id">Empresa Vinculada</Label>
                  <select
                    id="company_id"
                    name="company_id"
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
                  <Input id="name" name="name" placeholder="Ex: Roberto Silveira" required />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">WhatsApp / Celular (com DDD)</Label>
                  <Input id="phone" name="phone" placeholder="11999998888" required />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="default_plate">Placa Padrão</Label>
                    <Input id="default_plate" name="default_plate" placeholder="ABC-1234" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input id="cpf" name="cpf" placeholder="000.000.000-00" />
                  </div>
                </div>

                <Button type="submit" className="w-full">
                  Salvar Motorista
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Lista de Motoristas */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold tracking-wider text-[#78716C] uppercase font-mono">
            Motoristas Registrados ({drivers.length})
          </h2>

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
              {drivers.map((d: any) => (
                <Card key={d.id} className="hover:border-[#0D9488]/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[4px] bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]">
                        {d.default_plate || "Sem placa"}
                      </span>
                      <span className="text-xs text-[#57534E] flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#0D9488]" />
                        {d.companies?.name || "Empresa"}
                      </span>
                    </div>
                    <CardTitle className="text-base font-bold mt-2">{d.name}</CardTitle>
                    <CardDescription className="text-xs flex items-center gap-1.5 text-[#57534E] font-mono">
                      <Phone className="w-3.5 h-3.5 text-[#0D9488]" />
                      {d.phone}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-[#78716C] font-mono flex items-center justify-between border-t border-[#E7E5E4] pt-2">
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3" /> CPF: {d.cpf || "Não inf."}
                    </span>
                    <a
                      href={`https://wa.me/55${d.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0D9488] hover:underline font-semibold"
                    >
                      Abrir WhatsApp →
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
