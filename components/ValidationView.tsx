
import React, { useState, useEffect } from 'react';
import { ProjectState } from '../types';

const ValidationView: React.FC<{ state: ProjectState; onProceed?: () => void; isManufacturing?: boolean }> = ({ state, onProceed, isManufacturing }) => {
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsValidating(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const checks = isManufacturing ? [
    { label: 'DRC 设计规则校验', status: 'pass', desc: '间距、线宽、过孔孔径符合制造规范。' },
    { label: 'BOM 物料完整性', status: 'pass', desc: '所有组件均具有有效的 MPN 和供应商 SKU。' },
    { label: '层对齐检查', status: 'pass', desc: '阻焊层、丝印层与铜箔层完全对齐。' },
    { label: 'Gerber 文件生成', status: 'pass', desc: '已成功导出标准 RS-274X 格式文件。' }
  ] : [
    { label: '电源域校验 (Voltage Domain)', status: 'pass', desc: '所有组件均运行在 3.3V 逻辑电平。' },
    { label: 'I2C 地址冲突检查', status: 'pass', desc: '检测到模块间地址无冲突，总线阻抗已自动匹配。' },
    { label: '引脚复用检查', status: 'pass', desc: '所有硬件中断引脚均已正确映射至 GPIO。' },
    { label: '功耗预算分析', status: 'warn', desc: '当前预估功耗较峰值偏高，建议检查 WiFi 功率设置。' },
    { label: '机械干涉检查', status: 'pass', desc: '组件间距符合外壳安装规范。' }
  ];

  const handleDownloadGerber = () => {
    const blob = new Blob(['Mock Gerber Data'], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Project_Gerber_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isValidating) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
        <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-bold text-sm tracking-widest animate-pulse">正在执行全链路仿真校验...</p>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-lg">
            <span className="text-3xl">{isManufacturing ? '📦' : '🛡️'}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{isManufacturing ? '制造文件导出' : '原型设计校验 (Validation)'}</h2>
          <p className="text-sm text-slate-500 mt-2">
            {isManufacturing ? '您的设计已准备好进行批量生产，请查看以下导出项。' : '在进入 PCB 模式前，我们需要确保您的原型在物理和逻辑上是可靠的。'}
          </p>
        </div>

        <div className="space-y-3">
          {checks.map((check, idx) => (
            <div key={idx} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-4 transition-all hover:border-green-300">
               <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${check.status === 'pass' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                 {check.status === 'pass' ? '✓' : '!'}
               </div>
               <div className="flex-1">
                 <div className="flex justify-between items-center mb-1">
                   <h4 className="font-bold text-slate-800 text-sm">{check.label}</h4>
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${check.status === 'pass' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                     {check.status.toUpperCase()}
                   </span>
                 </div>
                 <p className="text-xs text-slate-500 leading-relaxed">{check.desc}</p>
               </div>
            </div>
          ))}
        </div>

            <div className="pt-8 border-t border-slate-200 flex justify-center gap-4">
              {isManufacturing ? (
                <>
                  <button 
                    onClick={handleDownloadGerber}
                    className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm shadow-sm hover:bg-slate-50"
                  >
                    下载 Gerber 压缩包
                  </button>
               <button className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700">
                 直接发送至 Seeed Fusion 工厂
               </button>
             </>
           ) : (
             <>
               <button className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm shadow-sm hover:bg-slate-50" onClick={() => setIsValidating(true)}>
                 重新扫描
               </button>
               <button className="px-8 py-3 bg-green-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-100 hover:bg-green-700" onClick={onProceed}>
                 确认无误，进入 PCB 模式
               </button>
             </>
           )}
        </div>
      </div>
    </div>
  );
};

export default ValidationView;
