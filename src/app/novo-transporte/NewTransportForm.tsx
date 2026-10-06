'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createTrip } from "../actions"
import {
  Truck,
  MapPin,
  Building2,
  CheckCircle2,
  MessageSquare,
  Copy,
  FileText,
  Users,
  ExternalLink,
  Mail,
} from "lucide-react"

export function NewTransportForm({
  companies,
  branches,
  drivers,
  senders = [],
  recipients: registeredRecipients = [],
}: {
  companies: any[]
  branches: any[]
  drivers: any[]
  senders?: any[]
  recipients?: any[]
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id || '')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id || '')
  const [cteNumber, setCteNumber] = useState<string>('')
  const [serviceType, setServiceType] = useState<string>('Estadia')
  const [status, setStatus] = useState<string>('in_transit')

  // Remetente Selecionado
  const [selectedSenderId, setSelectedSenderId] = useState<string>('')

  // Destinatário Selecionado
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('')
  const [generalInvoices, setGeneralInvoices] = useState<string>('')

  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)

  // Filtros por empresa
  const filteredBranches = branches.filter((b) => !selectedCompanyId || b.company_id === selectedCompanyId)
  const filteredDrivers = drivers.filter((d) => !selectedCompanyId || d.company_id === selectedCompanyId)
  const filteredSenders = senders.filter((s) => !selectedCompanyId || s.company_id === selectedCompanyId)

  // Lista estritamente os destinatários vinculados ao remetente selecionado
  const filteredRecipients = registeredRecipients.filter((r) => {
    if (!selectedSenderId) return false
    return r.sender_id === selectedSenderId
  })

  const currentDriver = drivers.find((d) => d.id === selectedDriverId)
  const currentSender = filteredSenders.find((s) => s.id === selectedSenderId)
  const currentRecipient = filteredRecipients.find((r) => r.id === selectedRecipientId)

  const handleSenderChange = (senderId: string) => {
    setSelectedSenderId(senderId)
    setSelectedRecipientId('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)

    if (!currentSender) {
      alert('Selecione um remetente cadastrado.')
      return
    }

    if (!currentRecipient) {
      alert('Selecione um destinatário cadastrado.')
      return
    }

    const finalSenderName = `${currentSender.name} (${currentSender.city || ''})`
    const finalDestinationName = `${currentRecipient.name} - ${currentRecipient.city || ''}`
    const recipientEmail = currentRecipient.email || undefined

    const allInvoices = generalInvoices
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)

    startTransition(async () => {
      const res = await createTrip({
        company_id: selectedCompanyId,
        branch_id: selectedBranchId || undefined,
        driver_id: selectedDriverId,
        cte_number: cteNumber,
        service_type: serviceType,
        status,
        sender: finalSenderName,
        destination: finalDestinationName,
        invoices: Array.from(new Set(allInvoices)),
        recipient_email: recipientEmail,
        recipients: [
          {
            name: currentRecipient.name,
            destination: finalDestinationName,
            invoices: generalInvoices,
            email: recipientEmail,
          },
        ],
      })
      setResult(res)
    })
  }

  const driverLink = result?.data?.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/v/${result.data.token}`
    : ''

  const whatsappMessage = result?.data?.token
    ? encodeURIComponent(
        `🚚 *AUDITCARGO - Novo Transporte Emitido*\n\n` +
          `Olá *${result.data.drivers?.name || 'Motorista'}*!\n` +
          `📦 *CT-e / DACTE:* ${cteNumber || 'S/ DACTE'}\n` +
          `⚙️ *Tipo de Serviço:* ${serviceType}\n` +
          `📍 *Destino:* ${result.data.destination}\n\n` +
          `📲 *Acesse o link para registrar Chegada na Portaria e Descarga:*\n${driverLink}`
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
          <CardTitle className="text-2xl font-bold text-[#1C1917]">Transporte Emitido com Sucesso!</CardTitle>
          <CardDescription>O transporte foi registrado no banco e o token fiscal foi vinculado.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="p-4 rounded-[8px] bg-[#F5F5F4] border border-[#E7E5E4] text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded-[4px] bg-[#0F172A] text-white">
                {serviceType}
              </span>
              {cteNumber && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-[4px] bg-[#E7E5E4] text-[#1C1917]">
                  CT-e: {cteNumber}
                </span>
              )}
            </div>

            <span className="text-xs font-mono uppercase tracking-wider text-[#78716C] block mt-1">
              Token de Acesso do Motorista
            </span>
            <div className="text-4xl font-mono font-bold tracking-widest text-[#0F172A]">
              {result.data.token}
            </div>

            <p className="text-xs text-[#57534E]">
              Motorista: <strong>{result.data.drivers?.name}</strong> | Destino: <strong>{result.data.destination}</strong>
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input value={driverLink} readOnly className="font-mono text-xs bg-white" />
              <Button type="button" variant="outline" size="icon" onClick={handleCopyLink} title="Copiar Link">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {copied && <p className="text-xs text-[#059669] text-center font-medium">Link copiado com sucesso!</p>}

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2.5 h-12 rounded-[6px] bg-[#059669] hover:bg-[#047857] text-white font-semibold text-sm transition-all shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                Enviar Notificação com DACTE no WhatsApp
              </a>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setResult(null)
                setCteNumber('')
                setGeneralInvoices('')
                setSelectedSenderId('')
                setSelectedRecipientId('')
              }}
            >
              Emitir Outro Transporte
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-3xl mx-auto shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <Truck className="w-5 h-5 text-[#0D9488]" />
          Emissão de Transporte de Carga
        </CardTitle>
        <CardDescription>
          Vincule o DACTE (CT-e), tipo de serviço, remetente e destinatários cadastrados para auditoria.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {companies.length === 0 || drivers.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-[6px] text-xs text-amber-900 space-y-2">
            <p className="font-semibold">Cadastros necessários:</p>
            <p>
              Cadastre pelo menos uma <strong>Empresa</strong> e um <strong>Motorista</strong> para emitir transportes.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {result?.error && (
              <div className="p-3 bg-red-100 text-red-800 rounded-[6px] text-xs font-medium">
                Erro ao emitir transporte: {result.error}
              </div>
            )}

            {/* SEÇÃO 1: DADOS FISCAIS E TIPO DE SERVIÇO */}
            <div className="space-y-3 p-4 rounded-[8px] bg-[#F5F5F4]/60 border border-[#E7E5E4]">
              <h3 className="text-xs font-mono font-bold uppercase text-[#57534E] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#0D9488]" /> 1. Fiscal & Operação
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="cteNumber">Número / Chave DACTE (CT-e)</Label>
                  <Input
                    id="cteNumber"
                    value={cteNumber}
                    onChange={(e) => setCteNumber(e.target.value)}
                    placeholder="Ex: CTE-99824"
                    className="font-mono text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="serviceType">Tipo de Serviço</Label>
                  <select
                    id="serviceType"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                  >
                    <option value="Estadia">Estadia (Espera / Franquia)</option>
                    <option value="Descarga">Descarga</option>
                    <option value="Reentrega">Reentrega</option>
                    <option value="Devolução">Devolução</option>
                    <option value="Armazenagem">Armazenagem</option>
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="status">Status Inicial</Label>
                  <select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                  >
                    <option value="in_transit">Em Trânsito</option>
                    <option value="arrived">Chegou no Destino / Portaria</option>
                    <option value="unloading">Em Descarga / Doca</option>
                    <option value="finished">Finalizado</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: EMPRESA, FILIAL E CONDUTOR */}
            <div className="space-y-3 p-4 rounded-[8px] bg-[#F5F5F4]/60 border border-[#E7E5E4]">
              <h3 className="text-xs font-mono font-bold uppercase text-[#57534E] flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#0D9488]" /> 2. Origem & Condutor
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="company_id">Empresa</Label>
                  <select
                    id="company_id"
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    required
                    className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="branch_id">Filial de Saída</Label>
                  <select
                    id="branch_id"
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                  >
                    <option value="">Direta (Sem filial)</option>
                    {filteredBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city || 'SP'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="driver_id">Motorista</Label>
                  <select
                    id="driver_id"
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    required
                    className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                  >
                    {filteredDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.default_plate ? `(${d.default_plate})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: REMETENTE & DESTINATÁRIO */}
            <div className="space-y-4 p-4 rounded-[8px] bg-[#F5F5F4]/60 border border-[#E7E5E4]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold uppercase text-[#57534E] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#0D9488]" /> 3. Remetente & Destinatário
                </h3>
              </div>

              {/* REMETENTE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senderSelect">Remetente</Label>
                  <Link
                    href="/remetentes"
                    target="_blank"
                    className="text-[11px] text-[#0D9488] hover:underline flex items-center gap-1"
                  >
                    Novo Remetente <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                <select
                  id="senderSelect"
                  value={selectedSenderId}
                  onChange={(e) => handleSenderChange(e.target.value)}
                  required
                  className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                >
                  <option value="">Selecione um Remetente Cadastrado...</option>
                  {filteredSenders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.city ? `(${s.city})` : ''} {s.cnpj ? `- CNPJ: ${s.cnpj}` : ''}
                    </option>
                  ))}
                </select>

                {currentSender && (
                  <div className="p-2.5 bg-white rounded-[6px] border border-[#E7E5E4] text-xs text-[#57534E] grid grid-cols-1 sm:grid-cols-3 gap-1 font-mono">
                    <span>CNPJ: <strong>{currentSender.cnpj || 'Não inf.'}</strong></span>
                    <span>Município: <strong>{currentSender.city}</strong></span>
                    <span>Fone: <strong>{currentSender.phone || 'S/ Fone'}</strong></span>
                  </div>
                )}
              </div>

              {/* DESTINATÁRIO */}
              <div className="space-y-2 pt-2 border-t border-[#E7E5E4]">
                <div className="flex items-center justify-between">
                  <Label htmlFor="recipientSelect">Destinatário</Label>
                  <Link
                    href="/destinatarios"
                    target="_blank"
                    className="text-[11px] text-[#0D9488] hover:underline flex items-center gap-1"
                  >
                    Novo Destinatário <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                <select
                  id="recipientSelect"
                  value={selectedRecipientId}
                  onChange={(e) => setSelectedRecipientId(e.target.value)}
                  disabled={!selectedSenderId}
                  required
                  className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring disabled:opacity-50"
                >
                  <option value="">
                    {!selectedSenderId
                      ? 'Selecione primeiro o Remetente...'
                      : filteredRecipients.length === 0
                      ? 'Nenhum destinatário vinculado a este Remetente'
                      : 'Selecione um Destinatário Cadastrado...'}
                  </option>
                  {filteredRecipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.city ? `(${r.city})` : ''} {r.cnpj ? `- CNPJ: ${r.cnpj}` : ''}
                    </option>
                  ))}
                </select>

                {currentRecipient && (
                  <div className="p-2.5 bg-white rounded-[6px] border border-[#E7E5E4] text-xs text-[#57534E] grid grid-cols-1 sm:grid-cols-3 gap-1.5 font-mono">
                    <span>CNPJ: <strong>{currentRecipient.cnpj || 'Não inf.'}</strong></span>
                    <span>Município: <strong>{currentRecipient.city}</strong></span>
                    <span>Doca/End.: <strong>{currentRecipient.address || 'Geral'}</strong></span>
                    {currentRecipient.email ? (
                      <div className="sm:col-span-3 text-[11px] text-teal-800 bg-teal-50 px-2 py-1 rounded border border-teal-200 flex items-center gap-1.5 font-sans mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                        <span>Aviso de Chegada automático ativo para: <strong>{currentRecipient.email}</strong></span>
                      </div>
                    ) : (
                      <div className="sm:col-span-3 text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center gap-1.5 font-sans mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Destinatário sem e-mail cadastrado (o aviso por e-mail não será disparado).</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="generalInvoices">Notas Fiscais da entrega (separadas por vírgula)</Label>
                  <Input
                    id="generalInvoices"
                    value={generalInvoices}
                    onChange={(e) => setGeneralInvoices(e.target.value)}
                    placeholder="Ex: NF-4401, NF-4402"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isPending}>
              {isPending ? 'Emitindo Transporte...' : 'Emitir Transporte & Gerar Token'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
