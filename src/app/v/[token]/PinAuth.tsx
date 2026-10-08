'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShieldCheck, Lock, Eye, EyeOff, AlertCircle } from "lucide-react"
import { verifyDriverPin } from "@/app/actions"

export function PinAuth({ token, driverName }: { token: string; driverName: string }) {
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await verifyDriverPin(token, pin)
    if (res.error) {
      setError(res.error)
      setPin('')
      setLoading(false)
    }
    // if success, server action handles revalidation
  }

  return (
    <div className="max-w-md mx-auto space-y-5 pb-12 mt-12 px-4">
      <div className="flex flex-col items-center justify-center text-center space-y-3 mb-8">
        <div className="w-12 h-12 rounded-[12px] bg-[#0D9488] flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-serif-title text-2xl font-bold text-[#1C1917]">AuditCargo</h1>
          <p className="text-sm text-[#78716C]">Acesso Restrito do Motorista</p>
        </div>
      </div>

      <Card className="border-t-4 border-t-[#0D9488] shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold">Confirme sua Identidade</CardTitle>
          <CardDescription>
            Olá, <strong>{driverName}</strong>! Por segurança, digite seu PIN de 4 dígitos para acessar os detalhes da viagem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-[6px] border border-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pin" className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                  <Lock className="w-4 h-4 text-[#0D9488]" /> PIN de 4 dígitos
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
                className="text-center text-2xl tracking-[1em] h-14 font-mono font-bold"
                required
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base bg-[#0D9488] hover:bg-[#0F766E]" disabled={loading || pin.length !== 4}>
              {loading ? 'Verificando...' : 'Acessar Viagem'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
