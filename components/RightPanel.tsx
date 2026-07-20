
import { formatValue, normalizePinMapping } from '../utils/safe';
import React, { useState } from 'react';
import { ProjectState, WorkflowMode, PipelineStatus, PCBFootprint } from '../types';

interface RightPanelProps {
  state: ProjectState;
  setState: React.Dispatch<React.SetStateAction<ProjectState>>;
  onModeChange: (m: WorkflowMode) => void;
  onCollapse?: () => void;
}

const getStatusColor = (status: PipelineStatus) => {
  switch (status) {
    case 'ready': return 'bg-green-500';
    case 'running': return 'bg-blue-500 animate-pulse';
    case 'blocked': return 'bg-rose-500';
    case 'released': return 'bg-indigo-500';
    default: return 'bg-slate-300';
  }
};

const RightPanel: React.FC<RightPanelProps> = ({ state, setState, onModeChange, onCollapse }) => {
  const [activeTab, setActiveTab] = useState<'props' | 'pipeline' | 'bom'>('props');

  const selectedComp = state.components.find(c => c.instanceId === state.selectedComponentId);

  const updateCompFootprint = (fp: PCBFootprint) => {
    if (!selectedComp) return;
    setState(prev => ({
      ...prev,
      components: prev.components.map(c => 
        c.instanceId === selectedComp.instanceId 
          ? { ...c, footprint: fp, isChipOnly: fp.type === 'SMD' } 
          : c
      )
    }));
  };

  return (
    <div className="w-[280px] bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-[-4px_0_15px_rgba(0,0,0,0.02)] z-20">
      <div className="flex border-b border-slate-100 items-stretch">
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="px-3 text-slate-300 hover:text-slate-600 transition-colors text-sm"
            title="收起面板"
          >
            ▶
          </button>
        )}
        {[
          { id: 'props', label: '项目概览' },
          { id: 'bom', label: 'BOM' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-3 text-meta font-semibold transition-colors ${activeTab === tab.id ? 'text-brand-600 border-b-2 border-brand-600' : 'text-ink-400 hover:text-ink-600'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'props' && (
          <div className="space-y-6">
            {selectedComp && (
              <div className="bg-brand-50/60 border border-brand-200 p-4 rounded-eng-lg space-y-4 animate-in fade-in slide-in-from-right-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-meta font-semibold text-brand-700 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                    组件检查器
                  </h4>
                  <span className="text-meta bg-brand-100 text-brand-700 px-2 py-0.5 rounded-eng font-medium">
                    云端库
                  </span>
                </div>

                <div className="flex gap-3 items-center">
                  <div className="w-14 h-14 bg-white rounded-eng border border-ink-200 p-1 flex items-center justify-center shrink-0">
                    <img src={selectedComp.thumb} referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-strong text-ink-800 truncate">{selectedComp.name}</div>
                    <div className="text-meta text-ink-400 font-mono mt-0.5">SKU: {selectedComp.sku || 'CUSTOM-PCBA'}</div>
                    <div className="text-meta text-brand-600 font-semibold mt-0.5">¥{selectedComp.price} (组件成本)</div>
                  </div>
                </div>

                {/* Sub-tabs inside selected component properties */}
                <ComponentDbTabs component={selectedComp} updateCompFootprint={updateCompFootprint} isPcbMode={state.mode === WorkflowMode.PCB} />
              </div>
            )}

            <div className="bg-ink-50 rounded-eng-lg p-4 border border-ink-200">
               <div className="flex justify-between items-start">
                 <div>
                   <div className="text-meta font-medium text-ink-400 uppercase tracking-wide mb-1">项目状态</div>
                   <div className="flex items-center gap-2">
                     <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(state.status)}`} />
                     <span className="text-strong text-ink-700 capitalize">{state.status}</span>
                   </div>
                 </div>
                 <div className="text-meta bg-white px-2 py-1 rounded-eng border border-ink-200 font-mono text-ink-400">
                   v1.0.0
                 </div>
               </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-strong text-ink-800">设计合规性建议</h4>
              {(() => {
                const comps = state.components;
                if (comps.length === 0) {
                  return (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                      添加组件后，这里会显示针对你方案的实时设计检查。
                    </div>
                  );
                }
                const tips: { type: string; text: string }[] = [];
                // I2C 上拉
                const hasI2C = comps.some(c => c.electrical?.protocols?.includes('I2C'));
                if (hasI2C) {
                  tips.push({ type: 'info', text: '检测到 I2C 模块，原理图将自动为 SDA/SCL 添加 4.7kΩ 上拉电阻。' });
                }
                // 缺少 MCU
                const hasMcu = comps.some(c => c.type === 'mcu');
                if (!hasMcu) {
                  tips.push({ type: 'warn', text: '当前方案没有主控(MCU)，建议先添加一个 XIAO 主控。' });
                }
                // 多个 MCU
                const mcuCount = comps.filter(c => c.type === 'mcu').length;
                if (mcuCount > 1) {
                  tips.push({ type: 'warn', text: `检测到 ${mcuCount} 个主控，通常一个系统只需一个主控。` });
                }
                // 总电流估算
                const totalCurrent = comps.reduce((s, c) => s + (c.electrical?.currentDraw || 0), 0);
                if (totalCurrent > 0) {
                  const rec = totalCurrent < 500 ? '500mA' : totalCurrent < 1000 ? '1A' : '2A';
                  tips.push({ type: 'info', text: `预估峰值电流约 ${totalCurrent}mA，建议电源供电能力 ≥ ${rec}。` });
                }
                // 高压继电器
                if (comps.some(c => c.id === 'relay')) {
                  tips.push({ type: 'warn', text: '方案含继电器，若驱动市电负载请注意强弱电隔离与安全间距。' });
                }
                if (tips.length === 0) {
                  tips.push({ type: 'info', text: '基础检查通过，未发现明显问题。' });
                }
                return (
                  <div className="space-y-2">
                    {tips.map((t, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl text-[11px] leading-relaxed border ${
                          t.type === 'warn'
                            ? 'bg-amber-50 border-amber-100 text-amber-700'
                            : 'bg-blue-50 border-blue-100 text-blue-700'
                        }`}
                      >
                        <span className="font-bold">{t.type === 'warn' ? '⚠ 提示:' : 'AI 分析:'}</span> {t.text}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'bom' && (
          <div className="space-y-4">
            {state.components.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                暂无组件，请在左侧库中添加。
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {state.components.map(c => (
                    <div key={c.instanceId} className="flex gap-3 items-center pb-3 border-b border-slate-50 last:border-0">
                      <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 shrink-0">
                         <img 
                          src={c.thumb} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover" 
                         />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-slate-800 truncate">{c.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono">{c.sku || 'CUSTOM-PCBA'}</div>
                      </div>
                      <div className="text-[11px] font-bold text-slate-800">¥{c.price}</div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 pt-4 mt-6">
                  <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <span>物料清单总结</span>
                      <span>{state.components.length} 个组件</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-xs font-semibold text-slate-600">总成本</span>
                      <span className="text-lg font-black text-green-600">
                        ¥{state.components.reduce((sum, c) => sum + (c.price || 0), 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 智能硬件工程实施与供电方案建议 */}
                <ProjectGuide components={state.components} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface ComponentDbTabsProps {
  component: any;
  updateCompFootprint: (fp: any) => void;
  isPcbMode: boolean;
}

const ComponentDbTabs: React.FC<ComponentDbTabsProps> = ({ component, updateCompFootprint, isPcbMode }) => {
  const e = component.electrical;
  const p = component.physical;
  const protocols = e?.protocols || [];
  const pinEntries = normalizePinMapping(e?.pinMapping);
  const pinMap = pinEntries.length > 0 ? pinEntries : null;
  const docUrl = (component.software as any)?.documentationUrl;
  const ghUrl = (component.software as any)?.githubUrl;
  const libs = component.software?.requiredLibraries || [];

  // 仅展示真实存在的数据,缺失的字段直接不显示(不编套话)
  return (
    <div className="space-y-2.5 text-body">
      {/* 电气参数:真数据 */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-white border border-ink-200 rounded-eng p-2">
          <div className="text-meta text-ink-400">电压</div>
          <div className="text-body font-mono text-ink-800 mt-0.5">{e?.voltageRange ? `${e.voltageRange[0]}~${e.voltageRange[1]}V` : '—'}</div>
        </div>
        <div className="bg-white border border-ink-200 rounded-eng p-2">
          <div className="text-meta text-ink-400">电流</div>
          <div className="text-body font-mono text-ink-800 mt-0.5">{e?.currentDraw != null ? `${e.currentDraw}mA` : '—'}</div>
        </div>
        <div className="bg-white border border-ink-200 rounded-eng p-2">
          <div className="text-meta text-ink-400">接口</div>
          <div className="text-body font-mono text-ink-800 mt-0.5">{p?.connectorType || '—'}</div>
        </div>
      </div>

      {/* 协议:有才显示 */}
      {protocols.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-meta text-ink-400 mr-1">协议</span>
          {protocols.map((pr: string, i: number) => (
            <span key={i} className="text-meta font-mono bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded-eng">{pr}</span>
          ))}
        </div>
      )}

      {/* 物理尺寸:有才显示 */}
      {p?.dimensions && (
        <div className="flex items-center gap-2 text-meta">
          <span className="text-ink-400">尺寸</span>
          <span className="font-mono text-ink-700">{p.dimensions.width}×{p.dimensions.height}×{p.dimensions.depth}mm</span>
          {p.weight != null && <span className="text-ink-400">· {p.weight}g</span>}
        </div>
      )}

      {/* 引脚映射:有真实数据才显示 */}
      {pinMap && (
        <div className="bg-white border border-ink-200 rounded-eng p-2">
          <div className="text-meta text-ink-400 mb-1">引脚映射</div>
          <div className="space-y-0.5">
            {pinMap.map(([pin, func], i) => (
              <div key={i} className="flex justify-between text-meta font-mono py-0.5 border-b border-dotted border-ink-100 last:border-0">
                <span className="text-ink-500">{pin}</span>
                <span className="text-brand-600">{func}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 依赖库:有才显示 */}
      {libs.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-meta text-ink-400 mr-1">库</span>
          {libs.map((l: string, i: number) => (
            <span key={i} className="text-meta font-mono bg-ink-100 text-ink-600 px-1.5 py-0.5 rounded-eng">{l}</span>
          ))}
        </div>
      )}

      {/* 文档链接:有才显示 */}
      {(docUrl || ghUrl) && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {docUrl && (
            <a href={docUrl} target="_blank" rel="noreferrer" className="text-meta text-brand-600 hover:text-brand-700 border border-brand-200 hover:bg-brand-50 px-2 py-1 rounded-eng transition-colors">规格书 ↗</a>
          )}
          {ghUrl && (
            <a href={ghUrl} target="_blank" rel="noreferrer" className="text-meta text-brand-600 hover:text-brand-700 border border-brand-200 hover:bg-brand-50 px-2 py-1 rounded-eng transition-colors">源码 ↗</a>
          )}
        </div>
      )}

      {/* PCB 模式:封装切换 */}
      {isPcbMode && component.availableFootprints && component.availableFootprints.length > 0 && (
        <div className="pt-2 border-t border-ink-200 space-y-1.5">
          <span className="text-meta text-ink-400">PCB 封装</span>
          <div className="grid grid-cols-2 gap-1">
            {component.availableFootprints.map((fp: any, i: number) => (
              <button key={i} onClick={() => updateCompFootprint(fp)}
                className={`p-1.5 rounded-eng text-meta font-mono border text-left transition-colors truncate ${component.footprint?.packageName === fp.packageName ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-700 border-ink-200 hover:border-brand-300'}`}>
                {fp.packageName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ProjectGuide: React.FC<{ components: any[] }> = ({ components }) => {
  const mcu = components.find(c => c.type === 'mcu' || c.id?.includes('xiao'));
  const hasEsp32 = components.some(c => c.id?.includes('esp32'));
  const hasNrf = components.some(c => c.id?.includes('nrf'));
  const hasRp2040 = components.some(c => c.id?.includes('rp2040'));
  
  // Calculate total estimated max active current
  let mcuBaseCurrent = 100;
  if (hasEsp32) mcuBaseCurrent = 300;
  else if (hasNrf) mcuBaseCurrent = 30;
  else if (hasRp2040) mcuBaseCurrent = 80;
  
  const totalCurrentDraw = components.reduce((sum, c) => {
    if (c.type === 'mcu' || c.id?.includes('xiao')) return sum;
    return sum + (c.electrical?.currentDraw || 10);
  }, mcuBaseCurrent);

  // Recommendations
  let powerAdvice = '';
  let powerSource = '5V/1A USB-C';
  if (hasEsp32) {
    powerAdvice = '主控 XIAO ESP32-S3 包含高功耗 Wi-Fi/蓝牙，启动及联网发射时存在大瞬态电流，推荐 5V/1A USB-C 供电。若使用锂电池，须配置 3.7V 单节锂电池并接入 BAT 焊盘，充放电管理芯片将自动接入。';
    powerSource = '5V/1A USB-C 或 3.7V 单节锂电池';
  } else if (hasNrf) {
    powerAdvice = '主控 XIAO nRF52840 Sense 为超低功耗蓝牙主控，支持标准 3.7V 锂电池，工作电流一般仅需 15-30mA。支持使用 USB-C 5V 直供，且自带锂电池充电管理。';
    powerSource = 'USB-C 5V 或 3.7V 锂电池';
  } else if (hasRp2040) {
    powerAdvice = '主控 XIAO RP2040 拥有强大的双核计算，推荐使用 USB-C 5V/500mA 电源直供，建议外接 LDO 提供稳定 3.3V 给外部 Grove 传感器接口。';
    powerSource = 'USB-C 5V (500mA)';
  } else {
    powerAdvice = `推荐使用稳压 5V USB-C 连接器供电。系统总静态与动态平均工作电流预计为 ${totalCurrentDraw}mA 左右，选用 5V/500mA 的电源即能安全应对。`;
    powerSource = 'USB-C 5V';
  }

  // Flashing tools advice
  let toolsAdvice = '';
  let ideRecommended = 'Arduino IDE / VS Code + PlatformIO';
  if (hasEsp32) {
    toolsAdvice = '需要安装 CP210x / CH343 USB-to-UART 串口驱动，若使用 Arduino IDE 请在开发板管理器中下载 ESP32 2.0+ SDK 支持包，选择开发板为 “XIAO_ESP32S3”。';
    ideRecommended = 'Arduino IDE (添加 ESP32 支持包) 或 VS Code';
  } else if (hasNrf) {
    toolsAdvice = '支持 WebUSB 一键在线刷录，或使用主流 C++ IDE（Arduino IDE，请安装 Seeed nRF52 boards 包）。由于内置 2MB flash，支持免安装环境的 CircuitPython / MicroPython 拖拽式刷录 (UF2 格式)。';
    ideRecommended = 'Arduino IDE / CircuitPython (通过 UF2 拖拽刷录)';
  } else if (hasRp2040) {
    toolsAdvice = 'RP2040 开发板支持极为便利的 UF2 拖拽式固件烧录。当在按住 BOOT 键连入电脑时，设备会被识别为 USB 闪存盘，可直接进行 MicroPython、CircuitPython 或编译后的 .uf2 连接写入。';
    ideRecommended = 'Thonny (Python) 或 Arduino IDE';
  } else {
    toolsAdvice = '推荐使用 Arduino 统一集成环境。请准备一条具备完整数据传输能力的优质 USB-C 传输线，用以进行程序调试与串口控制监视。';
  }

  // Estimated Project Time Calculation
  let baseHours = 2;
  components.forEach(c => {
    if (c.id === 'grove_vision_ai_v2') baseHours += 2.5; // Complex AI vision
    else if (c.id === 'lora_e5') baseHours += 2; // Complex radio LoRaWAN setup
    else if (c.type === 'display') baseHours += 1; // Needs graphics rendering init
    else if (c.type === 'sensor') baseHours += 0.5; // Simple data fetch
    else if (c.type === 'actuator') baseHours += 0.5; // Standard control signal
  });
  const maxHours = baseHours + 1.5;

  return (
    <div className="mt-5 p-4 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 border border-indigo-100/50 rounded-2xl space-y-4 shadow-sm animate-in fade-in duration-350">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-[11px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
            📋 智能硬件工程实施与供电方案建议
          </h4>
          <p className="text-[9px] text-slate-400 mt-0.5">
            基于当前选定的 {components.length} 个元器件自动生成的可行性设计建议
          </p>
        </div>
        <span className="bg-indigo-100 text-indigo-700 text-[8px] font-bold px-1.5 py-0.5 rounded-md font-mono">
          Genesis v1.5
        </span>
      </div>

      <div className="space-y-3">
        {/* Power Section */}
        <div className="bg-white p-2.5 rounded-xl border border-indigo-50 shadow-sm flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold text-sm">
            🔋
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-black text-slate-700">供电方案建议</span>
            <span className="block text-[9px] text-emerald-700 font-bold mt-0.5 font-mono">推荐规格: {powerSource} · 约 {totalCurrentDraw}mA</span>
            <p className="text-[9px] text-slate-500 leading-normal mt-1">{powerAdvice}</p>
          </div>
        </div>

        {/* Tools Section */}
        <div className="bg-white p-2.5 rounded-xl border border-indigo-50 shadow-sm flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 font-bold text-sm">
            🛠️
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-black text-slate-700">编程及烧录工具</span>
            <span className="block text-[9px] text-orange-700 font-bold mt-0.5 font-mono">开发环境: {ideRecommended}</span>
            <p className="text-[9px] text-slate-500 leading-normal mt-1">{toolsAdvice}</p>
          </div>
        </div>

        {/* Requirements and Estimations Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Skills Required */}
          <div className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col justify-between">
            <span className="text-[8px] text-slate-400 font-bold uppercase block tracking-wider">📚 技术基础等级</span>
            <div className="mt-1">
              <span className="text-[10px] text-indigo-700 font-black block">
                {components.some(c => c.id === 'grove_vision_ai_v2' || c.id === 'lora_e5') ? '⚔️ 进阶硬件系统集成' : '🌱 基础 Arduino C/Python'}
              </span>
              <span className="text-[8px] text-slate-400 block mt-0.5">熟悉 I2C 通信、基本 GPIO 电路控制</span>
            </div>
          </div>

          {/* Time Estimated */}
          <div className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col justify-between">
            <span className="text-[8px] text-slate-400 font-bold uppercase block tracking-wider">⏱️ 预计项目工时</span>
            <div className="mt-1">
              <span className="text-[10px] text-indigo-700 font-black block font-mono">
                约 {Math.floor(baseHours)} - {Math.ceil(maxHours)} 小时
              </span>
              <span className="text-[8px] text-slate-400 block mt-0.5">包含物理插接物理引脚接线与主逻辑调试</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RightPanel;
