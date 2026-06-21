
import React from 'react';
import { ProjectState } from '../types';

interface PCBConstraintViewProps {
  state: ProjectState;
  setState: React.Dispatch<React.SetStateAction<ProjectState>>;
}

const PCBConstraintView: React.FC<PCBConstraintViewProps> = ({ state, setState }) => {
  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">PCB 布局约束</h2>
            <p className="text-sm text-slate-500">定义板框大小、层数以及物理制造约束</p>
          </div>
          <button 
            onClick={() => setState(p => ({ ...p, currentStep: 3 }))}
            className="px-8 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center gap-2"
          >
            <span>保存并进入布局</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 flex flex-col items-center justify-center aspect-square relative">
            <div 
              className="bg-green-900/10 border-4 border-green-600 rounded-sm relative transition-all duration-300 flex items-center justify-center group"
              style={{ width: `${state.pcbConstraints.width * 2}px`, height: `${state.pcbConstraints.height * 2}px` }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-green-600 uppercase">Width: {state.pcbConstraints.width}mm</div>
              <div className="absolute top-1/2 -right-16 -translate-y-1/2 rotate-90 text-[10px] font-bold text-green-600 uppercase">Height: {state.pcbConstraints.height}mm</div>
              
              <div className="text-center group-hover:scale-110 transition-transform cursor-pointer">
                <div className="text-2xl">📐</div>
                <div className="text-[8px] text-green-600 font-bold opacity-40">PCB OUTLINE</div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">物理参数设置</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">板框宽度 (mm)</label>
                  <input 
                    type="number" 
                    value={state.pcbConstraints.width}
                    onChange={(e) => setState(p => ({...p, pcbConstraints: {...p.pcbConstraints, width: +e.target.value}}))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-green-500/20 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">板框高度 (mm)</label>
                  <input 
                    type="number" 
                    value={state.pcbConstraints.height}
                    onChange={(e) => setState(p => ({...p, pcbConstraints: {...p.pcbConstraints, height: +e.target.value}}))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-green-500/20 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">堆叠层数 (Layers)</label>
                <div className="flex gap-2">
                  {[2, 4, 6].map(l => (
                    <button 
                      key={l}
                      onClick={() => setState(p => ({...p, pcbConstraints: {...p.pcbConstraints, layers: l}}))}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${state.pcbConstraints.layers === l ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                    >
                      {l} Layers
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">板厚 (Thickness)</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 outline-none"
                  value={state.pcbConstraints.thickness}
                  onChange={(e) => setState(p => ({...p, pcbConstraints: {...p.pcbConstraints, thickness: +e.target.value}}))}
                >
                  <option value={0.8}>0.8 mm</option>
                  <option value={1.0}>1.0 mm</option>
                  <option value={1.2}>1.2 mm</option>
                  <option value={1.6}>1.6 mm (Standard)</option>
                  <option value={2.0}>2.0 mm</option>
                </select>
              </div>
            </div>

            <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center text-xs">AI</div>
                <div className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Layout Recommendation</div>
              </div>
              <p className="text-[11px] text-blue-600 leading-relaxed">
                根据组件清单，建议使用 4 层板以优化信号完整性。DXF 板框检测到 4 个 M3 固定孔，已自动同步到 PCB 约束中。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PCBConstraintView;
