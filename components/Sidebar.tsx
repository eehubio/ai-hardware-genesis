
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { WorkflowMode, ProjectState, ComponentType, HardwareComponent } from '../types';
import { getDatabaseComponents, saveDatabaseComponent, resetDatabaseToDefaults } from '../services/dbService';
import AIAssistant from './AIAssistant';

interface SidebarProps {
  mode: WorkflowMode;
  state: ProjectState;
  setState: React.Dispatch<React.SetStateAction<ProjectState>>;
  // AI Agent props passed from parent
  aiHistory: any[];
  onAISend: (input: string) => void;
  onApplySolution: (ids: string[]) => void;
  isProcessing: boolean;
  onCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  mode, 
  state, 
  setState,
  aiHistory,
  onAISend,
  onApplySolution,
  isProcessing,
  onCollapse
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'assistant'>('library');
  const [filter, setFilter] = useState<string | 'all'>('all');
  const [showDbModal, setShowDbModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [pinsTable, setPinsTable] = useState<Array<{ pinNumber: string; pinName: string }>>([]);

  // Netlist Analyzer states
  const [isParsingNetlist, setIsParsingNetlist] = useState(false);
  const [netlistError, setNetlistError] = useState<string | null>(null);
  const [netlistResult, setNetlistResult] = useState<any | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [showAnalysisReport, setShowAnalysisReport] = useState(false);
  
  // New Component Form states
  const [formData, setFormData] = useState({
    id: '', name: '', type: 'sensor' as any, price: 10, sku: '',
    thumb: 'https://qn.eetree.cn/seeed_product_5603_0_eBSlQCo28wEYV8I9grrKShUWN',
    spec: '', description: '', 
    voltageSource: '3.3V / 5.0V', currentDraw: 10,
    connectorType: 'Grove' as any, width: 20, height: 20, depth: 5, weight: 3,
    driverRequired: '', documentationUrl: '', githubUrl: '',
    designFilesInput: '', llmTagsInput: '', pinMappingInput: ''
  });

  const handleEditComponent = (comp: HardwareComponent) => {
    const pinPairs = comp.electrical?.pinMapping 
      ? Object.entries(comp.electrical.pinMapping).map(([name, num]) => ({
          pinNumber: String(num),
          pinName: String(name)
        }))
      : [];
    setPinsTable(pinPairs);

    // Reset netlist parser states
    setNetlistResult(null);
    setNetlistError(null);
    setUploadedFilename(null);
    setIsParsingNetlist(false);

    const pinMappingInput = comp.electrical?.pinMapping 
      ? Object.entries(comp.electrical.pinMapping).map(([pin, sig]) => `${pin}:${sig}`).join(', ') 
      : '';
    setFormData({
      id: comp.id,
      name: comp.name,
      type: comp.type,
      price: comp.price,
      sku: comp.sku || '',
      thumb: comp.thumb || 'https://qn.eetree.cn/seeed_product_5603_0_eBSlQCo28wEYV8I9grrKShUWN',
      spec: comp.spec || '',
      description: comp.description || '',
      voltageSource: comp.voltageSource || '3.3V / 5.0V',
      currentDraw: comp.electrical?.currentDraw || 10,
      connectorType: comp.physical?.connectorType || 'Grove',
      width: comp.physical?.dimensions?.width || 20,
      height: comp.physical?.dimensions?.height || 20,
      depth: comp.physical?.dimensions?.depth || 5,
      weight: comp.physical?.weight || 3,
      driverRequired: comp.driverRequired || comp.software?.requiredLibraries?.[0] || '',
      documentationUrl: comp.software?.documentationUrl || '',
      githubUrl: comp.software?.githubUrl || '',
      designFilesInput: comp.designProjectFiles?.join(', ') || '',
      llmTagsInput: comp.llmPromptTags?.join(', ') || '',
      pinMappingInput
    });
    setIsEditing(true);
    setShowDbModal(true);
  };

  const handleOpenAddModal = () => {
    setPinsTable([
      { pinNumber: '1', pinName: 'GND' },
      { pinNumber: '2', pinName: 'VCC' },
      { pinNumber: '3', pinName: 'SDA' },
      { pinNumber: '4', pinName: 'SCL' }
    ]);
    // Reset netlist parser states
    setNetlistResult(null);
    setNetlistError(null);
    setUploadedFilename(null);
    setIsParsingNetlist(false);

    setFormData({
      id: '', name: '', type: 'sensor' as any, price: 10, sku: '',
      thumb: 'https://qn.eetree.cn/seeed_product_5603_0_eBSlQCo28wEYV8I9grrKShUWN',
      spec: '', description: '',
      voltageSource: '3.3V / 5.0V', currentDraw: 10,
      connectorType: 'Grove' as any, width: 20, height: 20, depth: 5, weight: 3,
      driverRequired: '', documentationUrl: '', githubUrl: '',
      designFilesInput: '', llmTagsInput: '', pinMappingInput: ''
    });
    setIsEditing(false);
    setShowDbModal(true);
  };

  // 将 "全部" 与动态分类结合
  const sidebarCategories = ['all', ...state.categories];

  const filteredLibrary = filter === 'all' 
    ? state.library 
    : state.library.filter(c => c.type === filter);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('componentId', id);
    const img = e.currentTarget.querySelector('img');
    if (img) {
      e.dataTransfer.setDragImage(img, img.offsetWidth / 2, img.offsetHeight / 2);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setState(p => ({
        ...p, 
        dxfUploaded: true, 
        dxfFileName: file.name
      }));
    }
  };

