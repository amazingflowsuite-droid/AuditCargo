'use client';

import React, { useState } from 'react';
import { Heart, CheckCircle2 } from 'lucide-react';
import { usePostum } from '@/context/postum-context';

interface CheckinButtonProps {
  className?: string;
}

export const CheckinButton: React.FC<CheckinButtonProps> = ({ className = '' }) => {
  const { performCheckin, profile } = usePostum();
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  const handleClick = () => {
    performCheckin('web');
    setJustCheckedIn(true);
    setTimeout(() => {
      setJustCheckedIn(false);
    }, 4000);
  };

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleClick}
        disabled={justCheckedIn}
        className={`group relative inline-flex items-center justify-center gap-3 w-full sm:w-auto min-h-[52px] px-8 py-4 bg-[#0D9488] hover:bg-[#0F766E] text-white font-semibold text-base rounded-[8px] transition-all duration-200 shadow-accent-glow hover:shadow-lg focus-ring ${className} ${
          justCheckedIn ? 'bg-[#059669] hover:bg-[#059669]' : ''
        }`}
      >
        {justCheckedIn ? (
          <>
            <CheckCircle2 className="w-5 h-5 animate-bounce" />
            <span>Check-in Confirmado!</span>
          </>
        ) : (
          <>
            <Heart className="w-5 h-5 text-teal-100 group-hover:scale-110 transition-transform duration-200 fill-teal-100/20" />
            <span>Confirmar que estou bem</span>
          </>
        )}
      </button>
      <p className="mt-2 text-xs text-[#78716C]">
        {profile.status === 'grace_period' ? (
          <span className="text-[#D97706] font-medium animate-pulse">
            ⚠️ Período de carência ativo! Clique acima para cancelar o aviso prévio.
          </span>
        ) : (
          `Um clique renova a contagem de ${profile.frequency.replace('_days', '')} dias.`
        )}
      </p>
    </div>
  );
};
