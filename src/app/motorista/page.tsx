'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, Truck, Lock, AlertCircle, ArrowRight, Phone, Eye, EyeOff } from 'lucide-react'
import { findActiveTripForDriver } from '@/app/actions'

export default function MotoristaRescuePage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSearchTrip = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    startTransition(async () => {
      const res = await findActiveTripForDriver(identifier, pin)
      if (res.error) {
        setError(res.error)
      } else if (res.token) {
        router.push(`/v/${res.token}`)
      }
    })
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <div className="w-12 h-12 rounded-[12px] bg-[#0D9488] flex items-center justify-center text-white shadow-lg shadow-teal-600/20">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-serif-title text-2xl font-bold text-[#1C1917]">
              Portal do Motorista
            </h1>
            <p className="text-xs text-[#78716C] mt-0.5">
              Perdeu o link do WhatsApp? Localize seu transporte em andamento
            </p>
          </div>
        </div>

        {/* Card de Busca */}
        <Card className="border border-[#E7E5E4] shadow-xl bg-white overflow-hidden rounded-[10px]">
          <div className="h-1.5 bg-[#0D9488] w-full" />
          <CardHeader className="pt-6 pb-4">
            <CardTitle className="text-base font-bold text-[#1C1917]">
              Acessar Viagem Ativa
            </CardTitle>
            <CardDescription className="text-xs text-[#78716C]">
              Informe seu telefone ou CPF e o PIN de 4 dígitos cadastrado na central.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSearchTrip} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="id" className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#0D9488]" /> Telefone com DDD ou CPF
                </Label>
                <Input
                  id="id"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Ex: 11999998888 ou 123.456.789-00"
                  required
                  className="h-11 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pin" className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#0D9488]" /> PIN de 4 dígitos
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="text-[11px] text-[#78716C] hover:text-[#0D9488] flex items-center gap-1 font-medium transition-colors"
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPin ? 'Ocultar' : 'Exibir'}</span>
                  </button>
                </div>
                <Input
                  id="pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="****"
                  required
                  className="h-12 text-center text-2xl tracking-[0.8em] font-mono font-bold"
                />
              </div>

              <Button
                type="submit"
                disabled={isPending || pin.length !== 4 || !identifier}
                className="w-full h-11 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-[6px] flex items-center justify-center gap-2 shadow-sm transition-all mt-2"
              >
                {isPending ? (
                  <span>Buscando Transporte...</span>
                ) : (
                  <>
                    <span>Localizar Minha Viagem</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Rodapé */}
        <div className="text-center text-[11px] text-[#A8A29E] font-mono">
          <p>AuditCargo • Telemetria de Portaria & Auditoria</p>
        </div>
      </div>
    </div>
  )
}
