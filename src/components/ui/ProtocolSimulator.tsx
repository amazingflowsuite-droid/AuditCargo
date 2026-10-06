'use client';

import React, { useState } from 'react';
import { Play, ShieldCheck, AlertTriangle, Send, RefreshCw, Sparkles, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { usePostum } from '@/context/postum-context';
import Link from 'next/link';

export const ProtocolSimulator: React.FC = () => {
  const { profile, simulateStateChange, resetDemoData } = usePostum();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-[#F5F5F4] border border-[#E7E5E4] rounded-lg overflow-hidden">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-[#EAE8E6] transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-[#0D9488] shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif font-bold text-sm sm:text-base text-[#1C1917]">
                Simulador Interativo do Protocolo Postum
              </h3>
              <span className="text-[10px] uppercase font-mono font-semibold bg-[#0D9488]/10 text-[#0D9488] px-2 py-0.5 rounded-full">
                Modo Demo
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#78716C]">
              {isExpanded
                ? 'Alterne entre os 4 estágios do ciclo de vida para testar a experiência em tempo real.'
                : 'Clique para expandir e simular estados do protocolo (Ativo, Carência, Aviso, Liberado).'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetDemoData();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-medium text-[#78716C] hover:text-[#1C1917] bg-white rounded border border-[#D6D3D1] transition-colors shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurar Demo
            </button>
          )}
          <button 
            type="button"
            className="p-1 text-[#78716C] hover:text-[#1C1917]"
            aria-label={isExpanded ? 'Recolher simulador' : 'Expandir simulador'}
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 sm:p-5 pt-0 border-t border-[#E7E5E4] mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
            {/* Stage 1 */}
            <button
              onClick={() => simulateStateChange('active')}
              className={`p-3 text-left rounded-md border text-xs transition-all flex flex-col justify-between ${
                profile.status === 'active'
                  ? 'bg-[#ECFDF5] border-[#A7F3D0] ring-1 ring-[#047857]'
                  : 'bg-white border-[#E7E5E4] hover:bg-[#FAFAF9]'
              }`}
            >
              <div className="flex items-center justify-between font-semibold text-[#047857] mb-1">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 shrink-0" /> 1. Estado Ativo
                </span>
                {profile.status === 'active' && <span className="text-[10px] uppercase font-mono bg-[#A7F3D0]/30 px-1.5 py-0.5 rounded">Atual</span>}
              </div>
              <p className="text-[11px] text-[#57534E] leading-snug">
                Check-in em dia. Próxima verificação em {profile.frequency.replace('_days', '')} dias.
              </p>
            </button>

            {/* Stage 2 */}
            <button
              onClick={() => simulateStateChange('grace_period')}
              className={`p-3 text-left rounded-md border text-xs transition-all flex flex-col justify-between ${
                profile.status === 'grace_period'
                  ? 'bg-[#FEF3C7] border-[#FDE68A] ring-1 ring-[#B45309]'
                  : 'bg-white border-[#E7E5E4] hover:bg-[#FAFAF9]'
              }`}
            >
              <div className="flex items-center justify-between font-semibold text-[#B45309] mb-1">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> 2. Carência
                </span>
                {profile.status === 'grace_period' && <span className="text-[10px] uppercase font-mono bg-[#FDE68A]/40 px-1.5 py-0.5 rounded">Atual</span>}
              </div>
              <p className="text-[11px] text-[#57534E] leading-snug">
                Check-in atrasado. Início das cobranças diárias por e-mail/WhatsApp.
              </p>
            </button>

            {/* Stage 3 */}
            <Link
              href="/cancel-release/demo-token-123"
              className="p-3 text-left rounded-md border text-xs transition-all bg-white border-[#E7E5E4] hover:bg-[#FEF2F2] hover:border-[#FECACA] group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between font-semibold text-[#DC2626] mb-1">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> 3. Carta de Aviso
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-[#78716C] group-hover:text-[#DC2626] shrink-0" />
              </div>
              <p className="text-[11px] text-[#57534E] leading-snug">
                72h para encerramento. Testar tela de Cancelamento Emergencial.
              </p>
            </Link>

            {/* Stage 4 */}
            <button
              onClick={() => simulateStateChange('released')}
              className={`p-3 text-left rounded-md border text-xs transition-all flex flex-col justify-between ${
                profile.status === 'released'
                  ? 'bg-[#FEF2F2] border-[#FECACA] ring-1 ring-[#B91C1C]'
                  : 'bg-white border-[#E7E5E4] hover:bg-[#FAFAF9]'
              }`}
            >
              <div className="flex items-center justify-between font-semibold text-[#B91C1C] mb-1">
                <span className="flex items-center gap-1">
                  <Send className="w-4 h-4 shrink-0" /> 4. Legado Liberado
                </span>
                {profile.status === 'released' && <span className="text-[10px] uppercase font-mono bg-[#FECACA]/40 px-1.5 py-0.5 rounded">Atual</span>}
              </div>
              <p className="text-[11px] text-[#57534E] leading-snug">
                Prazos encerrados sem resposta. Notificações enviadas aos familiares.
              </p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
