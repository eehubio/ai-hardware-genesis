
import React, { useState, useEffect, useRef } from 'react';
import { ProjectState } from '../types';
import { formatValue, normalizePinMapping, scalarPin } from '../utils/safe';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const WiringView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>> }> = ({ state, setState }) => {
  const mcu = state.components.find(c => c.type === 'mcu' || c.type === 'processor');
  const peripherals = state.components.filter(c => c.type !== 'mcu' && c.type !== 'processor');
  const [isScanning, setIsScanning] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [statusText, setStatusText] = useState('AI 正在编排资源...');
  const [isSuccess, setIsSuccess] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsScanning(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // 辅助函数：将图片 URL 转换为 Base64
  const imageUrlToBase64 = async (url: string): Promise<string | null> => {
    try {
      // 注意：如果服务器没有 CORS 头部，此 fetch 可能会失败
      const response = await fetch(url, { mode: 'no-cors' });
      // 由于 no-cors 模式下无法读取 blob，这里主要依赖 html2canvas 的 useCORS 机制
      // 如果 fetch 无法获取，我们返回 null，让渲染引擎尝试直接渲染 URL
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    setExportProgress(10);
    setIsSuccess(false);
    setStatusText('准备高分辨率渲染容器...');
    
    try {
      if (document.fonts) await document.fonts.ready;
      
      const originalScrollPos = window.scrollY;
      window.scrollTo(0, 0);

      // 直接使用 html2canvas 的克隆机制处理图片
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, // 适度的缩放确保清晰度与性能平衡
        useCORS: true, // 核心：允许跨域图片渲染
        allowTaint: true,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        logging: false,
        windowWidth: 1200, 
        onclone: (clonedDoc) => {
          const report = clonedDoc.querySelector('.print-container') as HTMLElement;
          if (report) {
            report.style.padding = '40px';
            report.style.width = '1200px';
            // 确保打印模式下所有文本可见
            clonedDoc.querySelectorAll('*').forEach(el => {
              const element = el as HTMLElement;
              if (element.classList.contains('truncate')) {
                element.style.whiteSpace = 'normal';
                element.style.overflow = 'visible';
              }
            });
          }
          // 隐藏导出按钮本身
          const btn = clonedDoc.querySelector('.no-print') as HTMLElement;
          if (btn) btn.style.display = 'none';
        }
      });

      setExportProgress(70);
      setStatusText('正在生成 PDF 数据包...');

      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const margin = 10;
      const contentWidth = pdfWidth - (margin * 2);
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
      pdf.save(`Seeed_Genesis_Guide_${Date.now()}.pdf`);

      window.scrollTo(0, originalScrollPos);
      setExportProgress(100);
      setIsSuccess(true);
      
      setTimeout(() => {
        setIsExporting(false);
        setIsSuccess(false);
      }, 2000);

    } catch (error) {
      console.error('PDF Generation failed:', error);
      setStatusText('渲染超时，请尝试刷新页面后重试');
      setTimeout(() => setIsExporting(false), 3000);
    }
  };

  const getPinAssignment = (p: any) => {
    if (!mcu) return 'N/A';
    const protocols = p.electrical?.protocols || [];
    const pinMapping = mcu.electrical?.pinMapping || {};
    const spec = (p.spec || '').toUpperCase();
    const name = (p.name || '').toUpperCase();

    const isI2c = protocols.includes('I2C') || spec.includes('I2C') || name.includes('I2C') || (p.electrical?.pinMapping && ('SDA' in p.electrical.pinMapping || 'sda' in p.electrical.pinMapping));
    const isUart = protocols.includes('UART') || spec.includes('UART') || name.includes('UART') || (p.electrical?.pinMapping && ('TX' in p.electrical.pinMapping || 'RX' in p.electrical.pinMapping));
    const isAdc = protocols.includes('ADC') || spec.includes('ADC') || name.includes('ADC');

    if (isI2c) {
      return `${scalarPin(pinMapping, 'SDA', 'D4')} / ${scalarPin(pinMapping, 'SCL', 'D5')}`;
    }
    if (isUart) {
      return `${scalarPin(pinMapping, 'TX', 'D7')} / ${scalarPin(pinMapping, 'RX', 'D6')}`;
    }
    if (isAdc) {
      return 'A0';
    }
    
    // Default fallback for GPIO
    const idx = peripherals.indexOf(p);
    return `D${10 + idx}`;
  };

  if (isScanning) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
        <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-bold text-sm tracking-widest animate-pulse">正在解析引脚分配逻辑...</p>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50/50 relative">
      <div ref={reportRef} className="max-w-4xl mx-auto space-y-8 print-container pb-20">
        <div className="flex items-center justify-between no-print gap-4">
          <div>
            <h2 className="text-h2 text-ink-900">接线指南 <span className="text-brand-600 text-meta font-mono border border-brand-200 bg-brand-50 px-2 py-0.5 rounded-eng align-middle">Wiring Guide</span></h2>
            <p className="text-body text-ink-500 mt-1">根据当前方案实时生成的物理连线文档</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button 
              onClick={() => setState(p => ({ ...p, currentStep: 2 }))}
              className="px-4 py-2.5 bg-brand-600 text-white rounded-eng-lg text-body font-semibold hover:bg-brand-700 transition-colors flex items-center gap-1.5"
            >
              <span>编写固件</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
            </button>
            <button 
              onClick={handleExportPDF}
              disabled={isExporting}
              className={`px-4 py-2.5 bg-ink-800 text-white rounded-eng-lg text-body font-semibold hover:bg-ink-900 transition-colors flex items-center gap-1.5 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span>{isExporting ? 'PDF 渲染中...' : '生成 PDF 指南'}</span>
            </button>
          </div>
        </div>

        {/* 核心信息条:主控 + 统计,一行紧凑展示 */}
        <div className="bg-white p-4 rounded-eng-lg border border-ink-200 flex items-center gap-4 flex-wrap">
          {mcu ? (
            <>
              <div className="w-14 h-14 bg-ink-50 rounded-eng border border-ink-200 flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                <img src={mcu.thumb} className="max-w-full max-h-full object-contain" alt={mcu.name} />
              </div>
              <div className="min-w-0">
                <div className="text-strong text-ink-900">{mcu.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-meta font-mono text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-eng">I2C</span>
                  <span className="text-meta font-mono text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-eng">UART</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-body text-ink-300 italic">未检测到主控</div>
          )}
          <div className="flex gap-6 ml-auto pr-2">
            <div className="text-center">
              <div className="text-h3 text-ink-900">{peripherals.length * 4}</div>
              <div className="text-meta text-ink-400">跳线</div>
            </div>
            <div className="text-center">
              <div className="text-h3 text-ink-900">{peripherals.length}</div>
              <div className="text-meta text-ink-400">外设</div>
            </div>
          </div>
        </div>

        {/* 详细接线表 */}
        <div className="bg-white rounded-eng-xl shadow-sm border border-ink-200 overflow-hidden">
          <table className="w-full text-left table-fixed border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="w-1/4 px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">主控引脚 (Signal)</th>
                <th className="w-1/6 px-4 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">电源/地 (Pwr)</th>
                <th className="w-1/3 px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">目标外设</th>
                <th className="w-1/4 px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">协议栈</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {peripherals.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs flex items-center justify-center font-black shadow-lg uppercase min-w-[60px]">
                        {getPinAssignment(p)}
                      </div>
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight">
                        {p.electrical.protocols?.[0] || 'Signal'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-6 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-[9px] font-black text-slate-500">3.3V</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-900" />
                        <span className="text-[9px] font-black text-slate-500">GND</span>
                      </div>
                    </div>
                  </td>
                   <td className="px-8 py-6">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden flex items-center justify-center shrink-0 p-1">
                        <img src={p.thumb} className="max-w-full max-h-full object-contain" alt={p.name} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-900 uppercase truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">{p.spec.split('·')[0]}</div>
                        
                        {normalizePinMapping(p.electrical?.pinMapping).length > 0 ? (
                          <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-dashed border-slate-205">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">🔌 外设定制管脚映射 (Device Pin Out)</span>
                            <div className="flex flex-wrap gap-1.5">
                              {normalizePinMapping(p.electrical?.pinMapping).map(([pinName, pinNum]) => {
                                // Match this sensor pin to corresponding MCU pin
                                let mcuMatchedPin = 'N/A';
                                if (mcu) {
                                  const nameUpper = pinName.toUpperCase();
                                  if (nameUpper === 'GND') mcuMatchedPin = 'GND';
                                  else if (nameUpper === 'VCC' || nameUpper === '3V3' || nameUpper === '5V') mcuMatchedPin = '3.3V/5V';
                                  else if (nameUpper === 'SDA') mcuMatchedPin = scalarPin(mcu.electrical?.pinMapping, 'SDA', 'D4');
                                  else if (nameUpper === 'SCL') mcuMatchedPin = scalarPin(mcu.electrical?.pinMapping, 'SCL', 'D5');
                                  else if (nameUpper === 'TX') mcuMatchedPin = scalarPin(mcu.electrical?.pinMapping, 'TX', 'D7');
                                  else if (nameUpper === 'RX') mcuMatchedPin = scalarPin(mcu.electrical?.pinMapping, 'RX', 'D6');
                                }
                                return (
                                  <div key={pinName} className="bg-white border border-slate-200 py-1 px-2 rounded-lg text-[9px] font-mono flex items-center gap-1 shadow-sm">
                                    <span className="font-bold text-slate-800 bg-slate-100 px-1 rounded text-[8px]">Pin {pinNum}</span>
                                    <span className="text-slate-400 text-[8px]">({pinName})</span>
                                    <span className="text-indigo-400">⚡</span>
                                    <span className="text-indigo-600 font-bold">{mcuMatchedPin}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-[9px] text-slate-400 italic">尚未在器件库中定义该外设管脚。双击边栏编辑该器件以解锁自动化对齐指引！</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${p.spec.includes('I2C') ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                      {p.spec.includes('I2C') ? 'I2C Bridge' : 'GPIO Dir'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 接线校验与注意事项 —— 基于当前模块真实数据计算,数据缺失时如实显示,不编造 */}
        {(() => {
          // 电平:统计各模块电压范围
          const vrs = state.components.map(c => ({ name: c.name, vr: c.electrical?.voltageRange }));
          const known = vrs.filter(x => Array.isArray(x.vr) && x.vr!.length === 2);
          const unknownV = vrs.length - known.length;
          const all33 = known.length > 0 && known.every(x => x.vr![0] <= 3.3 && x.vr![1] >= 3.3);
          const vConflict = known.some(x => x.vr![0] > 3.3 || x.vr![1] < 3.3);

          // I2C:比较真实地址
          const i2cDevs = peripherals.filter(p => p.electrical?.protocols?.includes('I2C'));
          const addrs = i2cDevs.map(d => (d.electrical as any)?.i2cAddress).filter(Boolean) as string[];
          const dup = addrs.filter((a, i) => addrs.indexOf(a) !== i);
          const unknownAddr = i2cDevs.length - addrs.length;

          // 功耗:只对数值型 currentDraw 求和
          const draws = state.components.map(c => {
            const d = c.electrical?.currentDraw;
            return typeof d === 'number' && Number.isFinite(d) ? d : null;
          });
          const sum = draws.reduce((s: number, d) => s + (d ?? 0), 0);
          const unknownI = draws.filter(d => d === null).length;

          const empty = state.components.length === 0;
          return (
            <div className="mt-8 grid grid-cols-3 gap-4">
              <div className={`border p-5 rounded-eng-xl space-y-2 ${empty || unknownV > 0 ? 'bg-ink-50 border-ink-200' : vConflict ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-100'}`}>
                <h4 className="text-meta font-semibold text-ink-500 uppercase tracking-wide">电平匹配校验</h4>
                <p className="text-body text-ink-700 leading-relaxed">
                  {empty ? '不适用:画布为空,无可校验模块。'
                    : vConflict ? `⚠ 检测到与 3.3V 不兼容的电压范围,请核对:${known.filter(x => x.vr![0] > 3.3 || x.vr![1] < 3.3).map(x => x.name).join('、')}`
                    : unknownV > 0 ? `${known.length} 个模块支持 3.3V;另有 ${unknownV} 个模块电压数据缺失,无法确认,请查阅规格书。`
                    : all33 ? `${known.length} 个模块电压范围均覆盖 3.3V,无需电平转换。`
                    : '电压数据不足,无法给出结论。'}
                </p>
              </div>
              <div className={`border p-5 rounded-eng-xl space-y-2 ${empty || i2cDevs.length === 0 ? 'bg-ink-50 border-ink-200' : dup.length > 0 ? 'bg-red-50 border-red-200' : unknownAddr > 0 ? 'bg-ink-50 border-ink-200' : 'bg-green-50 border-green-100'}`}>
                <h4 className="text-meta font-semibold text-ink-500 uppercase tracking-wide">I2C 地址冲突检查</h4>
                <p className="text-body text-ink-700 leading-relaxed">
                  {empty || i2cDevs.length === 0 ? '不适用:当前无 I2C 设备。'
                    : dup.length > 0 ? `⚠ 检测到地址冲突:${Array.from(new Set(dup)).join(', ')},请修改其中一个设备地址。`
                    : unknownAddr > 0 ? `${i2cDevs.length} 个 I2C 设备中 ${unknownAddr} 个地址数据缺失,无法完成冲突检查(已知:${addrs.join(', ') || '无'})。`
                    : `${i2cDevs.length} 个 I2C 设备地址(${addrs.join(', ')})无冲突。`}
                </p>
              </div>
              <div className={`border p-5 rounded-eng-xl space-y-2 ${empty || unknownI > 0 ? 'bg-ink-50 border-ink-200' : 'bg-green-50 border-green-100'}`}>
                <h4 className="text-meta font-semibold text-ink-500 uppercase tracking-wide">功耗余量分析</h4>
                <p className="text-body text-ink-700 leading-relaxed">
                  {empty ? '不适用:画布为空。'
                    : unknownI > 0 ? `已知模块电流合计约 ${sum}mA;另有 ${unknownI} 个模块电流数据缺失,实际峰值会更高,请预留余量。`
                    : `预估峰值电流约 ${sum}mA,建议供电能力 ≥ ${sum < 400 ? '500mA' : sum < 900 ? '1A' : '2A'}。`}
                </p>
              </div>
            </div>
          );
        })()}

        <div className="text-center pt-12 pb-4 text-[10px] text-slate-300 font-black uppercase tracking-[0.5em] italic">
          Seeed AI Genesis / Professional Hardware Report / Internal v1.4
        </div>
      </div>

      {/* 导出过程遮罩 */}
      {isExporting && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-8 no-print">
          <div className="w-full max-w-lg bg-white rounded-[64px] p-16 shadow-3xl text-center space-y-12 animate-in zoom-in duration-300">
             {!isSuccess ? (
               <>
                 <div className="relative w-32 h-32 mx-auto">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100" />
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-green-500" strokeDasharray={364} strokeDashoffset={364 - (364 * exportProgress) / 100} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out' }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-black text-slate-900 font-mono tracking-tighter">{exportProgress}%</div>
                 </div>
                 <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight mb-3 uppercase">PDF 深度导出</h3>
                    <p className="text-sm text-slate-500 font-bold leading-relaxed">{statusText}</p>
                 </div>
               </>
             ) : (
               <div className="space-y-8 py-4">
                 <div className="w-28 h-28 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-6xl animate-bounce shadow-inner">✓</div>
                 <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight mb-3 uppercase">PDF 已生成</h3>
                    <p className="text-sm text-slate-500 font-bold leading-relaxed italic uppercase">High-Resolution assets embedded.</p>
                 </div>
               </div>
             )}
             <div className="pt-6">
                <div className="px-10 py-3 bg-slate-900 rounded-full text-[10px] font-black text-white uppercase tracking-[0.4em] inline-block shadow-2xl">Seeed High-Resolution Render</div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WiringView;
