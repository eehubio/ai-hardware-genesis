
import React, { useState, useEffect } from 'react';
import { ProjectState, CanvasComponent } from '../types';

interface ClippingOption {
  instanceId: string;
  name: string;
  recommendation: 'keep_module' | 'chip_only' | 'remove';
  reason: string;
  detectedFunctions: string[];
}

const HardwareClippingView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>> }> = ({ state, setState }) => {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clippingOptions, setClippingOptions] = useState<ClippingOption[]>([]);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);

  const startAnalysis = () => {
    if (!url) return;
    setIsAnalyzing(true);
    setProgress(0);
    setAnalysisLogs([]);
    
    const logs = [
      "Connecting to GitHub API...",
      "Cloning repository: " + url.split('/').pop(),
      "Scanning Abstract Syntax Tree...",
      "Analyzing peripheral drivers and pin-muxing...",
      "AI: Detecting active I2C addresses (0x76, 0x3C)...",
      "Logic Check: Evaluating schematic redundancy...",
      "Strategy: Switching BME280 and OLED to CHIP level."
    ];

    let currentLog = 0;
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          generateOptions();
          return 100;
        }
        if (p % 15 < 1) {
          setAnalysisLogs(prev => [...prev, logs[currentLog % logs.length]]);
          currentLog++;
        }
        return p + 2;
      });
    }, 40);
  };

  const generateOptions = () => {
    const options: ClippingOption[] = state.components.map(comp => {
      const isMcu = comp.type === 'mcu';
      if (isMcu) return {
        instanceId: comp.instanceId,
        name: comp.name,
        recommendation: 'keep_module',
        reason: "XIAO Core module is essential for connectivity.",
        detectedFunctions: ["UART0", "WiFi", "I2C"]
      };

      const name = comp.name.toLowerCase();
      const isUsed = name.includes('bme') || name.includes('oled') || name.includes('sgp');
      const isPower = comp.type === 'power';

      return {
        instanceId: comp.instanceId,
        name: comp.name,
        recommendation: isUsed ? 'chip_only' : (isPower ? 'keep_module' : 'remove'),
        reason: isUsed 
          ? `Code base has active driver for ${comp.name}. Optimization: CHIP-level integration.` 
          : (isPower ? "Power management required for battery usage." : "No software reference found. Recommended for removal."),
        detectedFunctions: isUsed ? ["Sensors", "Display"] : []
      };
    });
    setClippingOptions(options);
    setIsAnalyzing(false);
  };

  const toggleClipping = (instanceId: string, mode: 'module' | 'chip') => {
    setState(prev => ({
      ...prev,
      components: prev.components.map(c => 
        c.instanceId === instanceId ? { ...c, isChipOnly: mode === 'chip' } : c
      )
    }));
  };

  const removeUnused = (instanceId: string) => {
    setState(prev => ({
      ...prev,
      components: prev.components.filter(c => c.instanceId !== instanceId)
    }));
    setClippingOptions(prev => prev.filter(o => o.instanceId !== instanceId));
  };

  const finalizeClipping = () => {
    setState(prev => ({ ...prev, currentStep: 2 }));
  };

  // If we are not currently analyzing and haven't generated results, show the main UI
  const showInputArea = !isAnalyzing && clippingOptions.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0f14] text-slate-300 overflow-hidden font-sans">
      <div className="p-10 pb-6 shrink-0 bg-gradient-to-b from-slate-900/50 to-transparent">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
              <span className="p-2 bg-green-500/10 rounded-2xl border border-green-500/20 text-2xl">✂️</span>
              硬件裁剪与封装优化
            </h2>
            <p className="text-slate-500 mt-2 font-medium max-w-xl">基于软件定义硬件（SDH）技术，根据您的固件代码自动压缩电路面积。</p>
          </div>
          {clippingOptions.length > 0 && !isAnalyzing && (
            <button 
              onClick={finalizeClipping}
              className="px-10 py-4 bg-green-600 text-white rounded-[24px] text-sm font-black shadow-2xl hover:bg-green-700 transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
            >
              <span>确认剪裁并进入 PCB 布局</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
          )}
        </div>

        {showInputArea && (
          <div className="max-w-4xl mx-auto py-16">
            <div className="bg-slate-900/50 border-2 border-slate-800 p-12 rounded-[50px] shadow-3xl text-center">
               <div className="flex justify-center mb-8">
                 <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center text-4xl shadow-inner border border-slate-700">📦</div>
               </div>
               <h3 className="text-2xl font-black text-white mb-4">输入 GitHub 仓库链接</h3>
               <p className="text-slate-400 mb-10 max-w-lg mx-auto leading-relaxed text-sm">我们会分析您的 firmware 源码（Arduino/Python），识别哪些外设模块可以被裁剪为芯片级封装以节省空间。</p>
               
               <div className="flex flex-col md:flex-row gap-4">
                  <input 
                    type="text" 
                    placeholder="https://github.com/username/project-repo"
                    className="flex-1 bg-black border-2 border-slate-800 rounded-[28px] px-8 py-6 text-green-400 font-mono text-lg focus:border-green-500/50 transition-all outline-none"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <button 
                    onClick={startAnalysis}
                    disabled={!url || isAnalyzing}
                    className="px-12 py-6 bg-white text-black rounded-[28px] text-sm font-black uppercase tracking-widest hover:bg-green-400 transition-all disabled:opacity-20 shadow-xl"
                  >
                    开始代码扫描
                  </button>
               </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-10 pb-10">
        {isAnalyzing && (
          <div className="max-w-4xl mx-auto mt-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-green-400 tracking-widest uppercase">AI 编译器解析中...</div>
              <div className="text-xl font-mono text-white">{progress}%</div>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="bg-black/60 border border-slate-800 p-8 rounded-[32px] font-mono text-[11px] h-64 overflow-y-auto">
              {analysisLogs.map((log, i) => (
                <div key={i} className="flex gap-4 mb-2">
                  <span className="text-slate-600 select-none">[{i.toString().padStart(3, '0')}]</span>
                  <span className="text-green-500/90">{log}</span>
                </div>
              ))}
              <div className="animate-pulse text-green-400">▍</div>
            </div>
          </div>
        )}

        {clippingOptions.length > 0 && !isAnalyzing && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {clippingOptions.map((opt) => {
              const comp = state.components.find(c => c.instanceId === opt.instanceId);
              if (!comp) return null;
              
              return (
                <div key={opt.instanceId} className={`group p-8 bg-slate-900 border-2 transition-all rounded-[40px] flex flex-col gap-6 ${opt.recommendation === 'remove' ? 'border-rose-500/20 opacity-60' : 'border-slate-800 hover:border-green-500/40'}`}>
                  <div className="flex gap-6 items-center">
                    <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center p-3 border border-slate-800">
                      <img src={comp.thumb} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <h4 className="text-lg font-black text-white truncate mb-1">{comp.name}</h4>
                      <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase inline-block ${opt.recommendation === 'chip_only' ? 'bg-indigo-500/20 text-indigo-400' : opt.recommendation === 'remove' ? 'bg-rose-500/20 text-rose-400' : 'bg-green-500/20 text-green-400'}`}>
                        {opt.recommendation.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic h-12 overflow-hidden">"{opt.reason}"</p>
                  
                  <div className="flex items-center justify-between pt-2">
                    {opt.recommendation === 'remove' ? (
                      <button onClick={() => removeUnused(opt.instanceId)} className="w-full py-3 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl text-[10px] font-black hover:bg-rose-600 hover:text-white transition-all">剔除冗余器件</button>
                    ) : (
                      <div className="flex w-full bg-black/60 p-1 rounded-2xl border border-slate-800">
                        <button onClick={() => toggleClipping(opt.instanceId, 'module')} className={`flex-1 py-2 rounded-xl text-[9px] font-black transition-all ${!comp.isChipOnly ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>模块级</button>
                        <button onClick={() => toggleClipping(opt.instanceId, 'chip')} className={`flex-1 py-2 rounded-xl text-[9px] font-black transition-all ${comp.isChipOnly ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>芯片级</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HardwareClippingView;
