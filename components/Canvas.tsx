
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { WorkflowMode, ProjectState, CanvasComponent, PCBFootprint } from '../types';
import { normalizePinMapping } from '../utils/safe';
import ErrorBoundary from './ErrorBoundary';

interface CanvasProps {
  state: ProjectState;
  setState: React.Dispatch<React.SetStateAction<ProjectState>>;
  onRemove: (id: string) => void;
  onAdd: (id: string, x: number, y: number) => void;
  onUpdatePosition: (instanceId: string, x: number, y: number) => void;
}

const FOOTPRINT_SCALE = 5;

const Canvas: React.FC<CanvasProps> = ({ state, setState, onRemove, onAdd, onUpdatePosition }) => {
  const isPcb = state.mode === WorkflowMode.PCB;
  const canvasRef = useRef<HTMLDivElement>(null);
  
  const [activeDrag, setActiveDrag] = useState<{ id: string; x: number; y: number; isImage?: boolean } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); 
  const [scale, setScale] = useState(1);

  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  const [compOffset, setCompOffset] = useState({ x: 0, y: 0 });

  const requestRef = useRef<number>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleWheelRaw = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(scaleRef.current * delta, 0.1), 10);
      
      const xBefore = (mouseX - panRef.current.x) / scaleRef.current;
      const yBefore = (mouseY - panRef.current.y) / scaleRef.current;
      
      const newPanX = mouseX - xBefore * newScale;
      const newPanY = mouseY - yBefore * newScale;
      
      scaleRef.current = newScale;
      panRef.current = { x: newPanX, y: newPanY };
      
      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    };

    el.addEventListener('wheel', handleWheelRaw, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelRaw);
  }, []);

  const handleMouseDown = (e: React.MouseEvent, id?: string, currentX?: number, currentY?: number, isImage?: boolean) => {
    if (id !== undefined && currentX !== undefined && currentY !== undefined) {
      e.stopPropagation();
      if (!canvasRef.current) return;

      // Ensure that when a component is clicked, we update the global focused state so the Vercel DB inspector reflects it instantly
      if (!isImage) {
        setState(prev => ({ ...prev, selectedComponentId: id }));
      }
      
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseXInCanvas = (e.clientX - rect.left - panRef.current.x) / scaleRef.current;
      const mouseYInCanvas = (e.clientY - rect.top - panRef.current.y) / scaleRef.current;

      setActiveDrag({ id, x: currentX, y: currentY, isImage });
      setCompOffset({
        x: mouseXInCanvas - currentX,
        y: mouseYInCanvas - currentY
      });
    } else if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setDragStart({
        x: e.clientX - panRef.current.x,
        y: e.clientY - panRef.current.y
      });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    requestRef.current = requestAnimationFrame(() => {
      if (activeDrag && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseXInCanvas = (e.clientX - rect.left - panRef.current.x) / scaleRef.current;
        const mouseYInCanvas = (e.clientY - rect.top - panRef.current.y) / scaleRef.current;
        
        const newX = mouseXInCanvas - compOffset.x;
        const newY = mouseYInCanvas - compOffset.y;
        
        setActiveDrag(prev => prev ? ({ ...prev, x: newX, y: newY }) : null);
      } else if (isPanning) {
        const newPan = {
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        };
        panRef.current = newPan;
        setPan(newPan);
      }
    });
  }, [activeDrag, isPanning, dragStart, compOffset]);

  const handleMouseUp = useCallback(() => {
    if (activeDrag) {
      if (activeDrag.isImage) {
        setState(prev => ({
          ...prev,
          pastedImages: prev.pastedImages?.map(img => 
            img.id === activeDrag.id ? { ...img, x: activeDrag.x, y: activeDrag.y } : img
          )
        }));
      } else {
        onUpdatePosition(activeDrag.id, activeDrag.x, activeDrag.y);
      }
      setActiveDrag(null);
    }
    setIsPanning(false);
  }, [activeDrag, onUpdatePosition, setState]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('componentId');
    if (!id || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const dropX = (e.clientX - rect.left - panRef.current.x) / scaleRef.current;
    const dropY = (e.clientY - rect.top - panRef.current.y) / scaleRef.current;
    
    onAdd(id, dropX, dropY);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleToggleView = (e: React.MouseEvent, instanceId: string) => {
    e.stopPropagation();
    setState(prev => ({
      ...prev,
      components: prev.components.map(c => c.instanceId === instanceId ? { ...c, isChipOnly: !c.isChipOnly } : c)
    }));
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [handleMouseMove, handleMouseUp]);

  const mcu = state.components.find(c => c.type === 'mcu' || c.type === 'processor');
  
  const getBusInfo = (comp: CanvasComponent, index: number) => {
    const protos = (comp.electrical?.protocols || []).map(p => String(p).toUpperCase());
    const spec = (comp.spec || '').toLowerCase();
    if (protos.includes('I2C') || spec.includes('i2c')) return { label: 'I2C', color: '#3b82f6', pins: ['D4', 'D5'], pinNames: ['SDA', 'SCL'] };
    if (protos.includes('SPI') || spec.includes('spi')) return { label: 'SPI', color: '#a855f7', pins: ['D8', 'D9', 'D10'], pinNames: ['SCK', 'MISO', 'MOSI'] };
    if (protos.includes('UART') || spec.includes('uart')) return { label: 'UART', color: '#eab308', pins: ['D6', 'D7'], pinNames: ['TX', 'RX'] };
    return { label: 'GPIO', color: '#22c55e', pins: [`D${index % 4}`], pinNames: ['IO'] };
  };

  const connections = useMemo(() => {
    if (!mcu) return [];
    
    return state.components
      .filter(c => c.type !== 'mcu')
      .map((c, idx) => {
        const busInfo = getBusInfo(c, idx);
        
        const getPos = (comp: CanvasComponent) => {
          if (activeDrag && activeDrag.id === comp.instanceId) {
            return { x: activeDrag.x, y: activeDrag.y };
          }
          return isPcb ? { x: comp.pcbX ?? comp.x, y: comp.pcbY ?? comp.y } : { x: comp.x, y: comp.y };
        };

        const cPos = getPos(c);
        const mPos = getPos(mcu);

        const getCenterOffset = (comp: CanvasComponent) => {
          if (isPcb) {
            const fp = comp.isChipOnly ? comp.footprint : comp.moduleFootprint;
            if (fp) return { x: (fp.width * FOOTPRINT_SCALE) / 2, y: (fp.height * FOOTPRINT_SCALE) / 2 };
          }
          return { x: 128, y: 100 }; 
        };

        const from = { x: (cPos.x || 0) + getCenterOffset(c).x, y: (cPos.y || 0) + getCenterOffset(c).y };
        const to = { x: (mPos.x || 0) + getCenterOffset(mcu).x, y: (mPos.y || 0) + getCenterOffset(mcu).y };

        return { 
          from,
          to,
          color: busInfo.color, 
          pins: busInfo.pins, 
          pinNames: busInfo.pinNames, 
          peripheralPins: busInfo.pinNames.map(name => c.electrical?.pinMapping?.[name] || c.electrical?.pinMapping?.[name.toUpperCase()] || ''),
          compName: c.name,
          label: busInfo.label
        };
      });
  }, [state.components, mcu, activeDrag, isPcb]);

  const mcuPinUsage = connections.reduce((acc, conn) => {
    conn.pins.forEach((p, i) => {
      const pPin = conn.peripheralPins[i];
      const peripheralLabel = pPin ? `${conn.pinNames[i]} (Pin ${pPin})` : conn.pinNames[i];
      const entry = `${peripheralLabel} (${conn.compName.replace('Grove ', '')})`;
      
      if (!acc[p]) {
        acc[p] = [];
      }
      acc[p].push(entry);
    });
    return acc;
  }, {} as Record<string, string[]>);

  const renderFootprint = (footprint: PCBFootprint, designator: string, instanceId: string) => {
    const w = footprint.width * FOOTPRINT_SCALE;
    const h = footprint.height * FOOTPRINT_SCALE;
    return (
      <div className="relative border border-white/40 bg-slate-900 shadow-2xl overflow-visible group" style={{ width: `${w}px`, height: `${h}px` }}>
        <div className="absolute inset-0.5 border border-[#fbbf24] opacity-80 pointer-events-none" />
        <div className="absolute -top-4 left-0 text-[8px] font-mono font-bold text-[#fbbf24] uppercase">{designator}</div>
        <button onClick={(e) => handleToggleView(e, instanceId)} className="absolute -right-4 top-0 w-4 h-4 bg-indigo-600 rounded text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 text-white shadow-lg transition-all z-30">⚡</button>
        {footprint.pins.map(pin => {
          const usageList = mcuPinUsage[pin.name];
          const usageStr = usageList ? usageList.join(', ') : '';
          return (
            <div key={pin.id} className="absolute flex items-center justify-center" style={{ left: `${pin.x * FOOTPRINT_SCALE}px`, top: `${pin.y * FOOTPRINT_SCALE}px`, width: '4px', height: '6px', backgroundColor: '#c0c0c0', transform: 'translate(-50%, -50%)' }}>
               {usageStr && <div className="absolute left-6 whitespace-nowrap text-[6px] font-bold text-[#fbbf24] bg-black/60 px-1 rounded backdrop-blur-sm pointer-events-none">{usageStr}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div 
      ref={canvasRef} 
      onMouseDown={(e) => handleMouseDown(e)} 
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`w-full h-full relative overflow-hidden transition-colors duration-500 ${isPcb ? 'pcb-grid' : 'canvas-bg'} ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <div className="w-full h-full relative" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0', transition: (activeDrag || isPanning) ? 'none' : 'transform 0.05s linear' }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
          {connections.map((conn, idx) => {
            const midX = (conn.from.x + conn.to.x) / 2;
            const midY = (conn.from.y + conn.to.y) / 2;
            return (
              <g key={idx}>
                <path 
                  d={`M ${conn.from.x} ${conn.from.y} C ${conn.from.x} ${conn.to.y}, ${conn.to.x} ${conn.from.y}, ${conn.to.x} ${conn.to.y}`} 
                  stroke={isPcb ? "#fbbf24" : conn.color} 
                  strokeWidth={isPcb ? "1.5" : "3"} 
                  fill="none" 
                  strokeDasharray={isPcb ? "2,2" : "8,6"} 
                  style={{ 
                    opacity: isPcb ? 0.8 : 0.5,
                    filter: isPcb ? 'drop-shadow(0 0 2px #fbbf24)' : 'none'
                  }} 
                />
                {!isPcb && (
                  <g transform={`translate(${midX - 25}, ${midY - 12})`}>
                    <rect width="50" height="24" rx="12" fill="white" stroke={conn.color} strokeWidth="1.5" className="shadow-lg" />
                    <text x="25" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill={conn.color}>{conn.label}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        <div className="relative w-full h-full">
          {isPcb && <div className="absolute bg-[#1a4a2a] border-4 border-[#37a159] rounded-sm shadow-2xl" style={{ width: `${state.pcbConstraints.width * 5}px`, height: `${state.pcbConstraints.height * 5}px`, left: '200px', top: '200px' }} />}
          
          {state.pastedImages?.map((img) => {
            const isBeingDragged = activeDrag && activeDrag.id === img.id && activeDrag.isImage;
            const x = isBeingDragged ? activeDrag!.x : img.x;
            const y = isBeingDragged ? activeDrag!.y : img.y;
            return (
              <div 
                key={img.id}
                onMouseDown={(e) => handleMouseDown(e, img.id, x, y, true)}
                className={`absolute z-10 transition-shadow group ${isBeingDragged ? 'shadow-2xl scale-105' : 'shadow-lg'}`}
                style={{ left: `${x}px`, top: `${y}px`, width: `${img.width}px` }}
              >
                <img src={img.url} className="w-full h-auto rounded-lg border-2 border-white shadow-xl" draggable={false} />
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setState(prev => ({ ...prev, pastedImages: prev.pastedImages?.filter(i => i.id !== img.id) }));
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] shadow-lg"
                >✕</button>
              </div>
            );
          })}

          {state.components.map((comp) => {
            const isBeingDragged = activeDrag && activeDrag.id === comp.instanceId;
            const currentX = isBeingDragged ? activeDrag!.x : (isPcb ? (comp.pcbX ?? comp.x) : comp.x);
            const currentY = isBeingDragged ? activeDrag!.y : (isPcb ? (comp.pcbY ?? comp.y) : comp.y);
            const designator = `U${comp.instanceId.split('-')[1].slice(-3)}`;
            const isMcu = comp.type === 'mcu' || comp.type === 'processor';
            
            return (
              <div 
                key={comp.instanceId} 
                onMouseDown={(e) => handleMouseDown(e, comp.instanceId, currentX, currentY)} 
                style={{ left: `${currentX}px`, top: `${currentY}px`, position: 'absolute' }} 
                className={`select-none ${isBeingDragged ? 'z-50 scale-105 transition-none shadow-2xl' : 'z-20'} ${comp.isSimplified ? 'min-w-max min-h-max bg-transparent' : 'w-64 bg-white border border-ink-200 rounded-eng-xl shadow-lg p-5 group cursor-grab active:cursor-grabbing hover:border-brand-400 transition-colors'}`}
              >
                <ErrorBoundary scope="module" label={comp.name}>
                {comp.isSimplified ? (
                  (comp.isChipOnly ? comp.footprint : comp.moduleFootprint) ? renderFootprint(comp.isChipOnly ? comp.footprint! : comp.moduleFootprint!, designator, comp.instanceId) : <div className="w-12 h-12 bg-slate-900 border-2 border-slate-400 rounded-sm flex items-center justify-center text-[9px] text-white font-mono">{designator}</div>
                ) : (
                  <>
                    <button onClick={() => onRemove(comp.instanceId)} className="absolute -top-3 -right-3 w-8 h-8 bg-white text-slate-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl hover:text-rose-600 z-40">✕</button>
                    <div className="w-full h-40 bg-slate-50 rounded-[24px] overflow-hidden mb-4 flex items-center justify-center border border-slate-100">
                      <img 
                        src={comp.thumb} 
                        referrerPolicy="no-referrer"
                        className="max-w-[80%] max-h-[80%] object-contain drop-shadow-sm" 
                        loading="lazy" 
                      />
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[13px] font-black text-slate-800 truncate uppercase tracking-tight">{comp.name}</div>
                    </div>
                    <div className="text-[9px] text-slate-500 bg-slate-100 px-3 py-1 rounded-full inline-block font-black uppercase tracking-widest">{comp.type}</div>
                    {isMcu && (
                      <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">引脚占用追踪 (Pin Usage)</div>
                        <div className="space-y-2">
                          {Object.keys(mcuPinUsage).length > 0 ? Object.entries(mcuPinUsage).map(([pin, labels]: any) => (
                            <div key={pin} className="flex gap-2 text-[9px] font-bold">
                              <span className="text-indigo-600 w-5 font-mono shrink-0">{pin}</span>
                              <div className="flex-1 flex flex-col gap-1 min-w-0">
                                {labels.map((lbl: string, lIdx: number) => (
                                  <div key={lIdx} className="text-slate-500 truncate leading-tight">• {lbl}</div>
                                ))}
                              </div>
                            </div>
                          )) : (
                            <div className="text-[9px] text-slate-300 italic">暂无连线</div>
                          )}
                        </div>
                      </div>
                    )}
                    {!isMcu && comp.electrical?.pinMapping && normalizePinMapping(comp.electrical.pinMapping).length > 0 && (
                      <div className="mt-4 p-3 bg-slate-50/80 rounded-xl border border-slate-200">
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                          🔌 模块管脚定义 (Pin Mapping)
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {normalizePinMapping(comp.electrical.pinMapping).map(([pinName, pinVal]) => (
                            <div key={pinName} className="flex gap-1 items-center text-[9px] font-mono leading-none">
                              <span className="bg-slate-200/60 px-1 py-0.5 rounded text-slate-700 font-bold font-sans text-[8px]">{pinVal}</span>
                              <span className="text-indigo-600 truncate font-bold text-[9px]" title={pinName}>{pinName}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                </ErrorBoundary>
              </div>
            );
          })}
        </div>
      </div>
      {!isPcb && state.components.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <div className="text-h3 text-ink-300 mb-1">画布为空</div>
            <p className="text-body text-ink-400">从左侧库拖入模块,或用 AI 设计助手描述需求生成方案</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-10 right-10 flex gap-4 z-40 pointer-events-none">
        {!isPcb && state.currentStep === 0 && (
          <button 
            onClick={() => setState(p => ({ ...p, currentStep: 1 }))}
            className="pointer-events-auto px-5 py-2.5 bg-brand-600 text-white rounded-eng-lg font-semibold text-body hover:bg-brand-700 transition-colors flex items-center gap-1.5 shadow-lg"
          >
            <span>生成接线图</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default Canvas;
