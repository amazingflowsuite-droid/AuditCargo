'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { signInAction } from '@/app/actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const formData = new FormData()
    formData.append('email', email)
    formData.append('password', password)

    startTransition(async () => {
      const res = await signInAction(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        // Redirecionamento atômico direto, evitando cascata dupla de router.push + router.refresh
        window.location.href = '/'
      }
    })
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        {/* Logo & Headline */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <div className="w-12 h-12 rounded-[10px] bg-[#0D9488] flex items-center justify-center text-white shadow-lg shadow-teal-600/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-serif-title text-2xl sm:text-3xl font-bold text-[#1C1917] tracking-tight">
              AuditCargo
            </h1>
            <p className="text-xs font-mono uppercase tracking-widest text-[#78716C] mt-0.5">
              Plataforma de Gestão & Auditoria de Transportes
            </p>
          </div>
        </div>

        {/* Card de Login */}
        <Card className="border border-[#E7E5E4] shadow-xl bg-white overflow-hidden rounded-[10px]">
          <div className="h-1.5 bg-[#0D9488] w-full" />
          <CardHeader className="pt-6 pb-4">
            <CardTitle className="text-lg font-bold text-[#1C1917]">
              Acesso ao Sistema
            </CardTitle>
            <CardDescription className="text-xs text-[#78716C]">
              Entre com suas credenciais de Administrador ou Operador.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-700 flex items-start gap-2.5 animate-in fade-in-50">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#0D9488]" /> E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled={isPending}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@empresa.com.br"
                  required
                  autoComplete="email"
                  maxLength={150}
                  className="h-10 text-sm disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#0D9488]" /> Senha
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    disabled={isPending}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    maxLength={128}
                    className="h-10 text-sm pr-10 disabled:opacity-60 font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full h-11 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-semibold rounded-[6px] flex items-center justify-center gap-2 shadow-sm transition-all mt-2 disabled:opacity-75"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <ArrowRight className="w-4 h-4 text-[#0D9488]" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Rodapé do Login */}
        <div className="text-center text-[11px] text-[#A8A29E] font-mono space-y-1">
          <p>Motorista em trânsito? Acesse diretamente o link do WhatsApp com seu PIN.</p>
          <p className="opacity-75">Amazing Flow - AuditCargo SaaS v2.0 • Todos os direitos reservados</p>
        </div>
      </div>
    </div>
  )
}

