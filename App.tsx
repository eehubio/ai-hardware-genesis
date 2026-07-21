
import React, { useState, useCallback, useEffect } from 'react';
import { RequirementsMap, RequirementOption, WorkflowMode, ProjectState, CanvasComponent, Connection, AIAgentMessage, Artifact, HardwareComponent } from './types';
import { PROTOTYPE_STEPS, PCB_STEPS, SEEED_MODULE_LIBRARY_IR } from './constants';
import { getDatabaseComponents } from './services/dbService';
import { fetchModuleLibrary } from './services/apiService';
import Header from './components/Header';
import WorkflowProgress from './components/WorkflowProgress';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import Canvas from './components/Canvas';
import RightPanel from './components/RightPanel';
import AIAssistant from './components/AIAssistant';
import { generateAIAssistance } from './services/geminiService';

// Functional views
import WiringView from './components/WiringView';
import FirmwareView from './components/FirmwareView';
import EnclosureView from './components/EnclosureView';
import ValidationView from './components/ValidationView';
import SchematicView from './components/SchematicView';
import PCBConstraintView from './components/PCBConstraintView';
import PCBRoutingView from './components/PCBRoutingView';
import HardwareClippingView from './components/HardwareClippingView';

const INITIAL_ARTIFACTS: Artifact[] = [
  { id: 'p-ir', label: '原型设计文档', status: 'draft', type: 'PrototypeIR', version: '1.0.0' },
  { id: 'f-ir', label: '固件逻辑文档', status: 'draft', type: 'FirmwareIR', version: '1.0.0' },
  { id: 'sw-ir', label: '软件使用规范', status: 'draft', type: 'SoftwareUsageIR', version: '1.0.0' },
  { id: 'sch-ir', label: '原理图设计', status: 'draft', type: 'SchematicIR', version: '1.0.0' },
  { id: 'sim-ir', label: '精简电路方案', status: 'draft', type: 'SimplifiedCircuitIR', version: '1.0.0' },
  { id: 'con-ir', label: 'PCB 布局约束', status: 'draft', type: 'PCBConstraintIR', version: '1.0.0' },
  { id: 'pla-ir', label: '布局优化方案', status: 'draft', type: 'PlacementIR', version: '1.0.0' },
  { id: 'rt-ir', label: '布线拓扑方案', status: 'draft', type: 'RoutingIR', version: '1.0.0' },
  { id: 'drc-ir', label: 'DRC 校验报告', status: 'draft', type: 'DRCReportIR', version: '1.0.0' },
  { id: 'mfg-ir', label: '制造生产文件', status: 'draft', type: 'ManufacturingIR', version: '1.0.0' },
  { id: 'val-ir', label: '全链路校验报告', status: 'draft', type: 'ValidationReportIR', version: '1.0.0' }
];