  const handleNetlistUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFilename(file.name);
    setIsParsingNetlist(true);
    setNetlistError(null);
    setNetlistResult(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) {
        setNetlistError('无法读取选择的文件或文件内容为空。');
        setIsParsingNetlist(false);
        return;
      }

      try {
        const response = await fetch('/api/parse-netlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            filename: file.name
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || '解析接口出错');
        }

        const data = await response.json();
        setNetlistResult(data);
        setShowAnalysisReport(true);
      } catch (err: any) {
        console.error('Netlist Analysis Error:', err);
        setNetlistError(err.message || 'AI 深度解析网表失败，请检查网络链接并重试');
      } finally {
        setIsParsingNetlist(false);
      }
    };

    reader.onerror = () => {
      setNetlistError('本地文件读取失败');
      setIsParsingNetlist(false);
    };

    reader.readAsText(file);
  };

  const handleApplyNetlistPins = () => {
    if (!netlistResult || !netlistResult.pins) return;
    setPinsTable(netlistResult.pins);
  };

  const handleApplyNetlistMetadata = () => {
    if (!netlistResult) return;
    setFormData(prev => ({
      ...prev,
      name: netlistResult.componentName || prev.name,
      type: (netlistResult.category?.toLowerCase() === 'mcu' ? 'mcu' : 
             netlistResult.category?.toLowerCase() === 'display' ? 'display' : 
             netlistResult.category?.toLowerCase() === 'actuator' ? 'actuator' : 'sensor') as any,
      description: netlistResult.description || prev.description,
      spec: netlistResult.specifications || prev.spec,
      driverRequired: netlistResult.driverRequired || prev.driverRequired,
      designFilesInput: uploadedFilename ? `${uploadedFilename}, ${prev.designFilesInput}`.replace(/, *$/, '') : prev.designFilesInput
    }));
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(p => ({ ...p, [name]: value }));
  };

  const handleSaveToVercelDb = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const parsedId = formData.id.trim().toLowerCase().replace(/\s+/g, '_') || `custom_${Date.now()}`;
    
    // Parse helper inputs
    const designProjectFiles = formData.designFilesInput 
      ? formData.designFilesInput.split(',').map(s => s.trim()) 
      : [`${parsedId}_v1.0.schlib`, `${parsedId}_v1.0.kicad_mod`];
      
    const llmPromptTags = formData.llmTagsInput 
      ? formData.llmTagsInput.split(',').map(s => s.trim().toLowerCase()) 
      : [parsedId, formData.type, 'Grove', 'Seeed_Genesis_Custom'];

    const pinMapping: Record<string, string> = {};
    if (pinsTable.length > 0) {
      pinsTable.forEach(p => {
        const num = p.pinNumber.trim();
        const name = p.pinName.trim();
        if (num && name) {
          pinMapping[name] = num;
        }
      });
    } else if (formData.pinMappingInput) {
      formData.pinMappingInput.split(',').forEach(item => {
        const parts = item.split(':');
        if (parts.length === 2) {
          pinMapping[parts[0].trim().toUpperCase()] = parts[1].trim().toUpperCase();
        }
      });
    } else {
      pinMapping['SDA'] = 'D4';
      pinMapping['SCL'] = 'D5';
    }

    const newComponent: HardwareComponent = {
      id: parsedId,
      name: formData.name,
      type: formData.type,
      thumb: formData.thumb || 'https://qn.eetree.cn/seeed_product_5603_0_eBSlQCo28wEYV8I9grrKShUWN',
      spec: formData.spec || `${formData.name} - high precision modules`,
      price: Number(formData.price) || 12,
      sku: formData.sku || `1010199${Math.floor(Math.random() * 9)}`,
      electrical: {
        voltageRange: [3.3, 5.0],
        currentDraw: Number(formData.currentDraw) || 15,
        protocols: [formData.type === 'mcu' ? 'I2C' : 'GPIO'],
        pinMapping
      },
      physical: {
        dimensions: { width: Number(formData.width) || 20, height: Number(formData.height) || 20, depth: Number(formData.depth) || 5 },
        weight: Number(formData.weight) || 4,
        connectorType: formData.connectorType
      },
      software: {
        requiredLibraries: formData.driverRequired ? [formData.driverRequired] : [],
        initCodeSnippet: {},
        sampleUsageSnippet: {},
        documentationUrl: formData.documentationUrl || 'https://wiki.seeedstudio.com',
        githubUrl: formData.githubUrl || 'https://github.com/seeed-studio'
      },
      description: formData.description || `${formData.name} 是一款基于 Vercel Serverless云数据库部署的高精尖迭代硬件模块。`,
      functionalities: [`参与系统的物理层物理硬件信号读取与数值分析`, `运行额定工作供电 ${formData.voltageSource || '3.3V'}，额定静态工作电流 ${formData.currentDraw || 15}mA`],
      voltageSource: formData.voltageSource,
      driverRequired: formData.driverRequired,
      referenceProjectUrl: formData.githubUrl,
      designProjectFiles,
      llmPromptTags
    };

    const updatedLibrary = saveDatabaseComponent(newComponent);
    
    setState(p => ({
      ...p,
      library: updatedLibrary,
      categories: Array.from(new Set(updatedLibrary.map(c => c.type)))
    }));

    // Reset Form & Close
    setShowDbModal(false);
    setPinsTable([]);
    setFormData({
      id: '', name: '', type: 'sensor', price: 10, sku: '',
      thumb: 'https://qn.eetree.cn/seeed_product_5603_0_eBSlQCo28wEYV8I9grrKShUWN',
      spec: '', description: '',
      voltageSource: '3.3V / 5.0V', currentDraw: 10,
      connectorType: 'Grove', width: 20, height: 20, depth: 5, weight: 3,
      driverRequired: '', documentationUrl: '', githubUrl: '',
      designFilesInput: '', llmTagsInput: '', pinMappingInput: ''
    });
  };

  const handleResetDb = () => {
    if (window.confirm('您确定要重置 Vercel 云端元器件数据库为 Seeed 预置默认库吗？所有自定义新增的元器件都将被清空。')) {
      const resetLib = resetDatabaseToDefaults();
      setState(p => ({
        ...p,
        library: resetLib,
        categories: Array.from(new Set(resetLib.map(c => c.type)))
      }));
      setShowDbModal(false);
    }
  };

  return (
    <aside className="w-[300px] bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-[10px_0_30px_rgba(0,0,0,0.03)] z-30 transition-all duration-300">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50/30 items-stretch">
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="px-3 text-ink-300 hover:text-ink-600 transition-colors text-sm"
            title="收起模块库"
          >
            ◀
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`flex-1 py-3 text-[11px] font-black uppercase tracking-wider text-center border-b-2 transition-all flex items-center justify-center gap-1.5 min-h-[46px] ${
            activeTab === 'library'
              ? 'border-brand-600 text-brand-700 bg-white'
              : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/60'
          }`}
        >
          <span>📦 硬件元器件库</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assistant')}
          className={`flex-1 py-3 text-[11px] font-black uppercase tracking-wider text-center border-b-2 transition-all flex items-center justify-center gap-1.5 min-h-[46px] relative ${
            activeTab === 'assistant'
              ? 'border-green-600 text-green-700 bg-white'
              : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/60'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span>🤖 智造 AI 设计助手</span>
        </button>
      </div>

      {activeTab === 'assistant' ? (
        <div className="flex-1 overflow-hidden">
          <AIAssistant
            history={aiHistory}
            onSend={onAISend}
            onApplySolution={onApplySolution}
            isProcessing={isProcessing}
            inline
          />
        </div>
      ) : (
        <>
          <div className="p-5 border-b border-slate-100 bg-slate-50/20">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {mode === WorkflowMode.PCB ? 'PCB DESIGN LIBRARY' : 'HARDWARE LIBRARY'}
            </h3>

        {/* Database integration banner */}
        <div className="p-3 mb-4 bg-brand-50 border border-brand-200 rounded-eng-lg flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="text-meta font-semibold text-brand-800 tracking-tight flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              云端模块平台
            </span>
            <span className="text-[8px] text-slate-400 font-mono mt-0.5">libSQL / Turso · Live API</span>
          </div>
          <button
            onClick={() => window.open('https://ai-hardware-genesis-platform.vercel.app/admin', '_blank')}
            className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-eng text-meta font-semibold uppercase transition-all shadow-md hover:scale-[1.03]"
          >
            云库管理
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-1">
          {sidebarCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1.5 rounded-eng text-meta font-semibold transition-all uppercase ${filter === cat ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'}`}
            >
              {cat === 'all' ? '全部' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50/10">
        <div className="text-[9px] text-slate-400 font-bold px-1 mb-3 uppercase tracking-widest">拖拽组件至画布添加</div>
        {state.library.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-40">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest">Loading Library...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredLibrary.map((comp) => (
              <div 
                key={comp.id}
                draggable
                onDragStart={(e) => handleDragStart(e, comp.id)}
                className="group flex flex-col p-2.5 bg-white border border-slate-200 rounded-[20px] hover:border-green-500 hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all relative overflow-hidden cursor-grab active:cursor-grabbing"
              >
                {/* Edit overlay button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleEditComponent(comp);
                  }}
                  className="absolute top-1.5 right-1.5 w-5 h-5 bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white rounded-md flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-all shadow-sm duration-200 z-10 cursor-pointer"
                  title="编辑此器件"
                >
                  ✏️
                </button>

                <div className="w-full h-22 rounded-[14px] bg-slate-50 overflow-hidden border border-slate-100 mb-2 flex items-center justify-center transition-all group-hover:bg-white p-1.5">
                  <img 
                    src={comp.thumb} 
                    alt={comp.name} 
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain drop-shadow-md transition-transform duration-500 group-hover:scale-105 pointer-events-none" 
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex justify-between items-start mb-0.5 min-w-0 gap-1">
                    <div className="text-[10px] font-black text-slate-800 truncate uppercase tracking-tight flex-1" title={comp.name}>{comp.name}</div>
                    <div className="text-[10px] font-black text-green-600 shrink-0">¥{comp.price}</div>
                  </div>
                  <div className="text-[8px] text-slate-400 line-clamp-1 leading-relaxed font-bold uppercase tracking-tighter" title={comp.spec}>{comp.spec}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {filteredLibrary.length === 0 && (
          <div className="text-center py-10 text-[10px] text-slate-300 font-black uppercase tracking-widest">该分类暂无模块</div>
        )}
      </div>

      {mode === WorkflowMode.PCB && (
        <div className="p-5 border-t border-slate-100 bg-slate-50/50">
          <label className="block group mb-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Structural Definition</span>
            <div className={`border-2 border-dashed rounded-[20px] p-4 text-center cursor-pointer transition-all ${state.dxfUploaded ? 'border-green-500 bg-green-50/40' : 'border-slate-200 hover:border-slate-400 bg-white shadow-sm'}`}>
              <input type="file" className="hidden" accept=".dxf" onChange={handleFileUpload} />
              <div className="text-2xl mb-1">{state.dxfUploaded ? '📁' : '🏗️'}</div>
              <div className="text-[9px] text-slate-700 font-black uppercase">
                {state.dxfUploaded ? state.dxfFileName : 'Import DXF'}
              </div>
            </div>
          </label>
        </div>
      )}

        </>
      )}

      {/* Vercel Cloud Database Sync & Adding Component Modal */}
      {showDbModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black tracking-tight uppercase flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                  Vercel Serverless Component Database
                </h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1 font-mono">
                  Environment: vercel-pg-db-pool-01 · State: Connected
                </p>
              </div>
              <button 
                onClick={() => setShowDbModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Scrollable Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col gap-2">
                <div className="text-[11px] font-black text-indigo-800 uppercase">云数据库配置概要信息</div>
                <div className="text-[10px] text-indigo-650 leading-relaxed">
                  当前的左侧元器件库已完全支持直连运行于 Vercel 上的无服务器数据库中。您可以在这里追加任意带有全套描述、管脚定义、驱动程序和物理工程CAD文件的微控制器或传感器模块。
                </div>
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-indigo-150 text-[10px]">
                  <span className="text-indigo-700 font-bold">已同步模块数（Active Objects）: {state.library.length}</span>
                  <button 
                    type="button"
                    onClick={handleResetDb}
                    className="text-rose-600 font-black hover:underline"
                  >
                    🗑️ 重置数据库到默认出厂组件
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveToVercelDb} className="space-y-4">
                <div className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                  {isEditing ? '📝 修改云数据库器件元数据 (Database Update Row)' : '📥 新增云数据库器件元数据 (Database Insert Row)'}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
                      模块唯一 ID (ID Key) {isEditing && <span className="text-indigo-600 font-normal">(只读)</span>}
                    </label>
                    <input 
                      type="text" 
                      name="id" 
                      placeholder="例如: bme280_sensor" 
                      disabled={isEditing}
                      value={formData.id} 
                      onChange={handleFormChange}
                      className={`w-full p-2 text-xs border border-slate-200 rounded-xl font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ${isEditing ? 'bg-slate-100 text-slate-450 cursor-not-allowed' : ''}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">元器件显示名称 *</label>
                    <input 
                      type="text" 
                      name="name" 
                      placeholder="例如: BME280 温湿度传感器" 
                      required 
                      value={formData.name} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">模块分类类型 (Category)</label>
                    <select 
                      name="type" 
                      value={formData.type} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="mcu">主控核心 (MCU)</option>
                      <option value="sensor">环境感知 (Sensor)</option>
                      <option value="display">人机显示 (Display)</option>
                      <option value="actuator">执行动力 (Actuator)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">元器件单价与 SKU 字段</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="number" 
                        name="price" 
                        placeholder="价格 (¥)" 
                        value={formData.price} 
                        onChange={handleFormChange}
                        className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                      />
                      <input 
                        type="text" 
                        name="sku" 
                        placeholder="SKU物料号" 
                        value={formData.sku} 
                        onChange={handleFormChange}
                        className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">图片预览链接 (Thumb Link)</label>
                    <input 
                      type="text" 
                      name="thumb" 
                      value={formData.thumb} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl font-mono focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">一句话简介 (Specification)</label>
                    <input 
                      type="text" 
                      name="spec" 
                      placeholder="例如: Grove - High Precision 3-in-1 Climate Sensor" 
                      value={formData.spec} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">详细描述 (Full Description)</label>
                    <textarea 
                      name="description" 
                      rows={2}
                      placeholder="请描述该数据库元器件的功能、使用限制及智能硬件方案匹配逻辑..."
                      value={formData.description} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">工作电压与供电细节</label>
                    <input 
                      type="text" 
                      name="voltageSource" 
                      placeholder="例如: 3.3V / 5.0V / 锂电池卡槽均支持" 
                      value={formData.voltageSource} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">工作静态电流 (Current Draw - mA)</label>
                    <input 
                      type="number" 
                      name="currentDraw" 
                      value={formData.currentDraw} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">物理尺寸与封装规格</span>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[8px] text-slate-400 uppercase">长宽 (Width-mm)</label>
                        <input type="number" name="width" value={formData.width} onChange={handleFormChange} className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-[8px] text-slate-400 uppercase">纵宽 (Height-mm)</label>
                        <input type="number" name="height" value={formData.height} onChange={handleFormChange} className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-[8px] text-slate-400 uppercase">厚/深度 (Depth-mm)</label>
                        <input type="number" name="depth" value={formData.depth} onChange={handleFormChange} className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-[8px] text-slate-400 uppercase">净重 (Weight-g)</label>
                        <input type="number" name="weight" value={formData.weight} onChange={handleFormChange} className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg" />
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 bg-slate-55 border border-slate-200/90 rounded-2xl p-4 space-y-3 shadow-inner">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                      <div>
                        <span className="block text-[11px] font-black text-slate-700 uppercase tracking-wide">⚙️ 物理管脚与标准化信号定义 (Standardised Pin Mapping)</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">定义其管脚编号与标准化硬件信号命名，可用于后期高速通路自适应追踪。</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 self-start sm:self-center">
                        <div className="relative group">
                          <button
                            type="button"
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold border border-slate-200/80 transition-colors"
                          >
                            ⚡ 选型标准模板
                          </button>
                          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 hidden group-hover:block z-50 w-48">
                            <button
                              type="button"
                              onClick={() => setPinsTable([
                                { pinNumber: '1', pinName: 'GND' },
                                { pinNumber: '2', pinName: 'VCC' },
                                { pinNumber: '3', pinName: 'SDA' },
                                { pinNumber: '4', pinName: 'SCL' }
                              ])}
                              className="w-full text-left px-2 py-1.5 text-[9px] hover:bg-indigo-50 hover:text-indigo-600 font-medium rounded-lg transition-colors"
                            >
                              Grove I2C (GND, VCC, SDA, SCL)
                            </button>
                            <button
                              type="button"
                              onClick={() => setPinsTable([
                                { pinNumber: '1', pinName: 'GND' },
                                { pinNumber: '2', pinName: 'VCC' },
                                { pinNumber: '3', pinName: 'TX' },
                                { pinNumber: '4', pinName: 'RX' }
                              ])}
                              className="w-full text-left px-2 py-1.5 text-[9px] hover:bg-indigo-50 hover:text-indigo-600 font-medium rounded-lg transition-colors border-t border-slate-100"
                            >
                              Grove UART (GND, VCC, TX, RX)
                            </button>
                            <button
                              type="button"
                              onClick={() => setPinsTable([
                                { pinNumber: '1', pinName: 'GND' },
                                { pinNumber: '2', pinName: 'VCC' },
                                { pinNumber: '3', pinName: 'MISO' },
                                { pinNumber: '4', pinName: 'MOSI' },
                                { pinNumber: '5', pinName: 'SCK' },
                                { pinNumber: '6', pinName: 'CS' }
                              ])}
                              className="w-full text-left px-2 py-1.5 text-[9px] hover:bg-indigo-50 hover:text-indigo-600 font-medium rounded-lg transition-colors border-t border-slate-100"
                            >
                              SPI 高速串行 (6-PIN)
                            </button>
                            <button
                              type="button"
                              onClick={() => setPinsTable([
                                { pinNumber: 'D4', pinName: 'SDA' },
                                { pinNumber: 'D5', pinName: 'SCL' },
                                { pinNumber: 'D6', pinName: 'TX' },
                                { pinNumber: 'D7', pinName: 'RX' },
                                { pinNumber: 'D8', pinName: 'SCK' },
                                { pinNumber: 'D9', pinName: 'MISO' },
                                { pinNumber: 'D10', pinName: 'MOSI' }
                              ])}
                              className="w-full text-left px-2 py-1.5 text-[9px] hover:bg-indigo-50 hover:text-indigo-600 font-medium rounded-lg transition-colors border-t border-slate-100"
                            >
                              MCU 全功能引脚集 (FPGA / Dev Core)
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const input = prompt("请输入 CSV 映射或以换行逗号/冒号隔开的名单，例如:\n1,GND\n2,3V3\n3,SDA\n4,SCL\n\n(支持直接复制 Excel 整列单元格):");
                            if (input) {
                              const lines = input.split('\n');
                              const importedPairs: Array<{ pinNumber: string; pinName: string }> = [];
                              lines.forEach(l => {
                                const trimL = l.trim();
                                if (!trimL) return;
                                const parts = trimL.split(/[,:;\t]+/);
                                if (parts.length >= 2) {
                                  importedPairs.push({
                                    pinNumber: parts[0].trim().toUpperCase(),
                                    pinName: parts[1].trim().toUpperCase()
                                  });
                                }
                              });
                              if (importedPairs.length > 0) {
                                setPinsTable(importedPairs);
                              }
                            }
                          }}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded-lg transition-colors"
                        >
                          📥 粘贴导入 (CSV / Excel)
                        </button>
                      </div>
                    </div>

                    {/* CSV file picker */}
                    <div className="relative border border-dashed border-slate-300 rounded-xl p-2 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors">
                      <label className="w-full text-center cursor-pointer">
                        <span className="text-[10px] font-semibold text-slate-500">📎 点击上传本地 `.csv` 或 `.txt` 引脚映射文件自动加载</span>
                        <input
                          type="file"
                          accept=".csv,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const text = event.target?.result as string;
                                if (text) {
                                  const lines = text.split('\n');
                                  const importedPairs: Array<{ pinNumber: string; pinName: string }> = [];
                                  lines.forEach(l => {
                                    const trimL = l.trim();
                                    if (!trimL) return;
                                    const parts = trimL.split(/[,:;\t]+/);
                                    if (parts.length >= 2) {
                                      importedPairs.push({
                                        pinNumber: parts[0].trim().toUpperCase(),
                                        pinName: parts[1].trim().toUpperCase()
                                      });
                                    }
                                  });
                                  if (importedPairs.length > 0) {
                                    setPinsTable(importedPairs);
                                  }
                                }
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* Table headers */}
                    <div className="grid grid-cols-12 gap-2 text-[8px] font-black text-slate-400 uppercase tracking-widest px-2 pt-1 border-t border-slate-200/40">
                      <div className="col-span-1">序号</div>
                      <div className="col-span-5">管脚编号 / 物理引脚</div>
                      <div className="col-span-5">管脚名称 (信号Label)</div>
                      <div className="col-span-1 text-right">操作</div>
                    </div>

                    {/* Pin Rows */}
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {pinsTable.map((pVal, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-xl border border-slate-200/80 hover:border-indigo-400 focus-within:border-indigo-400 shadow-sm transition-colors">
                          <span className="col-span-1 text-[10px] font-mono font-bold text-slate-300 text-center">{idx + 1}</span>
                          
                          <div className="col-span-5">
                            <input
                              type="text"
                              value={pVal.pinNumber}
                              required
                              placeholder="e.g. 1 或 D4"
                              onChange={(e) => {
                                const val = e.target.value;
                                setPinsTable(prev => prev.map((p, pIdx) => pIdx === idx ? { ...p, pinNumber: val } : p));
                              }}
                              className="w-full text-xs font-mono p-1 bg-slate-55 border border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:outline-none"
                            />
                          </div>

                          <div className="col-span-5 flex gap-1 items-center">
                            <input
                              type="text"
                              value={pVal.pinName}
                              required
                              placeholder="e.g. SDA"
                              onChange={(e) => {
                                const val = e.target.value;
                                setPinsTable(prev => prev.map((p, pIdx) => pIdx === idx ? { ...p, pinName: val } : p));
                              }}
                              className="w-full text-xs font-mono p-1 bg-slate-55 border border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:outline-none"
                            />
                            
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) {
                                  setPinsTable(prev => prev.map((p, pIdx) => pIdx === idx ? { ...p, pinName: val } : p));
                                }
                              }}
                              className="text-[9px] bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 font-bold p-1 rounded-md cursor-pointer transition-colors max-w-[50px]"
                            >
                              <option value="" disabled>选择</option>
                              <option value="GND">GND</option>
                              <option value="VCC">VCC</option>
                              <option value="3V3">3V3</option>
                              <option value="5V">5V</option>
                              <option value="SDA">SDA</option>
                              <option value="SCL">SCL</option>
                              <option value="TX">TX</option>
                              <option value="RX">RX</option>
                              <option value="MISO">MISO</option>
                              <option value="MOSI">MOSI</option>
                              <option value="SCK">SCK</option>
                              <option value="CS">CS</option>
                              <option value="A0">A0</option>
                              <option value="A1">A1</option>
                            </select>
                          </div>

                          <div className="col-span-1 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setPinsTable(prev => prev.filter((_, pIdx) => pIdx !== idx));
                              }}
                              className="hover:bg-rose-50 text-slate-400 hover:text-rose-500 p-1 rounded-md transition-colors text-[11px]"
                              title="删除此管脚"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}

                      {pinsTable.length === 0 && (
                        <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-[10px] font-medium">
                          🚫 暂无引脚映射规则，点击下方“逐行新增”或“标准模板”导入，确保路由及追踪畅通。
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPinsTable(prev => [...prev, { pinNumber: '', pinName: '' }]);
                        }}
                        className="flex-1 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 font-bold rounded-xl text-[10px] text-slate-600 transition-all flex items-center justify-center gap-1 shadow-sm"
                      >
                        ➕ 逐行新增管脚 (Add New Row)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPinsTable([])}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 text-[10px] font-bold rounded-xl transition-all"
                      >
                        清空管脚
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">推荐驱动软件库 (Driver Required)</label>
                    <input 
                      type="text" 
                      name="driverRequired" 
                      placeholder="e.g. Adafruit_BME280_Library" 
                      value={formData.driverRequired} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
                      设计工程文件 (Format: file1.schlib, file2.kicad_mod)
                    </label>
                    <input 
                      type="text" 
                      name="designFilesInput" 
                      placeholder="e.g. module.schlib, module.kicad_mod" 
                      value={formData.designFilesInput} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl font-mono focus:border-indigo-500"
                    />
                  </div>

                  {/* Netlist & Schematic AI Deep Analyzer Section */}
                  <div className="col-span-2 bg-gradient-to-br from-indigo-50/50 to-slate-50 border border-indigo-150/60 rounded-2xl p-4 mt-2">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-[11px] font-black text-indigo-900 uppercase flex items-center gap-1.5">
                          ⚡ AI 智能 Netlist 与 KiCad 原理图深度分析
                        </h4>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          支持上传 `.net` (Netlist)、`.kicad_sch` (KiCad原理图) 或 `.lib` 等工程文件。AI 将自动分析电气网络连接关系，智能推荐并一键填充管脚定义及元器件元数据。
                        </p>
                      </div>
                      <span className="bg-indigo-100 text-indigo-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                        Netlist AI v2.2
                      </span>
                    </div>

                    <div className="relative border-2 border-dashed border-indigo-200 hover:border-indigo-500 rounded-xl p-3 bg-white flex flex-col items-center justify-center transition-colors animate-pulse-slight">
                      <label className="w-full text-center cursor-pointer flex flex-col items-center justify-center gap-1.5">
                        <span className="text-[18px]">📦</span>
                        <span className="text-[10px] font-bold text-slate-600">
                          {uploadedFilename ? `✅ 已选择: ${uploadedFilename}` : "拖拽或点击上传本地 Netlist / KiCad 原理图文件"}
                        </span>
                        <span className="text-[8px] text-slate-400 block">
                          支持格式: .net / .kicad_sch / .lib / .xml / .txt
                        </span>
                        <input
                          type="file"
                          accept=".net,.kicad_sch,.lib,.xml,.txt"
                          className="hidden"
                          onChange={handleNetlistUpload}
                          disabled={isParsingNetlist}
                        />
                      </label>
                    </div>

                    {isParsingNetlist && (
                      <div className="mt-3 flex items-center justify-center gap-2 py-3 bg-indigo-50/20 border border-indigo-100/50 rounded-xl animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                        <span className="text-[10px] text-indigo-800 font-bold animate-pulse">
                          AI 深度网络连接关系分析中，大约需要 5~10 秒，请稍后...
                        </span>
                      </div>
                    )}

                    {netlistError && (
                      <div className="mt-3 p-2 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-[10px] font-bold flex justify-between items-center">
                        <span>⚠️ {netlistError}</span>
                        <button type="button" onClick={() => setNetlistError(null)} className="text-rose-500 hover:text-rose-700 text-xs">✕</button>
                      </div>
                    )}

                    {netlistResult && (
                      <div className="mt-4 space-y-3">
                        <div className="bg-indigo-900 text-white rounded-xl p-3 shadow-md flex justify-between items-center">
                          <div>
                            <div className="text-[9px] text-indigo-300 font-black tracking-widest uppercase">
                              🎉 智能提取成功 · {netlistResult.category}
                            </div>
                            <div className="text-xs font-black mt-0.5">
                              {netlistResult.componentName}
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={handleApplyNetlistMetadata}
                              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-indigo-950 text-[10px] font-black rounded-lg transition-all shadow-sm flex items-center gap-1"
                            >
                              ✨ 填入元数据
                            </button>
                            <button
                              type="button"
                              onClick={handleApplyNetlistPins}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-550 border border-indigo-550 text-white text-[10px] font-black rounded-lg transition-all shadow-sm flex items-center gap-1"
                            >
                              🔌 注入管脚映射
                            </button>
                          </div>
                        </div>

                        {netlistResult.pins && netlistResult.pins.length > 0 && (
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                              📌 AI 识别的物理引脚与系统信号映射 (Standardized Pin Mapping)
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {netlistResult.pins.map((pin: any, index: number) => (
                                <div key={index} className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-[9px] font-mono flex items-center gap-1.5">
                                  <span className="font-bold text-indigo-700">Pin {pin.pinNumber}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-slate-700 font-bold uppercase">{pin.pinName}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                          <button
                            type="button"
                            onClick={() => setShowAnalysisReport(!showAnalysisReport)}
                            className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-750 text-white text-[9px] font-black uppercase tracking-wider flex justify-between items-center transition-colors"
                          >
                            <span>📖 智能电气网络（Netlist）深度连接分析报告</span>
                            <span>{showAnalysisReport ? '▲ 收起' : '▼ 展开'}</span>
                          </button>
                          
                          {showAnalysisReport && (
                            <div className="p-3 text-[10px] text-slate-300 leading-normal prose prose-invert max-h-[180px] overflow-y-auto">
                              <ReactMarkdown>{netlistResult.netlistAnalysisReport}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Datasheet URL 规格链接</label>
                    <input 
                      type="text" 
                      name="documentationUrl" 
                      placeholder="https://..." 
                      value={formData.documentationUrl} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">参考项目 / Git 源码</label>
                    <input 
                      type="text" 
                      name="githubUrl" 
                      placeholder="https://github.com/..." 
                      value={formData.githubUrl} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
                      LLM AI 认知标识标签 (Split by commas)
                    </label>
                    <input 
                      type="text" 
                      name="llmTagsInput" 
                      placeholder="e.g. climate_sensor, i2c, high_precision, esp32" 
                      value={formData.llmTagsInput} 
                      onChange={handleFormChange}
                      className="w-full p-2 text-xs border border-slate-200 rounded-xl font-mono focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-4 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowDbModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button 
                    type="submit" 
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg"
                  >
                    💾 写入云端 Vercel Database Row
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
