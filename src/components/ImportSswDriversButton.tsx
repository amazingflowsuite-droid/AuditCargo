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
  Phone,
  Lock,
  X,
  Loader2,
  Info,
  ShieldCheck,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { importSswDriversAction, SswDriverImportDetail } from '@/app/actions'
import { BlockedSswDriverInfo, parseSsw047DriversReport } from '@/utils/ssw/driver-report-parser'

interface ImportSummaryState {
  totalRecords: number
  validMobileCount: number
  ignoredEmptyPhone: number
  ignoredLandlineOrInvalid: number
  ignoredBlockedCount: number
  blockedDrivers: BlockedSswDriverInfo[]
  unchangedCount: number
  createdCount: number
  updatedCount: number
  changedDetails: SswDriverImportDetail[]
}

export function ImportSswDriversButton({
  companies = [],
  onDriversImported,
}: {
  companies?: any[]
  onDriversImported?: (payload: { createdDrivers: any[]; updatedDrivers: any[] }) => void
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isMatricialWarning, setIsMatricialWarning] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id || '')
  const [summary, setSummary] = useState<ImportSummaryState | null>(null)
  const [showBlockedList, setShowBlockedList] = useState(false)

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
    setIsMatricialWarning(false)
    setSummary(null)
    setShowBlockedList(false)

    try {
      const rawText = await decodeFileText(file)
      const parsed = parseSsw047DriversReport(rawText)

      if (parsed.isMatricialFormat) {
        setIsMatricialWarning(true)
        setErrorMsg(
          'Você selecionou o relatório no formato Matricial (Impressão). Nesse formato, o SSW exporta apenas o Telefone Residencial (fixo), oculta o Celular/WhatsApp e corta o nome dos motoristas em 30 letras.'
        )
        return
      }

      if (!parsed.isValidReport || parsed.totalRecords === 0) {
        setErrorMsg(
          'O arquivo selecionado não possui o layout CSV/Excel esperado do relatório "047 - Relação de Motoristas" do SSW (iniciado por "0;CPF;Nome;...").'
        )
        return
      }

      const res = await importSswDriversAction(parsed, selectedCompanyId)

      if (!res.success) {
        setErrorMsg(res.error || 'Falha ao processar a importação de motoristas.')
        return
      }

      setSummary({
        totalRecords: res.totalRecords ?? parsed.totalRecords,
        validMobileCount: res.validMobileCount ?? parsed.validMobileDrivers.length,
        ignoredEmptyPhone: res.ignoredEmptyPhone ?? parsed.ignoredEmptyPhone,
        ignoredLandlineOrInvalid: res.ignoredLandlineOrInvalid ?? parsed.ignoredLandlineOrInvalid,
        ignoredBlockedCount: res.ignoredBlockedCount ?? parsed.ignoredBlockedCount,
        blockedDrivers: res.blockedDrivers ?? parsed.blockedDrivers,
        unchangedCount: res.unchangedCount ?? 0,
        createdCount: res.createdCount ?? 0,
        updatedCount: res.updatedCount ?? 0,
        changedDetails: res.changedDetails ?? [],
      })

      if ((res.createdDrivers?.length || 0) > 0 || (res.updatedDrivers?.length || 0) > 0) {
        const companyObj = companies.find((c) => c.id === selectedCompanyId) || companies[0]
        const enrichedCreated = (res.createdDrivers || []).map((d) => ({
          ...d,
          companies: d.companies || companyObj,
        }))
        const enrichedUpdated = (res.updatedDrivers || []).map((d) => ({
          ...d,
          companies: d.companies || companyObj,
        }))
        const payload = {
          createdDrivers: enrichedCreated,
          updatedDrivers: enrichedUpdated,
        }
        onDriversImported?.(payload)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ssw-drivers-imported', { detail: payload }))
        }
        router.refresh()
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro inesperado ao ler o arquivo do SSW.')
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleProcessFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleProcessFile(file)
  }

  const handleClose = () => {
    if (isLoading) return
    setIsOpen(false)
    setErrorMsg(null)
    setIsMatricialWarning(false)
    setSummary(null)
    setShowBlockedList(false)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-2 h-10 px-4 border-stone-300 hover:border-[#0D9488] bg-white text-stone-800 shadow-2xs hover:bg-[#F0FDFA]/60 transition-colors"
        title="Importar Relatório 047 - Relação de Motoristas (formato Excel/CSV .sswweb ou .csv) do SSW"
      >
        <FileSpreadsheet className="w-4 h-4 text-[#0D9488]" />
        <span className="font-semibold text-xs sm:text-sm">Importar SSW (047)</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-[12px] border border-stone-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabeçalho do Modal */}
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 text-[#0D9488] rounded-[8px]">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 font-mono">
                    Importar Motoristas &bull; SSW Opção 047 (Excel / CSV)
                  </h3>
                  <p className="text-[11px] text-stone-500 font-mono">
                    Relação de Motoristas exportada em formato CSV (.sswweb, .csv ou .txt)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-md disabled:opacity-50"
                aria-label="Fechar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Aviso Informativo de Regras de Importação (Sempre visível para orientar o operador) */}
              <div className="p-3.5 rounded-[8px] bg-amber-50/90 border border-amber-200/90 text-amber-950 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Orientações Importantes de Importação (SSW 047)</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-900/90 leading-relaxed">
                  <li>
                    <strong>Exporte na opção Excel / CSV do SSW:</strong> Na tela <strong>047</strong> do SSW, gere o
                    arquivo na opção <strong>Excel (CSV)</strong> (mesmo que venha com extensão{' '}
                    <code className="bg-amber-100 px-1 rounded font-mono">.sswweb</code>). Não utilize a versão de
                    impressão matricial.
                  </li>
                  <li>
                    <strong>Apenas Celulares Válidos (WhatsApp):</strong> Motoristas sem celular ou apenas com{' '}
                    <strong>telefone fixo</strong> não serão importados.
                  </li>
                  <li>
                    <strong>Motoristas Bloqueados no SSW:</strong> Cadastros marcados com{' '}
                    <code className="bg-amber-100 px-1 rounded font-mono">Bloqueado = S</code> no SSW são ignorados e
                    listados separadamente no resumo final para sua conferência.
                  </li>
                  <li>
                    <strong>PIN Automático &amp; Reimportação:</strong> O PIN de 4 dígitos será os{' '}
                    <strong>4 últimos números do CPF</strong>. Em reimportações futuras, registros iguais são ignorados
                    e apenas <strong>novos</strong> ou <strong>atualizados</strong> são exibidos.
                  </li>
                </ul>
              </div>

              {companies.length > 1 && !summary && (
                <div className="space-y-1">
                  <label htmlFor="ssw_import_company" className="text-xs font-medium text-stone-700">
                    Empresa Vinculada para Novos Cadastros
                  </label>
                  <select
                    id="ssw_import_company"
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    disabled={isLoading}
                    className="flex h-9 w-full rounded-[6px] border border-stone-300 bg-white px-3 text-xs text-stone-900"
                  >
                    {companies.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".sswweb,.csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />

              {!summary ? (
                <Card className="p-4 border-2 border-dashed border-[#0D9488]/40 bg-[#F0FDFA]/40 hover:bg-[#F0FDFA]/70 transition-colors rounded-[10px]">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => !isLoading && fileInputRef.current?.click()}
                    className={`cursor-pointer text-center py-7 px-4 rounded-[8px] transition-all ${
                      isDragging ? 'bg-[#CCFBF1] border-2 border-[#0D9488]' : 'hover:bg-white/80'
                    }`}
                  >
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center gap-2.5 text-teal-800 py-3">
                        <Loader2 className="w-8 h-8 animate-spin text-[#0D9488]" />
                        <span className="text-sm font-semibold">
                          Processando Relatório 047 (CSV) do SSW...
                        </span>
                        <span className="text-[11px] text-stone-500 max-w-md">
                          Validando celulares para WhatsApp, verificando bloqueios cadastrais e sincronizando novos e
                          atualizados no banco de dados.
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="w-12 h-12 rounded-full bg-teal-100/80 text-[#0D9488] flex items-center justify-center mx-auto shadow-2xs">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-stone-900">
                            Selecione ou arraste o arquivo CSV do SSW (047 - Relação de Motoristas)
                          </h4>
                          <p className="text-xs text-stone-600 mt-1">
                            Aceita o arquivo <strong>.sswweb</strong>, <strong>.csv</strong> ou <strong>.txt</strong>{' '}
                            gerado na opção Excel do SSW &mdash;{' '}
                            <span className="text-[#0D9488] font-semibold underline">clique para escolher</span>
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 pt-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                          <span>CPF armazenado com máscara de proteção LGPD (***.000.000-**)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {errorMsg && (
                    <div
                      className={`mt-3 p-3.5 rounded-[8px] flex items-start justify-between gap-2.5 text-xs ${
                        isMatricialWarning
                          ? 'bg-amber-50 border border-amber-300 text-amber-950'
                          : 'bg-red-50 border border-red-200 text-red-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isMatricialWarning ? 'text-amber-600' : 'text-red-600'
                          }`}
                        />
                        <div className="space-y-1">
                          <strong className="block">
                            {isMatricialWarning
                              ? 'Formato de Impressão Matricial Detectado — Use a opção Excel/CSV do SSW'
                              : 'Não foi possível importar o arquivo'}
                          </strong>
                          <p
                            className={`text-[11px] leading-relaxed ${
                              isMatricialWarning ? 'text-amber-900' : 'text-red-700'
                            }`}
                          >
                            {errorMsg}
                          </p>
                          {isMatricialWarning && (
                            <p className="text-[11px] font-semibold text-amber-950 pt-0.5">
                              👉 Como resolver: Acesse a opção 047 no SSW, escolha a saída em Excel / CSV e importe o
                              novo arquivo aqui para trazer os celulares reais dos motoristas.
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null)
                          setIsMatricialWarning(false)
                        }}
                        className={`text-xs font-bold uppercase shrink-0 ${
                          isMatricialWarning
                            ? 'text-amber-700 hover:text-amber-950'
                            : 'text-red-600 hover:text-red-800'
                        }`}
                      >
                        OK
                      </button>
                    </div>
                  )}
                </Card>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Banner de Conclusão */}
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-[8px] flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm text-emerald-900">
                          Importação SSW (047 - CSV) Concluída com Sucesso!
                        </h4>
                        <p className="text-xs text-emerald-800 mt-0.5">
                          De <strong>{summary.totalRecords.toLocaleString('pt-BR')}</strong> registros no arquivo,{' '}
                          <strong>{summary.createdCount.toLocaleString('pt-BR')}</strong> novo(s) motorista(s) foram
                          cadastrados e <strong>{summary.updatedCount.toLocaleString('pt-BR')}</strong> atualizado(s).
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* KPIs Resumo */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
                    <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-[8px]">
                      <span className="text-[10px] text-stone-500 block uppercase font-sans">
                        Total no Arquivo
                      </span>
                      <span className="text-base font-bold text-stone-800">
                        {summary.totalRecords.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-[8px]">
                      <span className="text-[10px] text-emerald-700 block uppercase font-sans font-semibold">
                        Novos Criados
                      </span>
                      <span className="text-base font-bold text-emerald-700">
                        +{summary.createdCount.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-[8px]">
                      <span className="text-[10px] text-teal-700 block uppercase font-sans font-semibold">
                        Atualizados
                      </span>
                      <span className="text-base font-bold text-teal-700">
                        {summary.updatedCount.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="p-2.5 bg-stone-100/80 border border-stone-200 rounded-[8px]">
                      <span className="text-[10px] text-stone-600 block uppercase font-sans">
                        Iguais (Ignorados)
                      </span>
                      <span className="text-base font-bold text-stone-700">
                        {summary.unchangedCount.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Explicação transparente dos registros filtrados/ignorados */}
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-[8px] text-[11px] text-stone-600 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-stone-700">Registros ignorados conforme critérios:</span>{' '}
                        <span>
                          <strong>{summary.ignoredEmptyPhone.toLocaleString('pt-BR')}</strong> sem celular
                        </span>{' '}
                        &bull;{' '}
                        <span>
                          <strong>{summary.ignoredLandlineOrInvalid.toLocaleString('pt-BR')}</strong> só fone fixo ou
                          inválido
                        </span>{' '}
                        &bull;{' '}
                        <span>
                          <strong>{summary.ignoredBlockedCount.toLocaleString('pt-BR')}</strong> bloqueados no SSW
                        </span>{' '}
                        &bull;{' '}
                        <span>
                          <strong>{summary.unchangedCount.toLocaleString('pt-BR')}</strong> já cadastrados sem
                          alteração
                        </span>
                      </div>
                    </div>

                    {/* Alerta específico quando houver motoristas com Bloqueado = S para o usuário não achar que sumiram */}
                    {summary.ignoredBlockedCount > 0 && (
                      <div className="p-2.5 rounded-[6px] bg-amber-50 border border-amber-200 text-amber-950 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              {summary.ignoredBlockedCount} motorista(s) não importado(s) por estarem com{' '}
                              <code className="font-mono bg-amber-100 px-1 rounded">Bloqueado = S</code> no SSW
                            </span>
                          </div>
                          {summary.blockedDrivers.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowBlockedList((prev) => !prev)}
                              className="text-[11px] font-semibold text-[#0F766E] hover:underline shrink-0"
                            >
                              {showBlockedList ? 'Ocultar nomes' : 'Ver quem está bloqueado'}
                            </button>
                          )}
                        </div>

                        {showBlockedList && summary.blockedDrivers.length > 0 && (
                          <div className="max-h-28 overflow-y-auto bg-white/90 border border-amber-200/80 rounded p-2 text-[11px] font-mono space-y-1">
                            {summary.blockedDrivers.map((b, i) => (
                              <div key={i} className="flex items-center justify-between text-stone-700">
                                <span className="truncate font-sans font-medium">{b.name}</span>
                                <span className="text-stone-500 shrink-0 ml-2">CPF: {b.maskedCpf} (Bloqueado SSW)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Lista exclusiva de Novos e Atualizados */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[11px] font-mono uppercase text-stone-500 font-bold">
                        Motoristas Novos e Atualizados ({summary.changedDetails.length.toLocaleString('pt-BR')}):
                      </h5>
                    </div>

                    {summary.changedDetails.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-stone-200 rounded-[8px] bg-stone-50/50">
                        <p className="text-xs font-semibold text-stone-700">
                          Nenhuma novidade ou alteração detectada neste arquivo.
                        </p>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          Todos os {summary.unchangedCount.toLocaleString('pt-BR')} motoristas ativos com celular
                          válido já estavam cadastrados com os mesmos dados.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-100 border border-stone-200 rounded-[8px] max-h-60 overflow-y-auto bg-white">
                        {summary.changedDetails.map((item, idx) => (
                          <div
                            key={`${item.maskedCpf}-${idx}`}
                            className="p-2.5 hover:bg-stone-50/80 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="truncate flex-1">
                              <div className="font-semibold text-stone-800 truncate">{item.name}</div>
                              <div className="text-[11px] text-stone-500 font-mono flex flex-wrap items-center gap-2 mt-0.5">
                                <span className="inline-flex items-center gap-1 text-stone-700">
                                  <Phone className="w-3 h-3 text-[#0D9488]" />
                                  {item.previousPhone ? (
                                    <>
                                      <span className="line-through text-stone-400">{item.previousPhone}</span>
                                      <span>&rarr; {item.phone}</span>
                                    </>
                                  ) : (
                                    item.phone
                                  )}
                                </span>
                                <span>&bull; CPF: {item.maskedCpf}</span>
                                <span className="inline-flex items-center gap-0.5 text-[#0F766E] font-semibold">
                                  <Lock className="w-2.5 h-2.5" /> PIN: {item.pin}
                                </span>
                              </div>
                            </div>

                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-[4px] font-mono uppercase font-semibold shrink-0 ${
                                item.status === 'criado'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-teal-100 text-teal-800'
                              }`}
                            >
                              {item.status === 'criado' ? 'Novo' : 'Atualizado'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rodapé de Ações */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSummary(null)
                        setErrorMsg(null)
                        setIsMatricialWarning(false)
                        setShowBlockedList(false)
                      }}
                      className="h-9 text-xs gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Importar Outro Arquivo
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleClose}
                      className="h-9 text-xs bg-[#0D9488] hover:bg-[#0F766E] text-white"
                    >
                      Concluir e Ver Motoristas
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
