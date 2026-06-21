
import React from 'react';

interface Step {
  label: string;
  icon: string;
}

interface WorkflowProgressProps {
  steps: Step[];
  currentStep: number;
  setStep: (idx: number) => void;
}

const WorkflowProgress: React.FC<WorkflowProgressProps> = ({ steps, currentStep, setStep }) => {
  return (
    <div className="bg-white border-b border-slate-200 h-14 flex items-center justify-center shrink-0">
      <div className="flex items-center gap-2">
        {steps.map((step, idx) => (
          <React.Fragment key={idx}>
            <button 
              onClick={() => setStep(idx)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all group ${currentStep === idx ? 'bg-green-50 text-green-700' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === idx ? 'bg-green-600 text-white shadow-sm' : 'bg-slate-100'}`}>
                {idx + 1}
              </span>
              <span className="text-sm font-medium">{step.label}</span>
            </button>
            {idx < steps.length - 1 && (
              <div className="w-8 h-[1px] bg-slate-200" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default WorkflowProgress;
