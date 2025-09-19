import React, { useState, useEffect, useRef } from 'react';
import { LearningStep } from '../../constants';

interface StepControlProps {
  onStepSelect: (step: LearningStep) => void;
  currentStep: LearningStep;
  isLoading: boolean;
  mode: 'general' | 'advanced';
}

const StepControl: React.FC<StepControlProps> = ({ onStepSelect, currentStep, isLoading, mode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const allSteps = Object.values(LearningStep);
  const steps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (step: LearningStep) => {
    if (step !== currentStep) {
      onStepSelect(step);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>단계 이동</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in-fast">
          <ul className="py-1" role="menu">
            {steps.map(step => (
              <li key={step}>
                <button
                  onClick={() => handleSelect(step)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    step === currentStep 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-700'
                  }`}
                  role="menuitem"
                >
                  {step}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
       <style>{`
        @keyframes fade-in-fast {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-fast {
          animation: fade-in-fast 0.15s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default StepControl;
