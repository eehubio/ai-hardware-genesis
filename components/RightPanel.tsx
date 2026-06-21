
import React, { useState } from 'react';
import { ProjectState, WorkflowMode, PipelineStatus, PCBFootprint } from '../types';

interface RightPanelProps {
  state: ProjectState;
  setState: React.Dispatch<React.SetStateAction<ProjectState>>;
  onModeChange: (m: WorkflowMode) => void;
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

const RightPanel: React.FC<RightPanelProps> = ({ state, setState, onModeChange }) => {
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
      <div className="flex border-b border-slate-100">
        {[
          { id: 'props', label: '项目概览' },
          { id: 'bom', label: 'BOM' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-3 text-[11px] font-bold transition-colors ${activeTab === tab.id ? 'text-green-600 border-b-2 border-green-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'props' && (
          <div className="space-y-6">
            {selectedComp && (
              <div className="bg-indigo-50/50 border border-indigo-150 p-4 rounded-3xl space-y-4 animate-in fade-in slide-in-from-right-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-550 animate-pulse" />
                    Vercel DB Component Inspector
                  </h4>
                  <span className="text-[8px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black uppercase">
                    API Active
                  </span>
                </div>

                <div className="flex gap-3 items-center">
                  <div className="w-14 h-14 bg-white rounded-2xl border border-indigo-100/80 p-1 flex items-center justify-center shrink-0">
                    <img src={selectedComp.thumb} referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-800 truncate uppercase">{selectedComp.name}</div>
                    <div className="text-[9px] text-slate-400 font-mono mt-0.5">SKU: {selectedComp.sku || 'CUSTOM-PCBA'}</div>
                    <div className="text-[9px] text-indigo-600 font-black mt-0.5">¥{selectedComp.price} (组件成本)</div>
                  </div>
                </div>

                {/* Sub-tabs inside selected component properties */}
                <ComponentDbTabs component={selectedComp} updateCompFootprint={updateCompFootprint} isPcbMode={state.mode === WorkflowMode.PCB} />
              </div>
            )}

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
               <div className="flex justify-between items-start mb-4">
                 <div>
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Project Status</div>
                   <div className="flex items-center gap-2">
                     <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(state.status)} shadow-sm`} />
                     <span className="text-sm font-bold text-slate-700 capitalize">{state.status}</span>
                   </div>
                 </div>
                 <div className="text-[10px] bg-white px-2 py-1 rounded-lg border border-slate-100 font-mono text-slate-400">
                   v1.0.0
                 </div>
               </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-800">设计合规性建议</h4>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[11px] text-blue-700 leading-relaxed">
                <span className="font-bold">AI 分析:</span> 检测到您使用了 I2C 模块。在生成的原理图中，我们将自动添加 4.7kΩ 上拉电阻到 SDA/SCL 总线。
              </div>
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
  const [subTab, setSubTab] = useState<'info' | 'tech' | 'docs'>('info');

  const functionalities = component.functionalities || [
    `作为 ${component.type === 'mcu' ? '核心微控制器' : '外部模块'} 实现系统的底层逻辑与硬件联动`,
    `额定电压范围：${component.electrical?.voltageRange?.[0] || 3.3}V - ${component.electrical?.voltageRange?.[1] || 5.0}V`,
    `芯片静态功耗：${component.electrical?.currentDraw || 10}mA，总线协议支持。`
  ];

  const designFiles = component.designProjectFiles || [
    `${component.id}_v1.0.schlib (元件设计原理图符号文件)`,
    `${component.id}_v1.0.kicad_mod (元器件物理焊接封装文件)`
  ];

  const llmTags = component.llmPromptTags || [component.id, component.type, 'Grove', 'Seeed_Studio'];

  return (
    <div className="space-y-4">
      {/* Sub-tabs buttons */}
      <div className="flex bg-white/65 p-1 rounded-xl border border-indigo-100 gap-1">
        {[
          { id: 'info', label: '概述描述' },
          { id: 'tech', label: '硬件定义' },
          { id: 'docs', label: '设计文件' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as any)}
            className={`flex-1 py-1.5 rounded-lg text-center text-[10px] font-bold transition-all ${subTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-slate-600 space-y-3">
        {subTab === 'info' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div>
              <span className="font-bold text-slate-800 block mb-1">🔍 数据库功能描述</span>
              <p className="text-slate-500 leading-relaxed text-[10px]">{component.description || component.spec || '暂无详细描述描述'}</p>
            </div>
            {functionalities.length > 0 && (
              <div>
                <span className="font-bold text-slate-800 block mb-1">🌟 模块核心功能</span>
                <ul className="list-disc pl-4 space-y-1 text-slate-500 text-[10px]">
                  {functionalities.map((func: string, i: number) => (
                    <li key={i}>{func}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <span className="font-bold text-slate-800 block mb-1">🏷️ 意图识别/智能体适配标签</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {llmTags.map((tag: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[8px] font-mono rounded font-bold uppercase">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {subTab === 'tech' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-2 rounded-xl border border-indigo-100/30">
                <span className="text-[9px] text-slate-400 block font-bold">硬件供电方式</span>
                <span className="text-[10px] text-indigo-700 font-bold block mt-0.5">{component.voltageSource || `${component.electrical?.voltageRange?.[0]}-${component.electrical?.voltageRange?.[1]}V`}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-indigo-100/30">
                <span className="text-[9px] text-slate-400 block font-bold">运行供电静态电流</span>
                <span className="text-[10px] text-indigo-700 font-bold block mt-0.5">{component.electrical?.currentDraw || '10'} mA</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-indigo-100/30 col-span-2">
                <span className="text-[9px] text-slate-400 block font-bold">外部物理物理尺寸</span>
                <span className="text-[10px] text-slate-700 font-bold block mt-0.5">
                  长轴 {component.physical?.dimensions?.width || 20}mm × 纵宽 {component.physical?.dimensions?.height || 20}mm × 高/厚 {component.physical?.dimensions?.depth || 5}mm
                </span>
                <span className="text-[8px] text-slate-400 block mt-1">
                  连接接口: {component.physical?.connectorType || 'Grove'} · 净重: {component.physical?.weight || 3}g
                </span>
              </div>
            </div>

            {component.electrical?.pinMapping && Object.keys(component.electrical.pinMapping).length > 0 && (
              <div className="bg-white p-2.5 rounded-xl border border-indigo-100/30">
                <span className="text-[9px] font-bold text-slate-800 block mb-1">📌 总线引脚/管脚定义</span>
                <div className="space-y-1">
                  {Object.entries(component.electrical.pinMapping).map(([pin, func]: any, i) => (
                    <div key={i} className="flex justify-between items-center text-[9px] py-0.5 border-b border-dotted border-slate-150 last:border-0">
                      <span className="text-slate-400 font-bold uppercase">{pin} 物理管脚</span>
                      <span className="text-indigo-600 font-mono font-bold">{func} 系统分配信号</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'docs' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div>
              <span className="font-bold text-slate-800 block mb-1">📂 物理设计CAD工程文件</span>
              <div className="bg-slate-900/5 text-slate-500 font-mono text-[9px] p-2 rounded-xl border border-slate-200 space-y-1">
                {designFiles.map((file: string, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span>⚙️</span>
                    <span className="truncate">{file}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-800 block mb-1">🔌 驱动程序与核心依赖软件库</span>
              <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 rounded inline-block font-bold">
                🔗 {component.driverRequired || component.software?.requiredLibraries?.[0] || '默认包含（无需额外驱动）'}
              </span>
            </div>

            <div className="pt-1.5 space-y-1.5">
              {component.software?.documentationUrl && (
                <a
                  href={component.software.documentationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-250 text-indigo-600 transition-all text-[9px] font-bold shadow-sm"
                >
                  <span>🌐 查阅官方规格书 Datasheet 链接</span>
                  <span>↗</span>
                </a>
              )}
              {component.software?.githubUrl && (
                <a
                  href={component.software.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-250 text-indigo-600 transition-all text-[9px] font-bold shadow-sm"
                >
                  <span>📦 查阅参考项目、驱动源码链接</span>
                  <span>↗</span>
                </a>
              )}
            </div>
            
            {isPcbMode && component.availableFootprints && (
              <div className="pt-2 border-t border-indigo-100/50 space-y-2">
                <span className="text-[9px] font-black text-indigo-550 uppercase">KiCad 物理贴片封装切换</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {component.availableFootprints.map((fp: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => updateCompFootprint(fp)}
                      className={`p-2 rounded-xl text-[9px] font-bold border text-left transition-all truncate ${component.footprint?.packageName === fp.packageName ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-100 hover:border-indigo-200'}`}
                    >
                      {fp.packageName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