const App: React.FC = () => {
  // 模块库改为从线上「模块数据平台」API 异步加载（单一数据源）。
  // 启动时先空着，下方 useEffect 拉取后填入；加载期间显示提示。
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);

  // 窄屏自动收起右侧面板，给画布让出空间
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1180) setRightPanelCollapsed(true);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [state, setState] = useState<ProjectState>({
    mode: WorkflowMode.PROTOTYPE,
    currentStep: 0,
    components: [],
    connections: [],
    selectedComponentId: null,
    dxfUploaded: false,
    status: 'draft',
    pcbConstraints: { width: 100, height: 80, layers: 2, thickness: 1.6 },
    artifacts: INITIAL_ARTIFACTS,
    library: [],
    categories: []
  });

  // 从云端平台拉取模块库（失败时 apiService 内部自动回退到本地种子数据）
  useEffect(() => {
    let cancelled = false;
    fetchModuleLibrary()
      .then(lib => {
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          library: lib,
          categories: Array.from(new Set(lib.map(c => c.type)))
        }));
      })
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = (event) => {
            const url = event.target?.result as string;
            if (url) {
              setState(prev => {
                // 根据当前板子大小计算中心位置 (5px = 1mm)
                const boardW = prev.pcbConstraints.width * 5;
                const boardH = prev.pcbConstraints.height * 5;
                const count = prev.pastedImages?.length || 0;
                
                return {
                  ...prev,
                  pastedImages: [
                    ...(prev.pastedImages || []),
                    {
                      id: `img-${Date.now()}`,
                      url,
                      x: Math.max(10, (boardW / 2 - 150) + count * 20),
                      y: Math.max(10, (boardH / 2 - 100) + count * 20),
                      width: 200 // 默认宽度缩小一点，防止遮挡过多
                    }
                  ]
                };
              });
            }
          };
          reader.readAsDataURL(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const [aiHistory, setAiHistory] = useState<AIAgentMessage[]>([
    { id: '1', role: 'assistant', text: '欢迎来到 Seeed AI 智造平台。我是您的项目架构师。您可以告诉我您的设计目标（例如：制作一个自动浇花系统），我会为您推荐硬件方案。' }
  ]);

  // ===== F-05:需求状态机(结构化决策 + 互斥约束)=====
  const [requirements, setRequirements] = useState<RequirementsMap>({});
  const recordDecision = useCallback((opt: RequirementOption) => {
    const dimension = opt.dimension || 'other';
    const value = opt.value || opt.label;
    const d = { dimension, value, label: opt.label, decidedAt: Date.now() };
    setRequirements(prev => {
      const list = prev[dimension] || [];
      if (opt.exclusive) return { ...prev, [dimension]: [d] }; // 单选维度:替换,不叠加
      if (list.some(x => x.value === value)) return prev;      // 多选维度:去重追加
      return { ...prev, [dimension]: [...list, d] };
    });
  }, []);
  const removeDecision = useCallback((dimension: string, value: string) => {
    setRequirements(prev => {
      const list = (prev[dimension] || []).filter(x => x.value !== value);
      const next = { ...prev };
      if (list.length) next[dimension] = list; else delete next[dimension];
      return next;
    });
  }, []);
  // ===== F-14 修复:项目状态持久化(刷新不再丢方案) =====
  const PERSIST_KEY = 'genesis_project_v1';
  // 恢复:仅白名单字段;library/categories 始终由云端拉取,不持久化
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.state) {
        setState(prev => ({
          ...prev,
          mode: saved.state.mode ?? prev.mode,
          currentStep: saved.state.currentStep ?? prev.currentStep,
          components: Array.isArray(saved.state.components) ? saved.state.components : prev.components,
          connections: Array.isArray(saved.state.connections) ? saved.state.connections : prev.connections,
          pcbConstraints: saved.state.pcbConstraints ?? prev.pcbConstraints,
          artifacts: Array.isArray(saved.state.artifacts) ? saved.state.artifacts : prev.artifacts,
          status: saved.state.status ?? prev.status,
        }));
      }
      if (Array.isArray(saved?.aiHistory) && saved.aiHistory.length > 0) {
        setAiHistory(saved.aiHistory);
      }
      if (saved?.requirements && typeof saved.requirements === 'object') {
        setRequirements(saved.requirements);
      }
    } catch { /* 损坏的存档直接忽略 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 保存:防抖 800ms;贴图(base64 大块)不入存档以防超配额,超配额时降级重试
  useEffect(() => {
    const t = setTimeout(() => {
      const payload = {
        v: 1,
        state: {
          mode: state.mode, currentStep: state.currentStep,
          components: state.components, connections: state.connections,
          pcbConstraints: state.pcbConstraints, artifacts: state.artifacts, status: state.status,
        },
        aiHistory: aiHistory.slice(-50),
        requirements,
      };
      try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
      } catch {
        try {
          localStorage.setItem(PERSIST_KEY, JSON.stringify({ ...payload, aiHistory: aiHistory.slice(-10) }));
        } catch { /* 实在放不下就放弃本次保存 */ }
      }
    }, 800);
    return () => clearTimeout(t);
  }, [state.mode, state.currentStep, state.components, state.connections, state.pcbConstraints, state.artifacts, state.status, aiHistory, requirements]);

  const resetProject = () => {
    if (!window.confirm('确定重置项目?画布、对话与进度将清空(模块库不受影响)。')) return;
    localStorage.removeItem(PERSIST_KEY);
    window.location.reload();
  };

  const [isProcessing, setIsProcessing] = useState(false);

  const applySolution = (ids: string[]) => {
    // F-03/F-09 修复:不静默补主控、不静默跳过未知 ID、processor 也算主控、给出结果摘要
    const found: typeof state.library = [];
    const skipped: string[] = [];
    ids.forEach(id => {
      const base = state.library.find(c => c.id === id);
      if (base) found.push(base); else skipped.push(id);
    });

    const isMcuType = (t?: string) => t === 'mcu' || t === 'processor';
    const mcus = found.filter(c => isMcuType(c.type));
    const mcuBase = mcus[0] || null;
    const peripherals = found.filter(c => c !== mcuBase);

    const newComponents: CanvasComponent[] = [];
    const mcuX = 400; const mcuY = 300;
    if (mcuBase) {
      newComponents.push({ ...mcuBase, instanceId: `${mcuBase.id}-${Date.now()}`, x: mcuX, y: mcuY, pcbX: 30, pcbY: 30 });
    }
    const radius = 250;
    peripherals.forEach((base, index) => {
      const angle = (index / Math.max(peripherals.length, 1)) * Math.PI * 2;
      newComponents.push({
        ...base,
        instanceId: `${base.id}-${Date.now()}-${index}`,
        x: mcuX + Math.cos(angle) * radius - 96,
        y: mcuY + Math.sin(angle) * radius - 64,
        pcbX: 30 + (index + 1) * 40,
        pcbY: 30
      });
    });

    setState(prev => ({
      ...prev,
      components: newComponents,
      selectedComponentId: null as any,
      status: newComponents.length > 0 ? 'running' : prev.status,
      // 只把原型标 ready;校验状态不假标(F-09:应用≠已验证)
      artifacts: prev.artifacts.map(a =>
        a.type === 'PrototypeIR' ? { ...a, status: 'ready', lastUpdated: new Date().toLocaleTimeString() } : a
      )
    }));

    // 结果摘要:加了什么、跳过了什么、主控状态 —— 如实告知,不静默
    const parts: string[] = [];
    parts.push(`已应用 ${newComponents.length} 个组件到画布${mcuBase ? `(主控:${mcuBase.name})` : ''}。`);
    if (mcus.length > 1) parts.push(`⚠ 方案含 ${mcus.length} 个主控,已按第一个(${mcuBase!.name})作为中心,请确认是否需要多主控。`);
    if (!mcuBase && newComponents.length > 0) parts.push(`⚠ 方案中没有主控。未自动添加默认主控——请在库中选择一块主控板加入,或告诉我你的主控偏好。`);
    if (skipped.length > 0) parts.push(`⚠ 以下 ID 在当前模块库中不存在,已跳过:${skipped.join('、')}。`);
    setAiHistory(prev => [...prev, { id: `apply-${Date.now()}`, role: 'assistant', text: parts.join('\n') }]);
  };

  const addComponent = (id: string, x?: number, y?: number) => {
    const base = state.library.find(c => c.id === id);
    if (!base) return;
    const count = state.components.length;
    const isPcb = state.mode === WorkflowMode.PCB;
    const newComp: CanvasComponent = {
      ...base,
      instanceId: `${id}-${Date.now()}`,
      x: x ?? (100 + (count % 3) * 80),
      y: y ?? (100 + Math.floor(count / 3) * 150),
      pcbX: x ?? (30 + (count % 4) * 40),
      pcbY: y ?? (30 + Math.floor(count / 4) * 40),
      isSimplified: isPcb,
      isChipOnly: false
    };
    setState(prev => ({ ...prev, components: [...prev.components, newComp], selectedComponentId: newComp.instanceId, status: 'running' }));
  };

  const updatePosition = (instanceId: string, x: number, y: number) => {
    setState(prev => ({
      ...prev,
      components: prev.components.map(c => c.instanceId === instanceId ? (prev.mode === WorkflowMode.PCB ? { ...c, pcbX: x, pcbY: y } : { ...c, x, y }) : c)
    }));
  };

  const removeComponent = (instanceId: string) => {
    setState(prev => ({ ...prev, components: prev.components.filter(c => c.instanceId !== instanceId), selectedComponentId: prev.selectedComponentId === instanceId ? null : prev.selectedComponentId }));
  };

  const toggleMode = (newMode?: WorkflowMode) => {
    setState(prev => {
      const mode = newMode || (prev.mode === WorkflowMode.PROTOTYPE ? WorkflowMode.PCB : WorkflowMode.PROTOTYPE);
      const isSwitchingToPcb = mode === WorkflowMode.PCB;
      return {
        ...prev,
        mode,
        currentStep: 0,
        status: isSwitchingToPcb ? 'ready' : 'running',
        components: prev.components.map(c => ({ ...c, isSimplified: isSwitchingToPcb, isChipOnly: isSwitchingToPcb ? c.isChipOnly : false }))
      };
    });
  };

  const handleAISubmit = async (input: string) => {
    const userMsg: AIAgentMessage = { id: Date.now().toString(), role: 'user', text: input };
    const updatedHistory = [...aiHistory, userMsg];
    setAiHistory(updatedHistory);
    setIsProcessing(true);
    const result = await generateAIAssistance(input, state, updatedHistory);
    const aiMsg: AIAgentMessage = { 
      id: (Date.now() + 1).toString(), 
      role: 'assistant', 
      text: result.text, 
      cards: result.cards,
      options: result.options 
    };
    setAiHistory(prev => [...prev, aiMsg]);
    setIsProcessing(false);
  };

  const renderMainContent = () => {
    if (state.mode === WorkflowMode.PROTOTYPE) {
      switch (state.currentStep) {
        case 0: return <Canvas state={state} setState={setState} onRemove={removeComponent} onAdd={addComponent} onUpdatePosition={updatePosition} />;
        case 1: return <WiringView state={state} setState={setState} />;
        case 2: return <FirmwareView state={state} setState={setState} />;
        case 3: return <EnclosureView state={state} setState={setState} />;
        case 4: return <ValidationView state={state} onProceed={() => toggleMode(WorkflowMode.PCB)} />;
        default: return <Canvas state={state} setState={setState} onRemove={removeComponent} onAdd={addComponent} onUpdatePosition={updatePosition} />;
      }
    } else {
      switch (state.currentStep) {
        case 0: return <SchematicView state={state} setState={setState} />;
        case 1: return <HardwareClippingView state={state} setState={setState} />;
        case 2: return <PCBConstraintView state={state} setState={setState} />;
        case 3: return <PCBRoutingView state={state} setState={setState} />;
        case 4: return <PCBRoutingView state={state} setState={setState} isRouting />;
        case 5: return <ValidationView state={state} isManufacturing />;
        default: return <Canvas state={state} setState={setState} onRemove={removeComponent} onAdd={addComponent} onUpdatePosition={updatePosition} />;
      }
    }
  };

  // 关键优化：只有在第一步（意图识别）且处于原型设计模式时才显示全局浮动 AI 助手
  const showGlobalAI = state.mode === WorkflowMode.PROTOTYPE && state.currentStep === 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ErrorBoundary scope="app">
          <Header onReset={resetProject} projectName="智能硬件快速迭代项目" onModeToggle={toggleMode} mode={state.mode} />
          </ErrorBoundary>
      {libraryLoading && (
        <div className="bg-amber-500/10 text-amber-700 text-xs px-4 py-1.5 border-b border-amber-500/20 text-center">
          正在从云端模块平台加载硬件库…
        </div>
      )}
      <WorkflowProgress steps={state.mode === WorkflowMode.PROTOTYPE ? PROTOTYPE_STEPS : PCB_STEPS} currentStep={state.currentStep} setStep={(s) => setState(prev => ({ ...prev, currentStep: s }))} />
      <div className="flex flex-1 overflow-hidden relative">
        {!leftPanelCollapsed && (
          <ErrorBoundary scope="app">
          <Sidebar 
            requirements={requirements}
            onDecide={recordDecision}
            onRemoveDecision={removeDecision}
            mode={state.mode} 
            state={state} 
            setState={setState} 
            aiHistory={aiHistory}
            onAISend={handleAISubmit}
            onApplySolution={applySolution}
            isProcessing={isProcessing}
            onCollapse={() => setLeftPanelCollapsed(true)}
          />
          </ErrorBoundary>
        )}
        <main className="flex-1 overflow-y-auto bg-slate-100/50 relative min-w-0">
          <ErrorBoundary scope="app">
            {renderMainContent()}
          </ErrorBoundary>
          {/* 左栏收起时显示展开按钮 */}
          {leftPanelCollapsed && (
            <button
              onClick={() => setLeftPanelCollapsed(false)}
              className="absolute top-4 left-4 z-30 px-3 py-2 bg-white border border-ink-200 rounded-eng-lg shadow-md text-body font-semibold text-ink-600 hover:text-ink-900 hover:shadow-lg transition-all flex items-center gap-1.5"
              title="展开模块库"
            >
              <span>▶</span> 模块库
            </button>
          )}
          {/* 右栏收起时显示展开按钮 */}
          {rightPanelCollapsed && (
            <button
              onClick={() => setRightPanelCollapsed(false)}
              className="absolute top-4 right-4 z-30 px-3 py-2 bg-white border border-ink-200 rounded-eng-lg shadow-md text-body font-semibold text-ink-600 hover:text-ink-900 hover:shadow-lg transition-all flex items-center gap-1.5"
              title="展开面板"
            >
              <span>◀</span> 面板
            </button>
          )}
        </main>
        {!rightPanelCollapsed && (
          <ErrorBoundary scope="app">
          <RightPanel
            state={state}
            setState={setState}
            onModeChange={(m) => setState(prev => ({ ...prev, mode: m }))}
            onCollapse={() => setRightPanelCollapsed(true)}
          />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
};

export default App;
