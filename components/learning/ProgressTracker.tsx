import React from 'react';
import { LearningStep } from '../../constants';

const ProgressTracker: React.FC<{ currentStep: LearningStep, mode: 'general' | 'advanced' }> = ({ currentStep, mode }) => {
  const allSteps = Object.values(LearningStep);
  const steps = mode === 'general' ? allSteps.slice(0, 4) : allSteps.slice(4);
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex items-center justify-between mb-4 px-2">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${index <= currentIndex ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {index < currentIndex ? '✔' : index + 1}
            </div>
            <p className={`mt-2 text-[10px] sm:text-xs font-semibold ${index <= currentIndex ? 'text-blue-400' : 'text-slate-500'}`}>{step}</p>
          </div>
          {index < steps.length - 1 && <div className={`flex-1 h-1 mx-2 transition-colors duration-300 ${index < currentIndex ? 'bg-blue-600' : 'bg-slate-700'}`}></div>}
        </React.Fragment>
      ))}
    </div>
  );
};

export default ProgressTracker;
