'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Info,
  Building2,
  Search,
  Filter,
} from 'lucide-react'
import { importSswSendersAction, SswClientImportDetail } from '@/app/actions'
import { parseSswClientReport, SswParsedClient } from '@/utils/ssw/client-report-parser'

interface ImportSummaryState {
  totalRecords: number
  createdCount: number
  updatedCount: number
  unchangedCount: number
  changedDetails: SswClientImportDetail[]
}

export function ImportSswSendersButton({
  companies = [],
  onSendersImported,
}: {
  companies?: any[]
  onSendersImported?: () => void
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id || '')

  // Preview state
  const [parsedClients, setParsedClients] = useState<SswParsedClient[]>([])
  const [filterOnlySenders, setFilterOnlySenders] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())

  // Final summary
  const [summary, setSummary] = useState<ImportSummaryState | null>(null)
  const [showDetailsList, setShowDetailsList] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const decodeFileText = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const utf8Decoder = new TextDecoder('utf-8', { fatal: false })
    const utf8Text = utf8Decoder.decode(buffer)
    if (utf8Text.includes('\uFFFD')) {
      const latin1Decoder = new TextDecoder('iso-8859-1')
      return latin1Decoder.decode(buffer)
    }
    return utf8Text
  }

  const handleProcessFile = async (file: File) => {
    setIsLoading(true)
    setErrorMsg(null)
    setSummary(null)
    setParsedClients([])

    try {
      const rawText = await decodeFileText(file)
      const parsed = parseSswClientReport(rawText)

      if (parsed.validClients.length === 0) {
        setErrorMsg('Nenhum cadastro de cliente válido foi encontrado no arquivo.')
        setIsLoading(false)
        return
      }

      setParsedClients(parsed.validClients)

      // Por padrão, pré-seleciona os que são sugeridos como Remetentes (ou ambos)
      const defaultSelected = new Set<number>()
      parsed.validClients.forEach((client, idx) => {
        if (client.suggestedRole === 'sender' || client.suggestedRole === 'both') {
          defaultSelected.add(idx)
        }
      })

      // Se nenhum tiver o perfil específico, seleciona todos
      if (defaultSelected.size === 0) {
        setFilterOnlySenders(false)
        parsed.validClients.forEach((_, idx) => defaultSelected.add(idx))
      } else {
        setFilterOnlySenders(true)
      }

      setSelectedIndices(defaultSelected)
    } catch (err: any) {
      console.error('Erro ao analisar arquivo SSW:', err)
      setErrorMsg(err.message || 'Falha ao processar arquivo SSW.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExecuteImport = async () => {
    const itemsToImport = parsedClients.filter((_, idx) => selectedIndices.has(idx))
    if (itemsToImport.length === 0) {
      setErrorMsg('Nenhum remetente selecionado para importação.')
      return
    }

    setIsImporting(true)
    setErrorMsg(null)

    try {
      const res = await importSswSendersAction(itemsToImport, selectedCompanyId)
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao importar remetentes.')
        return
      }

      setSummary(res)
      setParsedClients([])
      if (onSendersImported) {
        onSendersImported()
      }
      router.refresh()
    } catch (err: any) {
      console.error('Erro ao salvar remetentes:', err)
      setErrorMsg(err.message || 'Erro inesperado na gravação dos remetentes.')
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0])
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleClose = () => {
    setIsOpen(false)
    setErrorMsg(null)
    setSummary(null)
    setParsedClients([])
    setSearchTerm('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Clientes filtrados na lista de preview
  const displayedClients = parsedClients.map((client, idx) => ({ client, originalIndex: idx })).filter(({ client }) => {
    if (filterOnlySenders && client.suggestedRole !== 'sender' && client.suggestedRole !== 'both') {
      return false
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matchName = client.name.toLowerCase().includes(term)
      const matchCnpj = client.cnpj.includes(term.replace(/\D/g, ''))
      const matchCity = client.city.toLowerCase().includes(term)
      return matchName || matchCnpj || matchCity
    }
    return true
  })

  const toggleSelectAllDisplayed = () => {
    const next = new Set(selectedIndices)
    const allDisplayedSelected = displayedClients.every(({ originalIndex }) => next.has(originalIndex))

    if (allDisplayedSelected) {
      displayedClients.forEach(({ originalIndex }) => next.delete(originalIndex))
    } else {
      displayedClients.forEach(({ originalIndex }) => next.add(originalIndex))
    }
    setSelectedIndices(next)
  }

  const toggleSelectIndex = (idx: number) => {
    const next = new Set(selectedIndices)
    if (next.has(idx)) {
      next.delete(idx)
    } else {
      next.add(idx)
    }
    setSelectedIndices(next)
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        className="border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0F766E] hover:bg-[#0D9488]/20 hover:text-[#115E59] font-medium shadow-sm transition-all"
      >
        <FileSpreadsheet className="h-4 w-4 mr-2 text-[#0D9488]" />
        Importar SSW (Clientes)
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white border border-[#E7E5E4] shadow-2xl rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7E5E4] bg-[#FAFAF9]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#0D9488]/10 text-[#0D9488] rounded-xl border border-[#0D9488]/20">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#1C1917] tracking-tight">
                    Importação de Remetentes (Relatório SSW)
                  </h2>
                  <p className="text-xs text-[#78716C]">
                    Extraia embarcadores e indústrias a partir da "Relação de Clientes" do SSW (.csv, .sswweb, .txt).
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 text-[#78716C] hover:text-[#1C1917] rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Resumo Final de Sucesso */}
              {summary && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-sm">Importação concluída com sucesso!</h4>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        A base de Remetentes foi sincronizada conforme os registros selecionados.
                      </p>
                    </div>
                  </div>

                  {/* Cards de Métricas */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60">
                      <div className="text-xs font-medium text-emerald-800">Novos Criados</div>
                      <div className="text-2xl font-bold text-emerald-700 mt-1">{summary.createdCount}</div>
                    </div>
                    <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60">
                      <div className="text-xs font-medium text-blue-800">Atualizados</div>
                      <div className="text-2xl font-bold text-blue-700 mt-1">{summary.updatedCount}</div>
                    </div>
                    <div className="p-3.5 rounded-xl border border-[#E7E5E4] bg-[#F5F5F4]">
                      <div className="text-xs font-medium text-[#78716C]">Já Iguais (Ignorados)</div>
                      <div className="text-2xl font-bold text-[#44403C] mt-1">{summary.unchangedCount}</div>
                    </div>
                  </div>

                  {/* Lista de Detalhes Alterados */}
                  {summary.changedDetails.length > 0 && (
                    <div className="border border-[#E7E5E4] rounded-xl overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => setShowDetailsList(!showDetailsList)}
                        className="w-full px-4 py-2.5 bg-[#FAFAF9] border-b border-[#E7E5E4] flex items-center justify-between text-xs font-semibold text-[#44403C] hover:bg-[#F5F5F4] transition-colors"
                      >
                        <span>
                          Detalhes das alterações ({summary.changedDetails.length} registros)
                        </span>
                        <span className="text-[#0D9488] text-[11px]">
                          {showDetailsList ? 'Ocultar ▲' : 'Exibir ▼'}
                        </span>
                      </button>

                      {showDetailsList && (
                        <div className="max-h-60 overflow-y-auto divide-y divide-[#F5F5F4]">
                          {summary.changedDetails.map((item, idx) => (
                            <div key={idx} className="p-3 text-xs flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <p className="font-medium text-[#1C1917] truncate">{item.name}</p>
                                <p className="text-[11px] text-[#78716C]">{item.cnpj} • {item.city}</p>
                              </div>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                  item.status === 'criado'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {item.status === 'criado' ? 'Novo' : 'Atualizado'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleClose}
                      className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
                    >
                      Concluir
                    </Button>
                  </div>
                </div>
              )}

              {/* Erros */}
              {errorMsg && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div className="text-xs leading-relaxed">{errorMsg}</div>
                </div>
              )}

              {/* Dropzone (Quando ainda não há preview nem resumo) */}
              {!summary && parsedClients.length === 0 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-[#0D9488]/20 bg-[#0D9488]/5 text-xs text-[#0F766E] space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Info className="h-4 w-4" />
                      Como extrair a Relação de Clientes no SSW:
                    </div>
                    <p className="text-[#134E4A] leading-relaxed">
                      No SSW, acesse o relatório de Clientes e exporte no formato <strong>Excel/CSV</strong> com delimitador ponto-e-vírgula.
                      O sistema identificará automaticamente as empresas com perfil de <strong>Remetente/Embarcador</strong> (pontos de coleta, indústrias e Curva ABC comercial).
                    </p>
                  </div>

                  {companies.length > 1 && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-medium text-[#44403C]">Empresa vinculada:</label>
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        className="text-xs border border-[#E7E5E4] rounded-lg px-2.5 py-1.5 bg-white text-[#1C1917]"
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                      isDragging
                        ? 'border-[#0D9488] bg-[#0D9488]/10'
                        : 'border-[#D6D3D1] hover:border-[#0D9488]/50 hover:bg-[#FAFAF9]'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.sswweb,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="p-3.5 bg-[#0D9488]/10 text-[#0D9488] rounded-2xl">
                      {isLoading ? (
                        <Loader2 className="h-7 w-7 animate-spin" />
                      ) : (
                        <UploadCloud className="h-7 w-7" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-[#1C1917]">
                        {isLoading ? 'Lendo e analisando arquivo...' : 'Clique para selecionar ou arraste o arquivo SSW aqui'}
                      </p>
                      <p className="text-xs text-[#78716C] mt-1">
                        Formatos suportados: .csv, .sswweb, .txt (Relação de Clientes SSW)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview dos Registros para Seleção */}
              {!summary && parsedClients.length > 0 && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  {/* Barra de Filtros e Busca */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1C1917]">
                        <input
                          type="checkbox"
                          checked={filterOnlySenders}
                          onChange={(e) => setFilterOnlySenders(e.target.checked)}
                          className="h-4 w-4 rounded border-[#D6D3D1] text-[#0D9488] focus:ring-[#0D9488]"
                        />
                        <Filter className="h-3.5 w-3.5 text-[#0D9488]" />
                        Filtrar perfil Remetente (Indústrias/Embarcadores)
                      </label>
                      <span className="text-[11px] text-[#78716C] bg-white px-2 py-0.5 rounded border border-[#E7E5E4]">
                        {displayedClients.length} de {parsedClients.length}
                      </span>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-[#78716C]" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nome, CNPJ ou cidade..."
                        className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[#E7E5E4] bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                      />
                    </div>
                  </div>

                  {/* Tabela de Preview */}
                  <div className="border border-[#E7E5E4] rounded-xl overflow-hidden bg-white">
                    <div className="px-4 py-2.5 bg-[#F5F5F4] border-b border-[#E7E5E4] flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 font-semibold text-[#44403C] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            displayedClients.length > 0 &&
                            displayedClients.every(({ originalIndex }) => selectedIndices.has(originalIndex))
                          }
                          onChange={toggleSelectAllDisplayed}
                          className="h-4 w-4 rounded border-[#D6D3D1] text-[#0D9488] focus:ring-[#0D9488]"
                        />
                        Selecionar Todos ({selectedIndices.size} selecionados)
                      </label>
                      <span className="text-[11px] text-[#78716C]">
                        Franquia padrão: 5h | Estadia: R$ 65,00/h
                      </span>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-[#F5F5F4]">
                      {displayedClients.map(({ client, originalIndex }) => {
                        const isChecked = selectedIndices.has(originalIndex)
                        return (
                          <div
                            key={originalIndex}
                            onClick={() => toggleSelectIndex(originalIndex)}
                            className={`p-3 text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                              isChecked ? 'bg-[#0D9488]/5 hover:bg-[#0D9488]/10' : 'hover:bg-[#FAFAF9]'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // controlado pelo clique na linha
                                className="h-4 w-4 rounded border-[#D6D3D1] text-[#0D9488] focus:ring-[#0D9488]"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-[#1C1917] truncate">{client.name}</p>
                                  {client.curvaAbc && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                                      ABC: {client.curvaAbc}
                                    </span>
                                  )}
                                  {client.hasColeta && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-teal-100 text-teal-800 rounded font-medium">
                                      Coleta Ativa
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#78716C] truncate mt-0.5">
                                  {client.formattedCnpj} • {client.city} • {client.address || 'Sem endereço'}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[11px] text-[#57534E]">
                                {client.phone || client.email || 'Sem contato'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {displayedClients.length === 0 && (
                        <div className="p-8 text-center text-xs text-[#78716C]">
                          Nenhum cliente encontrado com os filtros atuais.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rodapé de Ações */}
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setParsedClients([])}
                      className="text-xs text-[#78716C]"
                    >
                      Carregar outro arquivo
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" onClick={handleClose} className="text-xs">
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleExecuteImport}
                        disabled={selectedIndices.size === 0 || isImporting}
                        className="bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs px-5 shadow-sm font-semibold"
                      >
                        {isImporting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Importando...
                          </>
                        ) : (
                          `Importar ${selectedIndices.size} Remetente(s)`
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

