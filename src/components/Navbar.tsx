'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck, Truck, Building2, MapPin, PlusCircle, Compass, Mail } from "lucide-react"

export function Navbar() {
  const pathname = usePathname()

  const navItems = [
    { href: "/", label: "Painel", icon: Compass },
    { href: "/novo-transporte", label: "Novo Transporte", icon: PlusCircle },
    { href: "/motoristas", label: "Motoristas", icon: Truck },
    { href: "/remetentes", label: "Remetentes", icon: Building2 },
    { href: "/destinatarios", label: "Destinatários", icon: MapPin },
    { href: "/filiais", label: "Filiais", icon: MapPin },
    { href: "/empresas", label: "Empresas", icon: Building2 },
    { href: "/emails", label: "E-mails Cc", icon: Mail },
  ]

  return (
    <header className="bg-[#0F172A] text-[#FAFAF9] border-b border-[#1E293B] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-[6px] bg-[#0D9488] flex items-center justify-center text-white shadow-accent-glow">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif-title text-lg font-bold tracking-tight text-white group-hover:text-teal-200 transition-colors">
                  AuditCargo
                </span>
                <span className="text-[10px] text-[#A8A29E] tracking-wider uppercase font-mono -mt-1">
                  Controle & Estadias
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[6px] text-sm font-medium transition-all ${
                      isActive
                        ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                        : "text-[#E7E5E4] hover:bg-[#1E293B]/60 hover:text-white"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#0D9488]" : "text-[#A8A29E]"}`} />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-xs font-mono bg-[#1E293B] text-[#0D9488] border border-[#334155]">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse"></span>
              SaaS Ativo
            </span>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden border-t border-[#1E293B] px-2 py-2 flex items-center overflow-x-auto space-x-1 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs whitespace-nowrap ${
                isActive
                  ? "bg-[#1E293B] text-[#0D9488] font-semibold"
                  : "text-[#E7E5E4] hover:bg-[#1E293B]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </header>
  )
}
