import React from 'react';
import { LearningStep } from '../../constants';

interface StepSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (step: LearningStep) => void;
  currentStep: LearningStep;
  mode: 'general' | 'advanced';
}

const StepSelectionModal: React.FC<StepSelectionModalProps> = ({ isOpen, onClose, onSelect, currentStep, mode }) => {
  if (!isOpen) return null;
  
  const allSteps = Object.values(LearningStep);
  const steps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);

  const handleSelect = (step: LearningStep) => {
    onSelect(step);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="w-full max-w-xs bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-slate-100 text-center">단계 이동</h3>
        </div>
        <ul className="py-2">
          {steps.map(step => (
            <li key={step}>
              <button
                onClick={() => handleSelect(step)}
                className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                  step === currentStep 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {step}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default StepSelectionModal;
