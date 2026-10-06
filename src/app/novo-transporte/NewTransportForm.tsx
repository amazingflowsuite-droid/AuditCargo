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
  Plus,
  Trash2,
  FileText,
  Send,
  Users,
  ExternalLink,
  Mail,
} from "lucide-react"

interface RecipientItem {
  id: string
  recipient_id?: string
  name: string
  destination: string
  invoices: string
  email?: string
}

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
  const [customSender, setCustomSender] = useState<string>('')

  // Destinatário Principal Selecionado
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('')
  const [customDestination, setCustomDestination] = useState<string>('')
  const [generalInvoices, setGeneralInvoices] = useState<string>('')

  // Destinatários Adicionais (1 Remetente -> N Destinatários)
  const [additionalRecipients, setAdditionalRecipients] = useState<RecipientItem[]>([])

  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)

  // Filtros por empresa
  const filteredBranches = branches.filter((b) => !selectedCompanyId || b.company_id === selectedCompanyId)
  const filteredDrivers = drivers.filter((d) => !selectedCompanyId || d.company_id === selectedCompanyId)
  const filteredSenders = senders.filter((s) => !selectedCompanyId || s.company_id === selectedCompanyId)
  const filteredRecipients = registeredRecipients.filter((r) => {
    if (selectedCompanyId && r.company_id !== selectedCompanyId) return false
    if (selectedSenderId && selectedSenderId !== 'custom') {
      return !r.sender_id || r.sender_id === selectedSenderId
    }
    return true
  })

  const currentDriver = drivers.find((d) => d.id === selectedDriverId)
  const currentSender = filteredSenders.find((s) => s.id === selectedSenderId)
  const currentMainRecipient = filteredRecipients.find((r) => r.id === selectedRecipientId)

  const addRecipient = () => {
    setAdditionalRecipients([
      ...additionalRecipients,
      {
        id: Math.random().toString(),
        name: '',
        destination: '',
        invoices: '',
      },
    ])
  }

  const removeRecipient = (id: string) => {
    setAdditionalRecipients(additionalRecipients.filter((r) => r.id !== id))
  }

  const handleSelectRecipientForStop = (id: string, recipientId: string) => {
    if (recipientId === 'custom') {
      setAdditionalRecipients(
        additionalRecipients.map((r) =>
          r.id === id ? { ...r, recipient_id: 'custom', name: '', destination: '', email: '' } : r
        )
      )
    } else {
      const found = filteredRecipients.find((r) => r.id === recipientId)
      if (found) {
        setAdditionalRecipients(
          additionalRecipients.map((r) =>
            r.id === id
              ? {
                  ...r,
                  recipient_id: recipientId,
                  name: found.name,
                  destination: `${found.city || ''} - ${found.address || ''}`,
                  email: found.email || '',
                }
              : r
          )
        )
      }
    }
  }

  const updateRecipient = (id: string, field: keyof RecipientItem, value: string) => {
    setAdditionalRecipients(additionalRecipients.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)

    // Remetente final
    const finalSenderName =
      selectedSenderId && selectedSenderId !== 'custom'
        ? `${currentSender?.name} (${currentSender?.city || ''})`
        : customSender

    // Destinatário principal final
    const finalMainDest =
      selectedRecipientId && selectedRecipientId !== 'custom'
        ? `${currentMainRecipient?.name} - ${currentMainRecipient?.city || ''}`
        : customDestination

    const mainRecipientEmail = currentMainRecipient?.email || undefined

    // Agrupa todas as notas fiscais
    const allInvoices = [
      ...generalInvoices.split(',').map((n) => n.trim()).filter(Boolean),
      ...additionalRecipients.flatMap((r) => r.invoices.split(',').map((n) => n.trim()).filter(Boolean)),
    ]

    const destinationSummary =
      additionalRecipients.length > 0
        ? `${finalMainDest} (+${additionalRecipients.length} entregas)`
        : finalMainDest

    startTransition(async () => {
      const res = await createTrip({
        company_id: selectedCompanyId,
        branch_id: selectedBranchId || undefined,
        driver_id: selectedDriverId,
        cte_number: cteNumber,
        service_type: serviceType,
        status,
        sender: finalSenderName,
        destination: destinationSummary,
        invoices: Array.from(new Set(allInvoices)),
        recipient_email: mainRecipientEmail,
        recipients: [
          {
            name: finalMainDest,
            destination: finalMainDest,
            invoices: generalInvoices,
            email: mainRecipientEmail,
          },
          ...additionalRecipients.map((r) => ({
            name: r.name,
            destination: r.destination,
            invoices: r.invoices,
            email: r.email,
          })),
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
                setAdditionalRecipients([])
                setCteNumber('')
                setGeneralInvoices('')
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

            {/* SEÇÃO 3: REMETENTE & DESTINATÁRIOS (INTEGRADOS AO CADASTRO) */}
            <div className="space-y-4 p-4 rounded-[8px] bg-[#F5F5F4]/60 border border-[#E7E5E4]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold uppercase text-[#57534E] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#0D9488]" /> 3. Remetente & Destinatários (1 Remetente → N Entregas)
                </h3>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRecipient}
                  className="gap-1 h-8 text-xs border-[#0D9488] text-[#0D9488] hover:bg-teal-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Parada / Destinatário
                </Button>
              </div>

              {/* REMETENTE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senderSelect">Remetente (Expedidor)</Label>
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
                  onChange={(e) => setSelectedSenderId(e.target.value)}
                  className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                >
                  <option value="">Selecione um Remetente Cadastrado...</option>
                  {filteredSenders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.city ? `(${s.city})` : ''} {s.cnpj ? `- CNPJ: ${s.cnpj}` : ''}
                    </option>
                  ))}
                  <option value="custom">Outro (Digitar Avulso)</option>
                </select>

                {currentSender && (
                  <div className="p-2.5 bg-white rounded-[6px] border border-[#E7E5E4] text-xs text-[#57534E] grid grid-cols-1 sm:grid-cols-3 gap-1 font-mono">
                    <span>CNPJ: <strong>{currentSender.cnpj || 'Não inf.'}</strong></span>
                    <span>Município: <strong>{currentSender.city}</strong></span>
                    <span>Fone: <strong>{currentSender.phone || 'S/ Fone'}</strong></span>
                  </div>
                )}

                {(!selectedSenderId || selectedSenderId === 'custom') && (
                  <Input
                    value={customSender}
                    onChange={(e) => setCustomSender(e.target.value)}
                    placeholder="Digite o nome/endereço do remetente..."
                    required={!selectedSenderId || selectedSenderId === 'custom'}
                    className="mt-1.5"
                  />
                )}
              </div>

              {/* DESTINATÁRIO PRINCIPAL */}
              <div className="space-y-2 pt-2 border-t border-[#E7E5E4]">
                <div className="flex items-center justify-between">
                  <Label htmlFor="recipientSelect">Destinatário Principal (Primeira Entrega)</Label>
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
                  className="flex h-11 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-3 py-2 text-sm text-[#1C1917] focus-ring"
                >
                  <option value="">Selecione um Destinatário Cadastrado...</option>
                  {filteredRecipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.city ? `(${r.city})` : ''} {r.cnpj ? `- CNPJ: ${r.cnpj}` : ''}
                    </option>
                  ))}
                  <option value="custom">Outro (Digitar Avulso)</option>
                </select>

                {currentMainRecipient && (
                  <div className="p-2.5 bg-white rounded-[6px] border border-[#E7E5E4] text-xs text-[#57534E] grid grid-cols-1 sm:grid-cols-3 gap-1.5 font-mono">
                    <span>CNPJ: <strong>{currentMainRecipient.cnpj || 'Não inf.'}</strong></span>
                    <span>Município: <strong>{currentMainRecipient.city}</strong></span>
                    <span>Doca/End.: <strong>{currentMainRecipient.address || 'Geral'}</strong></span>
                    {currentMainRecipient.email ? (
                      <div className="sm:col-span-3 text-[11px] text-teal-800 bg-teal-50 px-2 py-1 rounded border border-teal-200 flex items-center gap-1.5 font-sans mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                        <span>Aviso de Chegada automático ativo para: <strong>{currentMainRecipient.email}</strong></span>
                      </div>
                    ) : (
                      <div className="sm:col-span-3 text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center gap-1.5 font-sans mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Destinatário sem e-mail cadastrado (o aviso por e-mail não será disparado).</span>
                      </div>
                    )}
                  </div>
                )}

                {(!selectedRecipientId || selectedRecipientId === 'custom') && (
                  <Input
                    value={customDestination}
                    onChange={(e) => setCustomDestination(e.target.value)}
                    placeholder="Digite o nome/endereço do cliente de entrega..."
                    required={!selectedRecipientId || selectedRecipientId === 'custom'}
                    className="mt-1.5"
                  />
                )}

                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="generalInvoices">Notas Fiscais desta entrega (separadas por vírgula)</Label>
                  <Input
                    id="generalInvoices"
                    value={generalInvoices}
                    onChange={(e) => setGeneralInvoices(e.target.value)}
                    placeholder="Ex: NF-4401, NF-4402"
                  />
                </div>
              </div>

              {/* DESTINATÁRIOS ADICIONAIS (1 -> N) */}
              {additionalRecipients.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-[#E7E5E4]">
                  <p className="text-xs font-semibold text-[#1C1917]">
                    Destinatários Adicionais da Mesma Carga ({additionalRecipients.length}):
                  </p>

                  {additionalRecipients.map((recipient, idx) => (
                    <div
                      key={recipient.id}
                      className="p-3 bg-white rounded-[6px] border border-[#D6D3D1] space-y-2 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold text-[#0D9488]">
                          Parada / Entrega #{idx + 2}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRecipient(recipient.id)}
                          className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remover Parada
                        </button>
                      </div>

                      <div className="space-y-2">
                        <select
                          value={recipient.recipient_id || ''}
                          onChange={(e) => handleSelectRecipientForStop(recipient.id, e.target.value)}
                          className="flex h-9 w-full rounded-[6px] border border-[#D6D3D1] bg-[#FAFAF9] px-2 text-xs text-[#1C1917]"
                        >
                          <option value="">Selecione da lista de Destinatários ou digite...</option>
                          {filteredRecipients.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} - {r.city}
                            </option>
                          ))}
                          <option value="custom">Digitar Avulso</option>
                        </select>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Input
                            placeholder="Nome do Cliente"
                            value={recipient.name}
                            onChange={(e) => updateRecipient(recipient.id, 'name', e.target.value)}
                            className="h-9 text-xs"
                            required
                          />
                          <Input
                            placeholder="Endereço / Município / Doca"
                            value={recipient.destination}
                            onChange={(e) => updateRecipient(recipient.id, 'destination', e.target.value)}
                            className="h-9 text-xs"
                            required
                          />
                          <Input
                            placeholder="Notas Fiscais (ex: 5501, 5502)"
                            value={recipient.invoices}
                            onChange={(e) => updateRecipient(recipient.id, 'invoices', e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
