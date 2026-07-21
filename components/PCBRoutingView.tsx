
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ProjectState, CanvasComponent } from '../types';
import { buildRuleStrategy, executePlacement, validateLayout, StrategyResult, RuleCheck } from '../lib/layout-engine';

const FOOTPRINT_SCALE = 5;
const SAFE_MARGIN_MM = 2;
const SAFE_MARGIN_PX = SAFE_MARGIN_MM * FOOTPRINT_SCALE; // 10px

const PCBRoutingView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>>; isRouting?: boolean }> = ({ state, setState, isRouting }) => {
  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number, y: number }>>({});
  const [isAutoPlacing, setIsAutoPlacing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isAiPlacing, setIsAiPlacing] = useState(false);
  const [aiLayoutText, setAiLayoutText] = useState<string | null>(null);
  const [layoutStrategy, setLayoutStrategy] = useState<StrategyResult | null>(null);
  const [ruleChecks, setRuleChecks] = useState<RuleCheck[] | null>(null);
  
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  
  const [activeDragId, setActiveDragId] = useState<{ id: string, isImage?: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const boardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);

  const boardW = state.pcbConstraints.width * FOOTPRINT_SCALE;
  const boardH = state.pcbConstraints.height * FOOTPRINT_SCALE;

  // 初始化板框位置：使其居中
  useEffect(() => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const initialPan = { x: (cw - boardW) / 2, y: (ch - boardH) / 2 };
      panRef.current = initialPan;
      setPan(initialPan);
    }
  }, [boardW, boardH]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(scaleRef.current * delta, 0.2), 5);
      const xBefore = (mouseX - panRef.current.x) / scaleRef.current;
      const yBefore = (mouseY - panRef.current.y) / scaleRef.current;
      const newPanX = mouseX - xBefore * newScale;
      const newPanY = mouseY - yBefore * newScale;
      scaleRef.current = newScale;
      panRef.current = { x: newPanX, y: newPanY };
      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const getCompSize = (comp: CanvasComponent) => {
    const fp = comp.isChipOnly ? comp.footprint : comp.moduleFootprint;
    return {
      w: (fp?.width || 20) * FOOTPRINT_SCALE,
      h: (fp?.height || 20) * FOOTPRINT_SCALE
    };
  };

  const findSafePosition = (
    comp: CanvasComponent,
    existing: {x: number, y: number, w: number, h: number}[],
    idealX: number,
    idealY: number
  ) => {
    const { w, h } = getCompSize(comp);
    let currentX = idealX;
    let currentY = idealY;
    
    // 增加物理间距常数：5mm = 25px
    const COMP_MIN_SPACING = FOOTPRINT_SCALE * 2.0; 

    const isOverlapping = (x: number, y: number) => {
      // 1. 检查板框边界
      if (x < SAFE_MARGIN_PX || y < SAFE_MARGIN_PX || x + w > boardW - SAFE_MARGIN_PX || y + h > boardH - SAFE_MARGIN_PX) {
        return true;
      }
      
      // 2. 检查与其他组件重叠 (增加缓冲带)
      for (const item of existing) {
        const overlap = !(
          x + w + COMP_MIN_SPACING <= item.x || 
          x >= item.x + item.w + COMP_MIN_SPACING || 
          y + h + COMP_MIN_SPACING <= item.y || 
          y >= item.y + item.h + COMP_MIN_SPACING
        );
        if (overlap) return true;
      }
      return false;
    };

    // 如果初始位置就已经冲突或者超出边界，则进行螺旋搜索
    if (isOverlapping(currentX, currentY)) {
      let angle = 0;
      let step = 5.0; // 进一步增大步长，快速跳离冲突区
      let attempts = 0;
      
      // 限制最大尝试次数，并使用较大的角度增量以提升性能
      while (attempts < 500) {
        angle += 0.4; 
        const radius = step * angle;
        currentX = idealX + Math.cos(angle) * radius;
        currentY = idealY + Math.sin(angle) * radius;
        
        if (!isOverlapping(currentX, currentY)) break;
        attempts++;
      }
    }
    
    // 强制限制在边界内
    currentX = Math.max(SAFE_MARGIN_PX, Math.min(currentX, boardW - w - SAFE_MARGIN_PX));
    currentY = Math.max(SAFE_MARGIN_PX, Math.min(currentY, boardH - h - SAFE_MARGIN_PX));
    
    return { x: currentX, y: currentY, w, h };
  };

  // D:布局管线 —— 策略(AI 或规则)→ 引擎落位(mm)→ 规则校验 → 应用(px)
  const applyStrategy = (strategy: StrategyResult) => {
    const bwMm = state.pcbConstraints.width;
    const bhMm = state.pcbConstraints.height;
    const boxes = executePlacement(state.components, strategy, bwMm, bhMm);
    const checks = validateLayout(state.components, boxes, bwMm, bhMm);
    const newPos: Record<string, { x: number, y: number }> = {};
    boxes.forEach(b => { newPos[b.instanceId] = { x: b.x * FOOTPRINT_SCALE, y: b.y * FOOTPRINT_SCALE }; });
    setLocalPositions(newPos);
    setState(prev => ({
      ...prev,
      components: prev.components.map(c => ({
        ...c,
        pcbX: newPos[c.instanceId]?.x ?? c.pcbX,
        pcbY: newPos[c.instanceId]?.y ?? c.pcbY
      }))
    }));
    setLayoutStrategy(strategy);
    setRuleChecks(checks);
    setAiLayoutText(null);
  };

  // 算法自动布局:内置规则策略 + 引擎(确定性,可复现)
  const runAutoPlacer = () => {
    if (isAutoPlacing || isAiPlacing) return;
    setIsAutoPlacing(true);
    try {
      applyStrategy(buildRuleStrategy(state.components));
    } finally {
      setIsAutoPlacing(false);
    }
  };

  // AI 布局优化:AI 只出策略(分区+理由),坐标仍由引擎计算并校验;失败回退规则策略
  const runAiPlacer = async () => {
    if (isAiPlacing || isAutoPlacing) return;
    setIsAiPlacing(true);
    try {
      const payload = {
        board: { width: state.pcbConstraints.width, height: state.pcbConstraints.height },
        modules: state.components.map(c => {
          const fp = (c as any).isChipOnly ? (c as any).footprint : (c as any).moduleFootprint;
          return {
            instanceId: c.instanceId, name: c.name, type: c.type,
            connectorType: c.physical?.connectorType,
            protocols: c.electrical?.protocols || [],
            currentDraw: c.electrical?.currentDraw,
            w: fp?.width || 20, h: fp?.height || 20,
          };
        }),
      };
      const res = await fetch('/api/layout-strategy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `status ${res.status}`);
      // 合法性合并:AI 分区无效/缺失的模块回退到规则策略对应项
      const baseline = buildRuleStrategy(state.components);
      const VALID = new Set(['edge-n','edge-s','edge-e','edge-w','corner','center','any']);
      const aiMap = new Map<string, any>((data.perModule || []).map((m: any) => [m.instanceId, m]));
      const merged: StrategyResult = {
        source: 'ai',
        notes: Array.isArray(data.notes) ? data.notes.slice(0, 3) : [],
        perModule: baseline.perModule.map(b => {
          const ai = aiMap.get(b.instanceId);
          return ai && VALID.has(ai.zone)
            ? { instanceId: b.instanceId, zone: ai.zone, reason: String(ai.reason || '').slice(0, 60) }
            : b;
        }),
      };
      applyStrategy(merged);
    } catch (e) {
      // 诚实回退:AI 不可用就用规则策略,并明确告知
      const fb = buildRuleStrategy(state.components);
      fb.notes = ['⚠ AI 策略服务不可用,已使用内置规则策略(结果同「算法自动布局」)', ...fb.notes];
      applyStrategy(fb);
    } finally {
      setIsAiPlacing(false);
    }
  };

  useEffect(() => {
    const initialPos: Record<string, { x: number, y: number }> = {};
    const placedRects: {x: number, y: number, w: number, h: number}[] = [];
    
    // 1. 初始化位置并进行物理避障
    const sortedComps = [...state.components].sort((a, b) => (a.type === 'mcu' ? -1 : 1));
    
    sortedComps.forEach(comp => {
      const { w, h } = getCompSize(comp);
      
      // 如果已有有效 PCB 坐标则尝试保持，否则根据类型分配建议起点
      let idealX, idealY;
      if (comp.pcbX !== undefined && comp.pcbY !== undefined) {
        idealX = comp.pcbX;
        idealY = comp.pcbY;
      } else {
        // 初始散开分布，不要都在 (0,0)
        if (comp.type === 'mcu') {
          idealX = SAFE_MARGIN_PX * 3;
          idealY = (boardH - h) / 2;
        } else {
          idealX = boardW / 3;
          idealY = boardH / 2;
        }
      }

      // 强制运行避障算法
      const safePos = findSafePosition(comp, placedRects, idealX, idealY);
      initialPos[comp.instanceId] = { x: safePos.x, y: safePos.y };
      placedRects.push(safePos);
    });

    setLocalPositions(initialPos);
    
    // 我们将同步全局状态的逻辑移到底部的 useEffect 中，避免在渲染时调用 setState

    // 2. 处理布线阶段的动画逻辑
    if (isRouting) {
      setProgress(0); 
      setIsDone(false);
      const intervalId = setInterval(() => {
        setProgress(p => {
          if (p >= 100) { 
            clearInterval(intervalId); 
            setIsDone(true); 
            return 100; 
          }
          return p + 5;
        });
      }, 30);
      return () => clearInterval(intervalId);
    } else {
      setIsDone(true);
    }
  }, [state.components.length, boardW, boardH, isRouting]);

  const handleMouseDown = (e: React.MouseEvent, id?: string, isImage?: boolean) => {
    if (id === 'board-resize') {
      e.stopPropagation();
      setIsResizing(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (id !== undefined) {
      e.stopPropagation();
      setActiveDragId({ id, isImage });
      const currentPos = isImage 
        ? state.pastedImages?.find(img => img.id === id) 
        : (localPositions[id] || { x: 0, y: 0 });

      if (currentPos && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDragOffset({
          x: (e.clientX - rect.left - panRef.current.x) / scaleRef.current - currentPos.x,
          y: (e.clientY - rect.top - panRef.current.y) / scaleRef.current - currentPos.y
        });
      }
    } else if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (activeDragId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newX = (e.clientX - rect.left - panRef.current.x) / scaleRef.current - dragOffset.x;
      const newY = (e.clientY - rect.top - panRef.current.y) / scaleRef.current - dragOffset.y;

      if (activeDragId.isImage) {
        const img = state.pastedImages?.find(i => i.id === activeDragId.id);
        const imgW = img?.width || 100;
        const imgH = 100; // 假设高度
        
        const boundedX = Math.max(-imgW/2, Math.min(newX, boardW - imgW/2));
        const boundedY = Math.max(-imgH/2, Math.min(newY, boardH - imgH/2));

        setState(prev => ({
          ...prev,
          pastedImages: prev.pastedImages?.map(img => 
            img.id === activeDragId.id ? { ...img, x: boundedX, y: boundedY } : img
          )
        }));
      } else {
        const comp = state.components.find(c => c.instanceId === activeDragId.id);
        if (!comp) return;
        
        const { w, h } = getCompSize(comp);

        // 严格边界限制
        const boundedX = Math.max(SAFE_MARGIN_PX, Math.min(newX, boardW - w - SAFE_MARGIN_PX));
        const boundedY = Math.max(SAFE_MARGIN_PX, Math.min(newY, boardH - h - SAFE_MARGIN_PX));

        // 实时避障检测：确保拖拽过程中元器件也不重叠
        const otherRects = state.components
          .filter(c => c.instanceId !== activeDragId.id)
          .map(c => {
             const size = getCompSize(c);
             const pos = localPositions[c.instanceId] || { x: c.pcbX || 0, y: c.pcbY || 0 };
             return { x: pos.x, y: pos.y, w: size.w, h: size.h };
          });

        const safePos = findSafePosition(comp, otherRects, boundedX, boundedY);
        setLocalPositions(prev => ({ ...prev, [activeDragId.id]: { x: safePos.x, y: safePos.y } }));
      }
    } else if (isResizing) {
      const dx = (e.clientX - lastMousePos.x) / scaleRef.current;
      const dy = (e.clientY - lastMousePos.y) / scaleRef.current;
      
      // 最小尺寸限制在 40mm
      const newW = Math.max(40, state.pcbConstraints.width + dx / FOOTPRINT_SCALE);
      const newH = Math.max(40, state.pcbConstraints.height + dy / FOOTPRINT_SCALE);
      
      // 增加 0.5mm 的对齐精度
      const snappedW = Math.round(newW * 2) / 2;
      const snappedH = Math.round(newH * 2) / 2;
      
      if (setState && (snappedW !== state.pcbConstraints.width || snappedH !== state.pcbConstraints.height)) {
        setState(prev => ({
          ...prev,
          pcbConstraints: {
            ...prev.pcbConstraints,
            width: snappedW,
            height: snappedH
          }
        }));
      }
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      panRef.current = newPan;
      setPan(newPan);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  }, [activeDragId, isPanning, isResizing, lastMousePos, dragOffset, state.components, state.pastedImages, state.pcbConstraints, boardW, boardH]);

  const handleMouseUp = useCallback(() => {
    if (activeDragId && !activeDragId.isImage && setState) {
      const currentPos = localPositions[activeDragId.id];
      const comp = state.components.find(c => c.instanceId === activeDragId.id);
      
      if (currentPos && comp) {
        // 全局规则：手动释放时也进行避障计算
        const otherRects = state.components
          .filter(c => c.instanceId !== activeDragId.id)
          .map(c => {
             const { w, h } = getCompSize(c);
             // 优先使用 localPositions 中的实时位置，没有则使用状态中的
             const pos = localPositions[c.instanceId] || { x: c.pcbX || 0, y: c.pcbY || 0 };
             return { x: pos.x, y: pos.y, w, h };
          });

        const safePos = findSafePosition(comp, otherRects, currentPos.x, currentPos.y);
        
        setLocalPositions(prev => ({ ...prev, [activeDragId.id]: { x: safePos.x, y: safePos.y } }));
        
        setState(prev => ({
          ...prev,
          components: prev.components.map(c => 
            c.instanceId === activeDragId.id ? { ...c, pcbX: safePos.x, pcbY: safePos.y } : c
          )
        }));
      }
    }
    setActiveDragId(null);
    setIsPanning(false);
    setIsResizing(false);
  }, [activeDragId, localPositions, state.components, setState, findSafePosition]);

  useEffect(() => {
    // 只有在没有预设坐标时才执行全局状态同步
    const needsSync = state.components.some(c => c.pcbX === undefined);
    if (needsSync && setState) {
      setState(prev => ({
        ...prev,
        components: prev.components.map(c => ({
          ...c,
          pcbX: localPositions[c.instanceId]?.x ?? c.pcbX,
          pcbY: localPositions[c.instanceId]?.y ?? c.pcbY
        }))
      }));
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, state.components, setState, localPositions]);

  const routingPaths = useMemo(() => {
    if (!isRouting || !isDone) return [];
    const mcu = state.components.find(c => c.type === 'mcu');
    if (!mcu) return [];
    const paths: any[] = [];
    const peripherals = state.components.filter(c => c.type !== 'mcu');

    peripherals.forEach((p, pIdx) => {
      const spec = p.spec.toLowerCase();
      const pinInfo = spec.includes('i2c') ? { pins: ['GND', 'VCC', 'SDA', 'SCL'], mcuPins: ['GND', '3V3', 'D4', 'D5'] } :
                     spec.includes('spi') ? { pins: ['GND', 'VCC', 'SCK', 'MISO', 'MOSI', 'CS'], mcuPins: ['GND', '3V3', 'D10', 'D9', 'D8', 'D3'] } :
                     spec.includes('uart') ? { pins: ['GND', 'VCC', 'TX', 'RX'], mcuPins: ['GND', '3V3', 'D6', 'D7'] } :
                     { pins: ['GND', 'VCC', 'SIG'], mcuPins: ['GND', '3V3', `D${pIdx % 4}`] };

      const mcuPos = localPositions[mcu.instanceId];
      const pPos = localPositions[p.instanceId];
      if (!mcuPos || !pPos) return;

      const mcuFp = mcu.isChipOnly ? mcu.footprint : mcu.moduleFootprint;
      const pFp = p.isChipOnly ? p.footprint : p.moduleFootprint;
      if (!mcuFp || !pFp) return;

      (pinInfo?.pins || []).forEach((pinName, pinIdx) => {
        const mcuPinName = pinInfo.mcuPins[pinIdx];
        const mcuPin = (mcuFp?.pins || []).find(fp => fp.name === mcuPinName || (mcuPinName === 'GND' && fp.name === 'GND') || (mcuPinName === '3V3' && (fp.name === '3V3' || fp.name === 'VCC')));
        const pPin = (pFp?.pins || []).find(fp => fp.name === pinName || (pinName === 'VCC' && (fp.name === '3V3' || fp.name === 'VCC')) || (pinName === 'GND' && fp.name === 'GND'));
        if (mcuPin && pPin) {
          const from = { x: mcuPos.x + mcuPin.x * FOOTPRINT_SCALE, y: mcuPos.y + mcuPin.y * FOOTPRINT_SCALE };
          const to = { x: pPos.x + pPin.x * FOOTPRINT_SCALE, y: pPos.y + pPin.y * FOOTPRINT_SCALE };
          const midX = (from.x + to.x) / 2 + (pIdx * 8) - (pinIdx * 2);
          paths.push({
            d: `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`,
            color: pinName === 'GND' ? '#475569' : (pinName === 'VCC' || pinName === '3V3' ? '#ef4444' : '#fbbf24'),
            opacity: (pinName === 'GND' || pinName === 'VCC') ? 0.3 : 0.85
          });
        }
      });
    });
    return paths;
  }, [isRouting, isDone, localPositions, state.components]);

  const renderFootprint = (comp: CanvasComponent, index: number) => {
    const footprint = comp.isChipOnly ? comp.footprint : comp.moduleFootprint;
    if (!footprint) return null;
    const pos = localPositions[comp.instanceId] || { x: SAFE_MARGIN_PX, y: SAFE_MARGIN_PX };
    const w = footprint.width * FOOTPRINT_SCALE;
    const h = footprint.height * FOOTPRINT_SCALE;
    const isDragging = activeDragId?.id === comp.instanceId && !activeDragId.isImage;
    const designator = `U${comp.instanceId.split('-')[1].slice(-3)}`;

    return (
      <div 
        key={comp.instanceId}
        onMouseDown={(e) => handleMouseDown(e, comp.instanceId)}
        className={`absolute border-2 border-white/10 bg-slate-900 shadow-2xl select-none cursor-move z-20 ${isDragging ? 'scale-105 ring-2 ring-green-500/50' : ''}`}
        style={{ width: `${w}px`, height: `${h}px`, left: `${pos.x}px`, top: `${pos.y}px`, transition: isDragging || isPanning ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="absolute inset-0.5 border border-[#fbbf24] opacity-20 pointer-events-none" />
        <div className="absolute -top-4 left-0 text-[7px] font-mono font-black text-green-400 uppercase tracking-tighter truncate w-full">{designator} | {comp.name.split(' ').pop()}</div>
        {(footprint?.pins || []).map(pin => (
          <div key={pin.id} className="absolute bg-[#ccd5de] border border-black/10" style={{ left: `${pin.x * FOOTPRINT_SCALE}px`, top: `${pin.y * FOOTPRINT_SCALE}px`, width: '3px', height: '3px', transform: 'translate(-50%, -50%)' }} />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0a100c] overflow-hidden font-mono relative">
      <div className="p-8 pb-4 flex items-center justify-between shrink-0 z-50 pointer-events-none">
        <div className="pointer-events-auto">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            {isRouting ? 'AI 物理布线' : 'AI 布局优化'}
            {isDone && isRouting && <span className="px-3 py-1 bg-green-500/10 text-green-500 text-[9px] rounded-full border border-green-500/20 font-black animate-pulse uppercase tracking-widest">Router Solved</span>}
          </h2>
          <p className="text-xs text-green-400/40 font-medium mt-1">
            支持滚轮缩放与中键平移。拖拽组件进行精细布局。
            <span className="ml-4 text-green-500 font-bold tracking-widest underline underline-offset-4 decoration-2">强制 2MM 间距已生效</span>
          </p>
        </div>
        <div className="flex gap-3 pointer-events-auto">
          {!isRouting && (
            <>
              <button 
                onClick={runAutoPlacer}
                className="px-6 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-black shadow-lg hover:bg-slate-900 transition-all uppercase tracking-widest flex items-center gap-2"
              >
                <span>{isAutoPlacing ? '布局计算中...' : '算法自动布局'}</span>
              </button>
              <button 
                onClick={runAiPlacer}
                disabled={isAiPlacing}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-900/40 hover:bg-indigo-700 transition-all uppercase tracking-widest flex items-center gap-2"
              >
                <div className={`w-2 h-2 rounded-full bg-white ${isAiPlacing ? 'animate-ping' : ''}`} />
                <span>{isAiPlacing ? 'Gemini 布局中...' : 'AI 智能布局建议'}</span>
              </button>
              <button 
                onClick={() => setState(p => ({ ...p, currentStep: 4 }))}
                className="px-6 py-2.5 bg-green-600 text-white rounded-xl text-xs font-black shadow-lg shadow-green-900/40 hover:bg-green-700 transition-all uppercase tracking-widest flex items-center gap-2"
              >
                <span>进入布线阶段</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
              </button>
            </>
          )}
          {isRouting && isDone && (
            <button 
              onClick={() => setState(p => ({ ...p, currentStep: 5 }))}
              className="px-8 py-2.5 bg-green-600 text-white rounded-xl text-xs font-black shadow-lg shadow-green-900/40 hover:bg-green-700 transition-all uppercase tracking-widest flex items-center gap-2"
            >
              <span>生成制造文件</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
            </button>
          )}
        </div>
      </div>

      {(layoutStrategy || aiLayoutText) && !isRouting && (
        <div className="absolute top-20 right-4 w-80 max-h-[60vh] overflow-y-auto bg-slate-900/95 backdrop-blur rounded-2xl p-4 shadow-2xl pointer-events-auto space-y-3">
          {layoutStrategy && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-white uppercase tracking-widest">
                  {layoutStrategy.source === 'ai' ? '🤖 AI 策略 + 算法执行' : '📐 规则策略 + 算法执行'}
                </span>
                <button onClick={() => { setLayoutStrategy(null); setRuleChecks(null); }} className="text-slate-500 hover:text-white text-xs">✕</button>
              </div>
              {layoutStrategy.notes.map((n, i) => (
                <p key={i} className="text-[10px] text-slate-300 leading-relaxed">{n}</p>
              ))}
              <div className="space-y-1">
                {layoutStrategy.perModule.map(s => {
                  const comp = state.components.find(c => c.instanceId === s.instanceId);
                  return (
                    <div key={s.instanceId} className="text-[10px] text-slate-300 leading-snug">
                      <span className="text-white font-bold">{comp?.name.split(' ').slice(-2).join(' ')}</span>
                      <span className="ml-1 px-1 py-0.5 bg-slate-700 rounded text-[9px] font-mono">{s.zone}</span>
                      <span className="ml-1 text-slate-400">{s.reason}</span>
                    </div>
                  );
                })}
              </div>
              {ruleChecks && (
                <div className="pt-2 border-t border-slate-700 space-y-1">
                  <div className="text-[10px] font-black text-white uppercase tracking-widest">规则校验</div>
                  {ruleChecks.map((c, i) => (
                    <div key={i} className={`text-[10px] leading-snug ${c.status === 'pass' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {c.status === 'pass' ? '✓' : '⚠'} <b>{c.rule}</b>:{c.detail}
                    </div>
                  ))}
                  <p className="text-[9px] text-slate-500 pt-1">⚠ 项不阻塞流程 —— 可拖拽微调后重看(重新点布局按钮刷新校验)</p>
                </div>
              )}
            </>
          )}
          {aiLayoutText && <p className="text-[11px] text-white leading-relaxed">{aiLayoutText}</p>}
        </div>
      )}

      <div 
        ref={containerRef}
        onMouseDown={(e) => handleMouseDown(e)}
        className={`flex-1 relative bg-black/40 pcb-grid shadow-inner overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
         <div 
            style={{ 
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, 
              transformOrigin: '0 0',
              transition: (activeDragId || isPanning) ? 'none' : 'transform 0.1s linear'
            }}
            className="relative"
          >
             <div 
                ref={boardRef}
                className="bg-[#14331d] border-2 border-[#2b8a4b] rounded-sm relative shadow-2xl overflow-hidden"
                style={{ width: `${boardW}px`, height: `${boardH}px` }}
              >
                  {state.pastedImages?.map(img => (
                    <div 
                      key={img.id}
                      onMouseDown={(e) => handleMouseDown(e, img.id, true)}
                      className="absolute z-10 cursor-move transition-shadow"
                      style={{ 
                        left: `${img.x}px`, 
                        top: `${img.y}px`, 
                        width: `${img.width}px`,
                        opacity: 0.6,
                        pointerEvents: isRouting ? 'none' : 'auto'
                      }}
                    >
                      <img src={img.url} className="w-full h-auto border border-white/20 shadow-md" draggable={false} />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setState(prev => ({ ...prev, pastedImages: prev.pastedImages?.filter(i => i.id !== img.id) }));
                        }}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] z-20"
                      >✕</button>
                    </div>
                  ))}
                 {isRouting && isDone && (
                   <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ mixBlendMode: 'screen' }}>
                      {routingPaths.map((path, idx) => (
                        <path key={idx} d={path.d} stroke={path.color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: path.opacity }} />
                      ))}
                   </svg>
                 )}
                 {state.components.map((c, i) => renderFootprint(c, i))}
                 {/* 调整 PCB 大小的手柄 */}
                 {!isRouting && (
                   <div 
                     onMouseDown={(e) => handleMouseDown(e, 'board-resize')}
                     className="absolute -bottom-1 -right-1 w-12 h-12 cursor-nwse-resize flex items-end justify-end group active:scale-95 transition-transform z-[40]"
                     title="拖拽调整 PCB 画布尺寸"
                   >
                     <div className="w-8 h-8 flex items-center justify-center">
                        {/* 装饰性的手柄视觉效果 */}
                        <div className="absolute inset-0 border-r-2 border-b-2 border-green-500/20 rounded-br-lg group-hover:border-green-500/50 transition-colors pointer-events-none" />
                        <div className="w-3 h-3 bg-green-500 rounded-full shadow-lg shadow-green-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute right-1 bottom-1 flex flex-col gap-1">
                           <div className="w-1 h-1 bg-green-500 rounded-full" />
                           <div className="w-1 h-1 bg-green-500/60 rounded-full" />
                        </div>
                     </div>
                   </div>
                 )}
             </div>
         </div>

         {(isAutoPlacing || (!isDone && isRouting)) && (
           <div className="absolute inset-0 flex items-center justify-center z-[100] bg-black/60 backdrop-blur-sm">
             <div className="w-80 space-y-4 bg-slate-900 p-8 rounded-[40px] border border-white/5 text-center shadow-3xl">
                <div className="flex justify-center mb-2">
                  <div className="w-12 h-12 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-[10px] text-green-400 font-mono tracking-widest uppercase">
                  {isAutoPlacing ? 'kicad-parts-placer (YAML Solver)' : 'Routing Solver'}: {progress}%
                </div>
             </div>
           </div>
         )}
      </div>

      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center z-50 pointer-events-none">
        <div className="flex gap-4 text-[9px] font-bold text-green-500/40 uppercase tracking-widest">
          <span>Zoom: {Math.round(scale * 100)}%</span>
          <span>Pos: {Math.round(pan.x)}, {Math.round(pan.y)}</span>
          <span>Board: {state.pcbConstraints.width} x {state.pcbConstraints.height} mm</span>
        </div>

        {isResizing && (
          <div className="px-4 py-1 bg-green-500 text-black text-[10px] font-black rounded-full animate-pulse shadow-lg shadow-green-500/20">
            BOARD SIZE: {state.pcbConstraints.width.toFixed(1)}mm × {state.pcbConstraints.height.toFixed(1)}mm
          </div>
        )}
      </div>
    </div>
  );
};

export default PCBRoutingView;
