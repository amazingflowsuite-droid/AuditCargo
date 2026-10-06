'use client'

import { useState, useTransition, useRef } from 'react'
import { registerCheckin, registerCheckout, revertCheckin, revertCheckout } from "@/app/actions"
import {
  MapPin,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  Camera,
  Image as ImageIcon,
  X,
  Eye,
  Mail,
} from "lucide-react"

export function DriverActions({
  tripId,
  status,
  token,
  arrivalTime,
  completionTime,
  checkinPhotoUrl,
}: {
  tripId: string
  status: string
  token: string
  arrivalTime?: string | null
  completionTime?: string | null
  checkinPhotoUrl?: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [geoStatus, setGeoStatus] = useState<string>('')
  const [emailStatusMsg, setEmailStatusMsg] = useState<string | null>(null)
  const [showRevertConfirm, setShowRevertConfirm] = useState(false)

  // Foto comprobatória
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    }
  }

  const removePhoto = () => {
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCheckin = () => {
    setGeoStatus('Capturando GPS do local...')

    const doSubmit = (lat?: number, lng?: number) => {
      const formData = new FormData()
      if (selectedFile) {
        formData.append('photo', selectedFile)
      }

      startTransition(async () => {
        const res = await registerCheckin(tripId, formData, lat, lng)
        setGeoStatus('')
        if (res?.emailSent) {
          setEmailStatusMsg(
            res.simulated
              ? `E-mail de aviso enviado para ${res.recipientEmail} (Simulado)`
              : `E-mail de aviso de chegada enviado para ${res.recipientEmail}!`
          )
        }
      })
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoStatus('GPS capturado! Enviando comprovação...')
          doSubmit(position.coords.latitude, position.coords.longitude)
        },
        () => {
          setGeoStatus('GPS não autorizado. Enviando data e hora oficiais...')
          doSubmit()
        },
        { timeout: 8000 }
      )
    } else {
      doSubmit()
    }
  }

  const handleCheckout = () => {
    startTransition(async () => {
      await registerCheckout(tripId)
    })
  }

  const handleRevertCheckin = () => {
    startTransition(async () => {
      await revertCheckin(tripId)
      setShowRevertConfirm(false)
      removePhoto()
    })
  }

  const handleRevertCheckout = () => {
    startTransition(async () => {
      await revertCheckout(tripId)
      setShowRevertConfirm(false)
    })
  }

  // 1. Em Trânsito -> Foto da Portaria + Botão "Chegada no Destino"
  if (status === 'in_transit' || status === 'pending') {
    return (
      <div className="space-y-4 pt-2">
        {/* Upload da Foto Comprobatória */}
        <div className="p-4 rounded-[8px] bg-white border border-[#D6D3D1] space-y-3 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-50 text-[#0D9488] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#1C1917]">Foto Comprobatória da Portaria</h4>
              <p className="text-[11px] text-[#78716C]">
                Tire foto da guarita, guichê ou senha de espera para auditar o horário.
              </p>
            </div>
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handlePhotoSelect}
            className="hidden"
            id="cameraInput"
          />

          {!previewUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 border-2 border-dashed border-[#D6D3D1] hover:border-[#0D9488] rounded-[6px] bg-[#FAFAF9] hover:bg-teal-50/30 text-xs font-semibold text-[#0F172A] flex items-center justify-center gap-2 transition-colors"
            >
              <Camera className="w-4 h-4 text-[#0D9488]" />
              <span>Abrir Câmera / Anexar Foto</span>
            </button>
          ) : (
            <div className="relative rounded-[6px] overflow-hidden border border-[#A7F3D0] bg-[#ECFDF5] p-2 flex items-center gap-3">
              <img
                src={previewUrl}
                alt="Comprovante"
                className="w-16 h-16 object-cover rounded-[4px] border border-gray-200"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-[#059669] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Foto Pronta
                </span>
                <p className="text-[10px] text-[#57534E] truncate font-mono mt-0.5">
                  {selectedFile?.name || 'foto_portaria.jpg'}
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-[#0D9488] hover:underline font-semibold mt-1"
                >
                  Tirar outra foto
                </button>
              </div>

              <button
                type="button"
                onClick={removePhoto}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-white"
                title="Remover Foto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Botão de Chegada */}
        <button
          onClick={handleCheckin}
          disabled={isPending}
          className="w-full min-h-[58px] px-6 py-4 bg-[#0D9488] hover:bg-[#0F766E] active:scale-[0.99] text-white font-bold text-base rounded-[8px] transition-all duration-200 shadow-accent-glow flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <MapPin className="w-5 h-5 shrink-0" />
          <span>{isPending ? 'Gravando Comprovação...' : 'Chegada no Destino'}</span>
        </button>

        {geoStatus && (
          <p className="text-xs text-center text-[#0D9488] font-mono animate-pulse">
            {geoStatus}
          </p>
        )}

        <p className="text-[11px] text-center text-[#78716C] leading-relaxed">
          🔒 Ao confirmar a chegada, gravamos coordenadas de GPS, foto e enviamos aviso oficial por e-mail para o destinatário cadastrado (Lei 11.442/07).
        </p>
      </div>
    )
  }

  // 2. Chegou no Destino -> Foto registrada + Botão Finalizar Descarga + Opção de Desfazer
  if (status === 'arrived' || status === 'unloading') {
    return (
      <div className="space-y-4 pt-2">
        <div className="p-4 rounded-[8px] bg-[#CCFBF1]/40 border border-[#99F6E4] text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-[#0F766E] uppercase tracking-wider">
            <Clock className="w-4 h-4" /> Chegada Registrada
          </div>
          {arrivalTime && (
            <p className="text-xs font-semibold text-[#0F766E]">
              Horário: {new Date(arrivalTime).toLocaleTimeString('pt-BR')} ({new Date(arrivalTime).toLocaleDateString('pt-BR')})
            </p>
          )}

          {/* Confirmação do Envio do E-mail */}
          <div className="pt-1">
            <div className="p-2 rounded-[6px] bg-white/90 border border-[#99F6E4] text-[11px] text-[#0F766E] flex items-center justify-center gap-1.5 shadow-2xs">
              <Mail className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
              <span>
                {emailStatusMsg || 'Aviso de chegada disparado automaticamente para o e-mail do destinatário.'}
              </span>
            </div>
          </div>

          {/* Miniatura da foto se houver */}
          {checkinPhotoUrl && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewingPhoto(checkinPhotoUrl)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-white border border-[#99F6E4] text-xs text-[#0F766E] font-medium shadow-2xs hover:bg-[#F5F5F4]"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Ver Foto Comprobatória da Portaria</span>
              </button>
            </div>
          )}

          <p className="text-xs text-[#57534E] pt-1">
            Contagem de franquia em andamento. Ao concluir o descarregamento da carga, confirme abaixo:
          </p>
        </div>

        {/* Botão de Finalização da Descarga */}
        <button
          onClick={handleCheckout}
          disabled={isPending}
          className="w-full min-h-[54px] px-6 py-3.5 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.99] text-white font-semibold text-base rounded-[8px] transition-all duration-200 flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-50"
        >
          <CheckCircle2 className="w-5 h-5 text-[#0D9488]" />
          <span>{isPending ? 'Gravando Finalização...' : 'Finalização da Descarga'}</span>
        </button>

        {/* Botão para Reverter Ação (Caso tenha apertado sem querer) */}
        {!showRevertConfirm ? (
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setShowRevertConfirm(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[#78716C] hover:text-amber-700 transition-colors py-1 px-2 rounded-[4px] hover:bg-amber-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Apertei sem querer? Desfazer Chegada</span>
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-[6px] bg-amber-50 border border-amber-200 text-center space-y-2">
            <p className="text-xs text-amber-900 font-medium flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Deseja cancelar o registro de chegada e voltar para Em Trânsito?
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleRevertCheckin}
                disabled={isPending}
                className="px-3 py-1.5 rounded-[4px] bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
              >
                {isPending ? 'Revertendo...' : 'Sim, Desfazer Chegada'}
              </button>
              <button
                type="button"
                onClick={() => setShowRevertConfirm(false)}
                className="px-3 py-1.5 rounded-[4px] border border-gray-300 text-gray-700 text-xs hover:bg-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Modal de visualização da foto */}
        {viewingPhoto && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-[8px] max-w-sm w-full overflow-hidden shadow-floating">
              <div className="p-3 bg-[#0F172A] text-white flex items-center justify-between">
                <span className="text-xs font-semibold">Comprovante de Portaria</span>
                <button onClick={() => setViewingPhoto(null)} className="text-gray-300 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2">
                <img src={viewingPhoto} alt="Comprovante" className="w-full rounded-[4px] max-h-[70vh] object-contain" />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 3. Finalizado
  return (
    <div className="space-y-4 pt-2">
      <div className="p-6 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0] text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#059669] text-white flex items-center justify-center mx-auto shadow-sm">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <div>
          <h3 className="font-serif-title text-lg font-bold text-[#065F46]">Descarga Finalizada</h3>
          {completionTime && (
            <p className="text-xs font-mono text-[#047857] mt-1">
              Finalizada às {new Date(completionTime).toLocaleTimeString('pt-BR')} em {new Date(completionTime).toLocaleDateString('pt-BR')}
            </p>
          )}

          {checkinPhotoUrl && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewingPhoto(checkinPhotoUrl)}
                className="inline-flex items-center gap-1.5 text-xs text-[#047857] hover:underline font-medium"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Visualizar Foto da Portaria</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Opção de Desfazer Finalização */}
      {!showRevertConfirm ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowRevertConfirm(true)}
            className="inline-flex items-center gap-1.5 text-xs text-[#78716C] hover:text-amber-700 transition-colors py-1 px-2 rounded-[4px] hover:bg-amber-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Apertei sem querer? Desfazer Finalização</span>
          </button>
        </div>
      ) : (
        <div className="p-3 rounded-[6px] bg-amber-50 border border-amber-200 text-center space-y-2">
          <p className="text-xs text-amber-900 font-medium flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Deseja reabrir a viagem para continuar na etapa de descarga?
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleRevertCheckout}
              disabled={isPending}
              className="px-3 py-1.5 rounded-[4px] bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
            >
              {isPending ? 'Revertendo...' : 'Sim, Desfazer Finalização'}
            </button>
            <button
              type="button"
              onClick={() => setShowRevertConfirm(false)}
              className="px-3 py-1.5 rounded-[4px] border border-gray-300 text-gray-700 text-xs hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de visualização da foto */}
      {viewingPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[8px] max-w-sm w-full overflow-hidden shadow-floating">
            <div className="p-3 bg-[#0F172A] text-white flex items-center justify-between">
              <span className="text-xs font-semibold">Comprovante de Portaria</span>
              <button onClick={() => setViewingPhoto(null)} className="text-gray-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2">
              <img src={viewingPhoto} alt="Comprovante" className="w-full rounded-[4px] max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
