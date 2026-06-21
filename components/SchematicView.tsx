
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ProjectState, CanvasComponent } from '../types';

const SchematicView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>> }> = ({ state, setState }) => {
  const mcu = state.components.find(c => c.type === 'mcu');
  const peripherals = state.components.filter(c => c.type !== 'mcu');
  const containerRef = useRef<HTMLDivElement>(null);

  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [scale, setScale] = useState(0.8);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const panRef = useRef({ x: 100, y: 100 });
  const scaleRef = useRef(0.8);

  const getComponentPins = (comp: CanvasComponent, index: number) => {
    const spec = comp.spec.toLowerCase();
    if (spec.includes('i2c')) return { type: 'I2C', pins: ['GND', 'VCC', 'SDA', 'SCL'], mcuPins: ['GND', '3V3', 'D4', 'D5'] };
    if (spec.includes('spi')) return { type: 'SPI', pins: ['GND', 'VCC', 'SCK', 'MISO', 'MOSI', 'CS'], mcuPins: ['GND', '3V3', 'D8', 'D9', 'D10', 'D3'] };
    if (spec.includes('uart')) return { type: 'UART', pins: ['GND', 'VCC', 'TX', 'RX'], mcuPins: ['GND', '3V3', 'D6', 'D7'] };
    return { type: 'GPIO', pins: ['GND', 'VCC', 'SIG'], mcuPins: ['GND', '3V3', `D${index % 4}`] };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(scaleRef.current * delta, 0.1), 3);
      
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

  const handleMouseDown = (e: React.MouseEvent) => {
    // 允许在 SVG 背景或容器上开启平移
    const isSvgBackground = e.target instanceof SVGSVGElement || e.target === containerRef.current;
    if (isSvgBackground || e.button === 1) {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      panRef.current = newPan;
      setPan(newPan);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  }, [isPanning, lastMousePos]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, handleMouseMove, handleMouseUp]);

  const schematicData = useMemo(() => {
    if (!mcu) return null;
    const blocks: any[] = [];
    const nets: any[] = [];

    const mcuBlock = {
      id: mcu.instanceId,
      name: mcu.name,
      x: 100,
      y: 150,
      width: 240,
      height: 480,
      pins: [
        { name: 'GND', side: 'right', y: 60 },
        { name: '3V3', side: 'right', y: 95 },
        { name: 'D0', side: 'right', y: 130 },
        { name: 'D1', side: 'right', y: 165 },
        { name: 'D2', side: 'right', y: 200 },
        { name: 'D3', side: 'right', y: 235 },
        { name: 'D4', side: 'right', y: 270 },
        { name: 'D5', side: 'right', y: 305 },
        { name: 'D6', side: 'right', y: 340 },
        { name: 'D7', side: 'right', y: 375 },
        { name: 'D8', side: 'right', y: 410 },
        { name: 'D9', side: 'right', y: 445 },
      ]
    };
    blocks.push(mcuBlock);

    peripherals.forEach((p, i) => {
      const pinInfo = getComponentPins(p, i);
      const px = 950;
      const py = 50 + i * 260;
      const pBlock = {
        id: p.instanceId,
        name: p.name,
        x: px,
        y: py,
        width: 220,
        height: 200,
        pins: pinInfo.pins.map((name, pidx) => ({ name, side: 'left', y: 60 + pidx * 40 }))
      };
      blocks.push(pBlock);

      pinInfo.pins.forEach((pinName, pidx) => {
        const mcuPinName = pinInfo.mcuPins[pidx];
        const mcuPin = mcuBlock.pins.find(mp => mp.name === mcuPinName);
        if (mcuPin) {
          let trunkOffset = 0; 
          if (pinName === 'GND') trunkOffset = 550 + (i * 15);
          else if (pinName === 'VCC') trunkOffset = 500 + (i * 15);
          else trunkOffset = 60 + (i * 80) + (pidx * 12);

          nets.push({
            from: { x: mcuBlock.x + mcuBlock.width, y: mcuBlock.y + mcuPin.y },
            to: { x: pBlock.x, y: pBlock.y + (60 + pidx * 40) },
            displayLabel: pinName === 'VCC' ? '3.3V' : pinName,
            type: pinName,
            trunkX: mcuBlock.x + mcuBlock.width + trunkOffset
          });
        }
      });
    });
    return { blocks, nets };
  }, [mcu, peripherals]);

  return (
    <div className="p-8 h-full bg-slate-50 flex flex-col overflow-hidden font-mono">
      <div className="flex items-center justify-between mb-4 shrink-0 font-sans">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            原理图拼装 <span className="text-blue-600">/ Schematic Design</span>
          </h2>
          <p className="text-[11px] text-slate-500 font-medium tracking-tight">平移功能已修复：点击空白背景即可拖动。</p>
        </div>
        <button 
          onClick={() => setState(p => ({ ...p, currentStep: 1 }))}
          className="px-8 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center gap-2"
        >
          <span>生成硬件剪裁建议</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
        </button>
      </div>

      <div 
        ref={containerRef} 
        onMouseDown={handleMouseDown}
        className={`flex-1 bg-[#ffffff] border-2 border-slate-200 relative overflow-hidden shadow-inner rounded-3xl ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
      >
        <div className="w-full h-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0' }}>
          <div className="min-w-[2400px] min-h-[2000px] relative">
            {schematicData && (
              <svg width="2400" height="2000" className="relative z-10 overflow-visible">
                {schematicData.blocks.map((block) => (
                  <g key={block.id} transform={`translate(${block.x}, ${block.y})`} onClick={(e) => { e.stopPropagation(); setState(prev => ({...prev, selectedComponentId: block.id})) }} className="cursor-pointer">
                    <rect width={block.width} height={block.height} fill="white" stroke={state.selectedComponentId === block.id ? "#3b82f6" : "#1e293b"} strokeWidth="3" rx="10" />
                    <rect width={block.width} height="40" fill="#f1f5f9" stroke={state.selectedComponentId === block.id ? "#3b82f6" : "#1e293b"} strokeWidth="3" rx="10" />
                    <text x={block.width/2} y="25" textAnchor="middle" fontSize="10" fontWeight="900" fill="#0f172a" className="uppercase tracking-[0.3em] font-mono">
                      {block.name}
                    </text>
                    {block.pins.map((pin: any, pi: number) => (
                      <g key={pi}>
                        <line x1={pin.side === 'left' ? -20 : block.width} y1={pin.y} x2={pin.side === 'left' ? 0 : block.width + 20} y2={pin.y} stroke="#0f172a" strokeWidth="3" />
                        <text x={pin.side === 'left' ? 12 : block.width - 12} y={pin.y + 4} fontSize="11" fontWeight="black" fill="#475569" textAnchor={pin.side === 'left' ? 'start' : 'end'} className="font-mono">{pin.name}</text>
                      </g>
                    ))}
                  </g>
                ))}
                {schematicData.nets.map((net, i) => {
                  const strokeColor = net.type === 'VCC' ? '#ef4444' : net.type === 'GND' ? '#64748b' : '#2563eb';
                  return (
                    <path key={i} d={`M ${net.from.x + 20} ${net.from.y} L ${net.trunkX} ${net.from.y} L ${net.trunkX} ${net.to.y} L ${net.to.x - 20} ${net.to.y}`} fill="none" stroke={strokeColor} strokeWidth="2.5" />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchematicView;
