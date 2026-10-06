'use client'

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ShieldCheck,
  Truck,
  Building2,
  MapPin,
  PlusCircle,
  Compass,
  Mail,
  ChevronDown,
  Menu,
  X,
  Plus,
} from "lucide-react"

export function Navbar() {
  const pathname = usePathname()
  const [cadastrosOpen, setCadastrosOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Oculta totalmente o menu na visão do motorista (/v/[token])
  if (pathname?.startsWith('/v/')) {
    return null
  }

  const cadastrosItems = [
    { href: "/motoristas", label: "Motoristas", icon: Truck },
    { href: "/remetentes", label: "Remetentes", icon: Building2 },
    { href: "/destinatarios", label: "Destinatários", icon: MapPin },
    { href: "/filiais", label: "Filiais", icon: MapPin },
    { href: "/empresas", label: "Empresas", icon: Building2 },
    { href: "/emails", label: "E-mails Cc", icon: Mail },
  ]

  const isCadastroActive = cadastrosItems.some((item) => pathname === item.href)

  // Fechar dropdown de cadastros ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setCadastrosOpen(false)
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
    setMobileMenuOpen(false)
  }, [pathname])

  return (
    <header className="bg-[#0F172A] text-[#FAFAF9] border-b border-[#1E293B] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* LADO ESQUERDO: Logo + Navegação Desktop */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="w-9 h-9 rounded-[6px] bg-[#0D9488] flex items-center justify-center text-white shadow-accent-glow">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif-title text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-teal-200 transition-colors whitespace-nowrap">
                  AuditCargo
                </span>
                <span className="text-[10px] text-[#A8A29E] tracking-wider uppercase font-mono -mt-1 whitespace-nowrap">
                  Controle & Estadias
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
            </nav>
          </div>

          {/* LADO DIREITO: Botão Novo Transporte + SaaS Status + Hamburger Mobile */}
          <div className="flex items-center gap-3">
            {/* Botão Novo Transporte em Destaque (Desktop) */}
            <Link href="/novo-transporte" className="hidden sm:inline-flex">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold shadow-sm transition-all whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Transporte
              </button>
            </Link>

            {/* Badge SaaS Ativo */}
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-mono bg-[#1E293B] text-[#0D9488] border border-[#334155] whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse"></span>
              SaaS Ativo
            </span>

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
          {/* Botão Novo Transporte no Topo do Menu Mobile */}
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                  : "text-[#E2E8F0] hover:bg-[#1E293B]"
              }`}
            >
              <Compass className="w-4 h-4 text-[#0D9488]" />
              Painel de Controle
            </Link>
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

          {/* Rodapé Mobile */}
          <div className="pt-2 border-t border-[#1E293B] flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
            <span>AuditCargo v2.0</span>
            <span className="inline-flex items-center gap-1.5 text-[#0D9488]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse"></span>
              SaaS Online
            </span>
          </div>
        </div>
      )}
    </header>
  )
}
