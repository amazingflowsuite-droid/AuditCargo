'use client'

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ShieldCheck,
  Truck,
  Building2,
  MapPin,
  Compass,
  Mail,
  ChevronDown,
  Menu,
  X,
  Plus,
  Users,
  LogOut,
  Shield,
  User,
  Crown,
  TimerReset,
} from "lucide-react"
import { signOutAction } from "@/app/actions"
import type { UserProfile } from "@/utils/supabase/auth"

interface NavbarProps {
  currentUser?: UserProfile | null
}

export function Navbar({ currentUser }: NavbarProps) {
  const pathname = usePathname()
  const [cadastrosOpen, setCadastrosOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const isAdmin = currentUser?.role === 'admin'
  const isSuperAdmin = Boolean(currentUser?.is_super_admin)

  const cadastrosItems = [
    { href: "/motoristas", label: "Motoristas", icon: Truck },
    { href: "/remetentes", label: "Remetentes", icon: Building2 },
    { href: "/destinatarios", label: "Destinatários", icon: MapPin },
    { href: "/filiais", label: "Filiais", icon: MapPin },
    { href: "/emails", label: "E-mails Cc", icon: Mail },
  ]

  const isCadastroActive = cadastrosItems.some((item) => pathname === item.href)

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setCadastrosOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Fechar menus ao mudar de rota
  useEffect(() => {
    setCadastrosOpen(false)
    setUserMenuOpen(false)
    setMobileMenuOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await signOutAction()
    } catch (err) {
      console.error('Erro ao encerrar sessão no servidor:', err)
    } finally {
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';')
        for (const cookie of cookies) {
          const eqPos = cookie.indexOf('=')
          const name = (eqPos > -1 ? cookie.slice(0, eqPos) : cookie).trim()
          if (name.startsWith('sb-') || name.includes('supabase') || name.includes('auth')) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;`
          }
        }
      }
      if (typeof window !== 'undefined') {
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i)
            if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth'))) {
              localStorage.removeItem(key)
            }
          }
        } catch {}
        window.location.href = '/login'
      }
    }
  }

  // Oculta totalmente o menu na visão do motorista (/v/[token]), no resgate (/motorista) e no login (/login)
  if (pathname?.startsWith('/v/') || pathname === '/motorista' || pathname === '/login') {
    return null
  }

  return (
    <header className="bg-[#0F172A] text-[#FAFAF9] border-b border-[#1E293B] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* LADO ESQUERDO: Logo + Navegação Desktop */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              {currentUser?.organization?.logo_url ? (
                <div className="w-9 h-9 rounded-[6px] bg-white border border-[#334155] flex items-center justify-center overflow-hidden shrink-0 shadow-accent-glow">
                  <img src={currentUser.organization.logo_url} alt="Logo" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-[6px] bg-[#0D9488] flex items-center justify-center text-white shadow-accent-glow">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-serif-title text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-teal-200 transition-colors whitespace-nowrap">
                  AuditCargo
                </span>
                <span className="text-[10px] text-[#A8A29E] tracking-wider uppercase font-mono -mt-1 whitespace-nowrap">
                  {currentUser?.organization?.name || "Controle & Estadias"}
                </span>
              </div>
            </Link>

            {/* Divisor vertical sutil */}
            <div className="hidden md:block w-px h-6 bg-[#334155]/60" />

            {/* Menu Desktop */}
            <nav className="hidden md:flex items-center space-x-1.5">
              {/* Painel */}
              <Link
                href="/"
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${
                  pathname === "/"
                    ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                    : "text-[#E7E5E4] hover:bg-[#1E293B]/60 hover:text-white"
                }`}
              >
                <Compass className={`w-4 h-4 ${pathname === "/" ? "text-[#0D9488]" : "text-[#A8A29E]"}`} />
                Painel
              </Link>

              {isAdmin && (
                <Link
                  href="/estadias"
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${
                    pathname === "/estadias"
                      ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                      : "text-[#E7E5E4] hover:bg-[#1E293B]/60 hover:text-white"
                  }`}
                >
                  <TimerReset className={`w-4 h-4 ${pathname === "/estadias" ? "text-[#0D9488]" : "text-[#A8A29E]"}`} />
                  Estadias
                </Link>
              )}

              {/* Menu Dropdown: Cadastros */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setCadastrosOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${
                    isCadastroActive || cadastrosOpen
                      ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                      : "text-[#E7E5E4] hover:bg-[#1E293B]/60 hover:text-white"
                  }`}
                >
                  <Building2 className={`w-4 h-4 ${isCadastroActive ? "text-[#0D9488]" : "text-[#A8A29E]"}`} />
                  <span>Cadastros</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 text-[#94A3B8] ${
                      cadastrosOpen ? "rotate-180 text-[#0D9488]" : ""
                    }`}
                  />
                </button>

                {/* Popover / Dropdown Menu */}
                {cadastrosOpen && (
                  <div className="absolute left-0 mt-2 w-56 rounded-[8px] bg-[#0F172A] border border-[#334155] shadow-2xl py-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                    <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8] border-b border-[#1E293B] mb-1">
                      Gerenciamento Geral
                    </div>
                    {cadastrosItems.map((item) => {
                      const Icon = item.icon
                      const isActive = pathname === item.href
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setCadastrosOpen(false)}
                          className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                            isActive
                              ? "bg-[#1E293B] text-[#0D9488] font-bold"
                              : "text-[#E2E8F0] hover:bg-[#1E293B] hover:text-white"
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-[#0D9488]" : "text-[#94A3B8]"}`} />
                          <span className="whitespace-nowrap">{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Equipe / Usuários (Visível apenas para Administradores) */}
              {isAdmin && (
                <Link
                  href="/usuarios"
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${
                    pathname === "/usuarios"
                      ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                      : "text-[#E7E5E4] hover:bg-[#1E293B]/60 hover:text-white"
                  }`}
                >
                  <Users className={`w-4 h-4 ${pathname === "/usuarios" ? "text-[#0D9488]" : "text-[#A8A29E]"}`} />
                  Equipe
                </Link>
              )}

              {/* Painel Master (Exclusivo Super Admin) */}
              {isSuperAdmin && (
                <Link
                  href="/master"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-all whitespace-nowrap border ${
                    pathname === "/master"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs"
                      : "text-amber-300/90 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-200"
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  Painel Master
                </Link>
              )}
            </nav>
          </div>

          {/* LADO DIREITO: Botão Novo Transporte + Menu do Usuário */}
          <div className="flex items-center gap-3">
            {/* Botão Novo Transporte */}
            <Link href="/novo-transporte" className="hidden sm:inline-flex">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold shadow-sm transition-all whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Transporte
              </button>
            </Link>

            {/* Perfil & Logout Desktop */}
            {currentUser && (
              <div className="relative hidden md:block" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-[6px] hover:bg-[#1E293B] transition-colors border border-[#334155]/60 text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center text-[#0D9488]">
                    {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5 text-slate-300" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-white max-w-[120px] truncate">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] font-mono text-[#0D9488] -mt-0.5">
                      {isAdmin ? "Admin" : "Operador"}
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-[#94A3B8]" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-[8px] bg-[#0F172A] border border-[#334155] shadow-2xl py-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-[#1E293B]">
                      <p className="text-xs font-semibold text-white">{currentUser.name}</p>
                      <p className="text-[11px] text-[#94A3B8] font-mono truncate">{currentUser.email}</p>
                      <div className="mt-1.5 inline-block">
                        {isSuperAdmin ? (
                          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                            <Crown className="w-3 h-3 text-amber-400" /> Super Admin SaaS
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#1E293B] text-[#0D9488] border border-[#334155]">
                            {isAdmin ? "Administrador Matriz" : "Operador de Despacho"}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSuperAdmin && (
                      <Link
                        href="/master"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs text-amber-300 hover:bg-[#1E293B] hover:text-amber-200 transition-colors font-medium border-b border-[#1E293B]"
                      >
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                        <span>Painel Master (Tenants)</span>
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        href="/usuarios"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs text-[#E2E8F0] hover:bg-[#1E293B] hover:text-white transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-[#0D9488]" />
                        <span>Gerenciar Equipe</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-[#1E293B] hover:text-red-300 transition-colors text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{isLoggingOut ? "Saindo..." : "Sair do Sistema"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Botão Hambúrguer Mobile */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-[6px] text-[#CBD5E1] hover:text-white hover:bg-[#1E293B] focus:outline-none"
              aria-label="Abrir menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* MENU RESPONSIVO MOBILE */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#1E293B] bg-[#0F172A] px-4 py-3 space-y-3 shadow-2xl">
          {/* Card do Usuário Logado no Mobile */}
          {currentUser && (
            <div className="p-2.5 rounded-[6px] bg-[#1E293B] border border-[#334155] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#0F172A] flex items-center justify-center text-[#0D9488]">
                  {isAdmin ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{currentUser.name}</p>
                  <p className="text-[10px] text-[#0D9488] font-mono">
                    {isAdmin ? "Administrador" : "Operador"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-xs text-red-400 hover:text-red-300 p-1.5"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Botão Novo Transporte */}
          <Link
            href="/novo-transporte"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-[6px] bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Transporte
          </Link>

          {/* Links Principais */}
          <div className="space-y-1 pt-1">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-[6px] text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                  : "text-[#E2E8F0] hover:bg-[#1E293B]"
              }`}
            >
              <Compass className="w-4 h-4 text-[#0D9488]" />
              Painel de Controle
            </Link>

            {isAdmin && (
              <Link
                href="/estadias"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-[6px] text-sm font-medium transition-colors ${
                  pathname === "/estadias"
                    ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                    : "text-[#E2E8F0] hover:bg-[#1E293B]"
                }`}
              >
                <TimerReset className="w-4 h-4 text-[#0D9488]" />
                Apuração de Estadias
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/usuarios"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-[6px] text-sm font-medium transition-colors ${
                  pathname === "/usuarios"
                    ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                    : "text-[#E2E8F0] hover:bg-[#1E293B]"
                }`}
              >
                <Users className="w-4 h-4 text-[#0D9488]" />
                Gerenciar Equipe
              </Link>
            )}
            {isSuperAdmin && (
              <Link
                href="/master"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-[6px] text-sm font-medium transition-colors ${
                  pathname === "/master"
                    ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40"
                    : "text-amber-300/90 hover:bg-[#1E293B]"
                }`}
              >
                <Crown className="w-4 h-4 text-amber-400" />
                Painel Master (Tenants)
              </Link>
            )}
          </div>

          {/* Seção Cadastros */}
          <div className="pt-2 border-t border-[#1E293B]">
            <span className="px-3 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8] block mb-1.5">
              Cadastros Operacionais
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              {cadastrosItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-[6px] text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-[#1E293B] text-[#0D9488] font-bold"
                        : "text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-[#0D9488]" : "text-[#94A3B8]"}`} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
