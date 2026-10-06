'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createTrip } from "../actions"
import { Truck, MapPin, Building2, CheckCircle2, MessageSquare, Copy, ArrowRight } from "lucide-react"

export function NewTripForm({
  companies,
  branches,
  drivers,
}: {
  companies: any[]
  branches: any[]
  drivers: any[]
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id || '')
  const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id || '')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)

  // Filter branches and drivers by selected company
  const filteredBranches = branches.filter((b) => !selectedCompanyId || b.company_id === selectedCompanyId)
  const filteredDrivers = drivers.filter((d) => !selectedCompanyId || d.company_id === selectedCompanyId)
  const currentDriver = drivers.find((d) => d.id === selectedDriverId)

  async function handleSubmit(formData: FormData) {
    setResult(null)
    const payload = {
      company_id: formData.get('company_id') as string,
      branch_id: formData.get('branch_id') as string || undefined,
      driver_id: formData.get('driver_id') as string,
      destination: formData.get('destination') as string,
      invoices: formData.get('invoices') ? (formData.get('invoices') as string).split(',').map(s => s.trim()) : [],
      service_type: 'Estadia',
      status: 'in_transit'
    }
    startTransition(async () => {
      const res = await createTrip(payload)
      setResult(res)
    })
  }

  const driverLink = result?.data?.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/v/${result.data.token}`
    : ''

  const whatsappMessage = result?.data?.token
    ? encodeURIComponent(
        `🚚 Olá ${result.data.drivers?.name || 'Motorista'}! Seu despacho para *${result.data.destination}* foi gerado no AuditCargo.\n\nAcesse o link para registrar sua chegada e descarga:\n${driverLink}`
      )
    : ''

  const whatsappUrl = result?.data?.drivers?.phone
    ? `https://wa.me/55${result.data.drivers.phone.replace(/\D/g, '')}?text=${whatsappMessage}`
    : ''

  const handleCopyLink = () => {
    if (driverLink) {
      navigator.clipboard.writeText(driverLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (result?.success) {
    return (
      <Card className="max-w-xl mx-auto border-2 border-[#0D9488]/30 shadow-floating">
        <CardHeader className="text-center pb-4">
          <div className="w-14 h-14 rounded-full bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] flex items-center justify-center mx-auto mb-2 shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold text-[#1C1917]">Despacho Gerado com Sucesso!</CardTitle>
          <CardDescription>A viagem foi registrada no banco de dados e o token móvel foi emitido.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="p-4 rounded-[8px] bg-[#F5F5F4] border border-[#E7E5E4] text-center space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-[#78716C]">
              Token Único do Motorista
            </span>
            <div className="text-4xl font-mono font-bold tracking-widest text-[#0F172A]">
              {result.data.token}
            </div>
            <p className="text-xs text-[#57534E]">
              Destino: <strong>{result.data.destination}</strong> | Condutor: <strong>{result.data.drivers?.name}</strong>
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input value={driverLink} readOnly className="font-mono text-xs bg-white" />
              <Button type="button" variant="outline" size="icon" onClick={handleCopyLink} title="Copiar Link">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {copied && <p className="text-xs text-[#059669] text-center font-medium">Link copiado para a área de transferência!</p>}

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2.5 h-12 rounded-[6px] bg-[#059669] hover:bg-[#047857] text-white font-semibold text-sm transition-all shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                Enviar Link no WhatsApp do Motorista
              </a>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setResult(null)}
            >
              Criar Outro Despacho
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-2xl mx-auto shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Novo Despacho de Viagem</CardTitle>
        <CardDescription>
          Selecione a empresa, filial de origem e o motorista vinculado para emitir a viagem.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {companies.length === 0 || drivers.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-[6px] text-xs text-amber-900 space-y-2">
            <p className="font-semibold">Cadastros prévios necessários:</p>
            <p>
              Antes de gerar viagens, certifique-se de que possui pelo menos uma <strong>Empresa</strong> e um{" "}
              <strong>Motorista</strong> cadastrados.
            </p>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-5">
            {result?.error && (
              <div className="p-3 bg-red-100 text-red-800 rounded-[6px] text-xs font-medium">
                Erro ao gerar despacho: {result.error}
              </div>
            )}

            {/* Empresa e Filial */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="company_id" className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#0D9488]" /> Empresa
                </Label>
                <select
                  id="company_id"
                  name="company_id"
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  required
                  className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3.5 py-2.5 text-sm text-[#1C1917] focus-ring"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="branch_id" className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#0D9488]" /> Filial / CD de Saída
                </Label>
                <select
                  id="branch_id"
                  name="branch_id"
                  className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3.5 py-2.5 text-sm text-[#1C1917] focus-ring"
                >
                  <option value="">Selecione uma filial (opcional)</option>
                  {filteredBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.city || 'S/ Cidade'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Motorista Selecionado */}
            <div className="space-y-1.5">
              <Label htmlFor="driver_id" className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#0D9488]" /> Motorista Responsável
              </Label>
              <select
                id="driver_id"
                name="driver_id"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                required
                className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3.5 py-2.5 text-sm text-[#1C1917] focus-ring"
              >
                {filteredDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.default_plate ? `(Placa: ${d.default_plate})` : ''} - Tel: {d.phone}
                  </option>
                ))}
              </select>

              {currentDriver && (
                <div className="mt-2 p-2.5 bg-[#F5F5F4] rounded-[6px] text-xs text-[#57534E] flex items-center justify-between font-mono">
                  <span>Placa Habitual: <strong>{currentDriver.default_plate || 'Não cadastrada'}</strong></span>
                  <span>WhatsApp: <strong>{currentDriver.phone}</strong></span>
                </div>
              )}
            </div>

            {/* Destino e Notas */}
            <div className="space-y-1.5">
              <Label htmlFor="destination">Cliente / Local de Entrega</Label>
              <Input
                id="destination"
                name="destination"
                placeholder="Ex: Ambev CD Jundiaí - Doca 04"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoices">Notas Fiscais / CT-e (separadas por vírgula)</Label>
              <Input
                id="invoices"
                name="invoices"
                placeholder="Ex: NF-44012, NF-44013, CTE-8991"
              />
            </div>

            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isPending}>
              {isPending ? 'Emitindo Viagem & Token...' : 'Gerar Despacho e Emitir Token'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
