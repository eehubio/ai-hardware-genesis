
import React from 'react';
import { WorkflowMode } from '../types';

interface HeaderProps {
  projectName: string;
  mode: WorkflowMode;
  onModeToggle: (newMode?: WorkflowMode) => void;
}

const Header: React.FC<HeaderProps> = ({ projectName, mode, onModeToggle }) => {
  const handleExportProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mode === WorkflowMode.PROTOTYPE ? { projectName, mode, currentStep: 0 } : { projectName, mode, currentStep: 0 }));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${projectName.replace(/\s+/g, '_')}_export.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.removeChild(downloadAnchorNode);
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-50 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
        <span className="font-semibold text-slate-800">Seeed Genesis</span>
        <div className="h-4 w-[1px] bg-slate-200 mx-2" />
        <input 
          type="text" 
          defaultValue={projectName} 
          className="text-sm border-none focus:ring-0 text-slate-500 font-medium w-40"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => onModeToggle(WorkflowMode.PROTOTYPE)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${mode === WorkflowMode.PROTOTYPE ? 'bg-white shadow-sm text-green-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            原型设计
          </button>
          <button 
            onClick={() => onModeToggle(WorkflowMode.PCB)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${mode === WorkflowMode.PCB ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            PCB 工程
          </button>
        </div>
        
        <button 
          onClick={handleExportProject}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          导出项目
        </button>
      </div>
    </header>
  );
};

export default Header;
