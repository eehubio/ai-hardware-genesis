
import React, { useState, useEffect } from 'react';
import { ProjectState } from '../types';

const ValidationView: React.FC<{ state: ProjectState; onProceed?: () => void; isManufacturing?: boolean }> = ({ state, onProceed, isManufacturing }) => {
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsValidating(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  // ===== 可信状态分级 =====
  // db = 数据库验证(基于真实模块数据计算)  demo = 演示数据(需真实EDA引擎,当前为示意)
  const comps = state.components;

  // 真实计算:I2C 地址冲突
  const i2cComps = comps.filter(c => c.electrical?.protocols?.includes('I2C'));
  const i2cConflict = i2cComps.length > 1; // 简化:多个I2C设备时提示需核对地址
  // 真实计算:电源域
  const voltages = comps.map(c => c.electrical?.voltageRange?.[0]).filter(Boolean);
  const mixedVoltage = new Set(voltages).size > 1;
  // 真实计算:总电流
  const totalCurrent = comps.reduce((s, c) => s + (c.electrical?.currentDraw || 0), 0);
  // 真实计算:是否有主控
  const hasMcu = comps.some(c => c.type === 'mcu');

  const checks = isManufacturing ? [
    { label: 'DRC 设计规则校验', status: 'demo', trust: 'demo', desc: '需接入 EDA 引擎执行真实 DRC。当前为流程示意。' },
    { label: 'BOM 物料完整性', status: comps.length > 0 ? 'pass' : 'warn', trust: 'db', desc: comps.length > 0 ? `已统计 ${comps.length} 个组件,均来自云端模块库。` : '尚未添加组件。' },
    { label: '层对齐检查', status: 'demo', trust: 'demo', desc: '需真实 PCB 工程文件。当前为流程示意。' },
    { label: 'Gerber 文件生成', status: 'demo', trust: 'demo', desc: '生产级 Gerber 需完整 PCB 布线引擎,当前提供输出示例。' }
  ] : [
    { label: '主控检查', status: hasMcu ? 'pass' : 'warn', trust: 'db', desc: hasMcu ? '方案包含主控(MCU)。' : '当前方案缺少主控,建议添加 XIAO 主控。' },
    { label: '电源域校验', status: mixedVoltage ? 'warn' : 'pass', trust: 'db', desc: mixedVoltage ? '检测到不同工作电压的模块,可能需要电平转换,请人工确认。' : '组件工作电压一致。' },
    { label: 'I2C 地址冲突检查', status: i2cConflict ? 'warn' : 'pass', trust: 'db', desc: i2cConflict ? `检测到 ${i2cComps.length} 个 I2C 设备,请核对各自地址是否唯一。` : 'I2C 总线无明显冲突。' },
    { label: '功耗预算分析', status: 'pass', trust: 'db', desc: `预估峰值电流约 ${totalCurrent}mA,建议供电能力 ≥ ${totalCurrent < 500 ? '500mA' : totalCurrent < 1000 ? '1A' : '2A'}。` },
    { label: '机械干涉检查', status: 'demo', trust: 'demo', desc: '需真实外壳/PCB 三维数据。当前为流程示意。' }
  ];

  const handleDownloadGerber = () => {
    // 诚实:这是输出格式示例,不是生产级 Gerber
    const sample = `; ===== 输出示例 (Output Sample) =====
; 注意:这是演示用的 Gerber 格式示例,非生产级制造文件。
; 真实 Gerber 需完整 PCB 布线引擎生成。
G04 Genesis Design Frontend - Sample Output*
%FSLAX46Y46*%
%MOMM*%
; 组件数: ${comps.length}
${comps.map(c => `; - ${c.name} (${c.id})`).join('\n')}
M02*`;
    const blob = new Blob([sample], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Gerber_Sample_${new Date().toISOString().split('T')[0]}.gbr`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isValidating) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-ink-400">
        <div className="w-10 h-10 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-body font-medium animate-pulse">正在分析当前方案...</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto bg-ink-50">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="text-center mb-8">
          <h2 className="text-h2 text-ink-900">{isManufacturing ? '制造文件导出' : '原型设计校验'}</h2>
          <p className="text-body text-ink-500 mt-1.5">
            {isManufacturing ? '以下为制造相关检查项。标注「演示数据」的项目需接入真实 EDA 引擎后才能给出可信结论。' : '以下检查中,「数据库验证」基于真实模块数据计算;「演示数据」为流程示意,尚未经真实工具验证。'}
          </p>
        </div>

        <div className="space-y-2.5">
          {checks.map((check, idx) => {
            const isDemo = check.trust === 'demo';
            const iconBg = check.status === 'pass' ? 'bg-brand-50 text-brand-600' : check.status === 'warn' ? 'bg-amber-50 text-amber-600' : 'bg-ink-100 text-ink-400';
            const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '◦';
            return (
              <div key={idx} className="bg-white p-4 rounded-eng-lg border border-ink-200 flex items-start gap-3">
                 <div className={`w-8 h-8 rounded-eng flex items-center justify-center shrink-0 text-strong ${iconBg}`}>
                   {icon}
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-center gap-2 mb-0.5">
                     <h4 className="font-semibold text-ink-800 text-body">{check.label}</h4>
                     <span className={`text-meta font-medium px-2 py-0.5 rounded-eng shrink-0 ${isDemo ? 'bg-ink-100 text-ink-500 border border-ink-200' : 'bg-brand-50 text-brand-700 border border-brand-200'}`}>
                       {isDemo ? '演示数据' : '数据库验证'}
                     </span>
                   </div>
                   <p className="text-meta text-ink-500 leading-relaxed">{check.desc}</p>
                 </div>
              </div>
            );
          })}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-eng-lg p-3 text-meta text-amber-700 leading-relaxed">
          ⚠ 说明:标注「演示数据」的检查项为流程示意,需接入真实编译器 / ERC / DRC / EDA 引擎后才能作为制造依据。请勿据此直接投产。
        </div>

            <div className="pt-6 border-t border-ink-200 flex justify-center gap-2.5">
              {isManufacturing ? (
                <>
                  <button 
                    onClick={handleDownloadGerber}
                    className="px-5 py-2.5 bg-white border border-ink-200 text-ink-600 rounded-eng-lg font-semibold text-body hover:bg-ink-50 transition-colors"
                  >
                    查看输出示例
                  </button>
               <button className="px-5 py-2.5 bg-ink-200 text-ink-400 rounded-eng-lg font-semibold text-body cursor-not-allowed" title="需真实制造文件,暂未开放" disabled>
                 发送至工厂(演示)
               </button>
             </>
           ) : (
             <>
               <button className="px-5 py-2.5 bg-white border border-ink-200 text-ink-600 rounded-eng-lg font-semibold text-body hover:bg-ink-50 transition-colors" onClick={() => setIsValidating(true)}>
                 重新扫描
               </button>
               <button className="px-5 py-2.5 bg-brand-600 text-white rounded-eng-lg font-semibold text-body hover:bg-brand-700 transition-colors" onClick={onProceed}>
                 进入 PCB 模式
               </button>
             </>
           )}
        </div>
      </div>
    </div>
  );
};

export default ValidationView;
