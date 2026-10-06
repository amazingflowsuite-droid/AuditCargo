import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { getCurrentUser } from "@/utils/supabase/auth";

export const metadata: Metadata = {
  title: "AuditCargo - Gestão de Viagens e Auditoria de Estadias",
  description: "Plataforma de gestão de despachos, telemetria de portaria e apuração de estadias excedentes.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentUser();

  // Create a plain object to avoid serialization errors across the Client Boundary
  const safeUser = currentUser ? {
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    active: currentUser.active,
    is_super_admin: Boolean(currentUser.is_super_admin),
    organization_id: currentUser.organization_id,
    organization: currentUser.organization ? {
      id: currentUser.organization.id,
      name: currentUser.organization.name,
      cnpj: currentUser.organization.cnpj,
      slug: currentUser.organization.slug,
      logo_url: currentUser.organization.logo_url,
    } : null
  } : null;

  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full flex flex-col bg-[#FAFAF9] text-[#1C1917] antialiased">
        <Navbar currentUser={safeUser as any} />
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
