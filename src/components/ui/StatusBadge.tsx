import React from 'react';
import { UserStatus } from '@/lib/types';
import { ShieldCheck, AlertTriangle, Send, PauseCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: UserStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  let label = 'Ativo';
  let classes = 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]';
  let Icon = ShieldCheck;

  switch (status) {
    case 'active':
      label = 'Protocolo Ativo';
      classes = 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]';
      Icon = ShieldCheck;
      break;
    case 'grace_period':
      label = 'Período de Carência';
      classes = 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]';
      Icon = AlertTriangle;
      break;
    case 'released':
      label = 'Legado Liberado';
      classes = 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]';
      Icon = Send;
      break;
    case 'paused_payment':
      label = 'Pausado / Inadimplente';
      classes = 'bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]';
      Icon = PauseCircle;
      break;
  }

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-sm border ${paddingClass} ${classes}`}>
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      {label}
    </span>
  );
};
