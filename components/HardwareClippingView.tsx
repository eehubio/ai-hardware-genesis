import React, { useMemo } from 'react';
import { ProjectState, CanvasComponent, ClipDecision } from '../types';
import { composeFirmware } from '../lib/firmware-composer';
import SchematicView from './SchematicView';

/**
 * C:硬件剪裁(重写版)
 * 旧版为纯剧本演示(假进度条/假日志/关键词假建议),已整体移除。
 * 本版为确定性分析:
 *  - 门禁:必须先在固件构建页「确认固件」(且组件集未变)
 *  - 代码实现状态:来自固件拼装器(库内片段/内置参考/未实现)
 *  - 器件级数据:来自 KiCad 导入的 pcbIR(无数据的模块如实说明,不编造)
 *  - 输出为「建议」,一切取舍由工程师逐模块确认
 */

const REG_RE = /1117|662k|ldo|regul|dc-?dc|buck|ams|xc62|rt9013|me6211|tps7|mp15|ap21/i;
const isConnector = (c: { designator: string; category?: string }) =>
  (c.category || '').toLowerCase().includes('connector') || /^(J|CN|X|P)\d/i.test(c.designator || '');
const isRegulator = (c: { designator?: string; value?: string; category?: string }) =>
  (c.category || '').toLowerCase().includes('power') || REG_RE.test(c.value || '');

interface ModuleAnalysis {
  comp: CanvasComponent;
  codeStatus: 'db' | 'builtin' | 'todo' | 'mcu';
  hasKicad: boolean;
  partsTotal: number;
  connectors: number;
  regulators: number;
  castellated: boolean;
  recommended: ClipDecision;
  reasons: string[];
}

const HardwareClippingView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>> }> = ({ state, setState }) => {
  const [showSchematic, setShowSchematic] = React.useState(false);
  const comps = state.components;
  const ids = comps.map(c => c.id).sort().join(',');
  const fc = state.firmwareConfirmed;
  const confirmValid = !!fc && fc.componentIds.slice().sort().join(',') === ids;

  const analyses: ModuleAnalysis[] = useMemo(() => {
    if (!confirmValid) return [];
    const composed = composeFirmware(comps, fc!.lang);
    return comps.map(comp => {
      const isMcu = comp.type === 'mcu' || comp.type === 'processor';
      const src = isMcu ? 'mcu' : (composed.modules.find(m => m.id === comp.id)?.source || 'todo');
      const parts = (comp as any).pcbIR?.components as { designator: string; value: string; category: string }[] | undefined;
      const hasKicad = Array.isArray(parts) && parts.length > 0;
      const connectors = hasKicad ? parts!.filter(isConnector).length : 0;
      const regulators = hasKicad ? parts!.filter(isRegulator).length : 0;
      const castellated = comp.physical?.connectorType === 'Castellated';
      const reasons: string[] = [];
      let recommended: ClipDecision = 'full';
      if (isMcu) {
        recommended = 'full';
        reasons.push(castellated ? '主控为邮票孔核心板,可直接贴装到量产板' : '主控建议整模块保留');
      } else if (src === 'todo') {
        recommended = 'remove';
        reasons.push('确认固件中该模块无任何驱动代码(未实现)——如确属未用,建议移除;如需保留请先补代码再重新确认固件');
      } else if (hasKicad) {
        recommended = 'core';
        reasons.push(`KiCad 数据:共 ${parts!.length} 个器件,其中连接器 ${connectors} 个、稳压 ${regulators} 路 —— 提取核心可去除连接器与冗余电源`);
      } else {
        recommended = 'full';
        reasons.push('无 KiCad 工程数据,无法给出器件级清单 —— 暂建议整模块;导入该模块 KiCad 工程后可解锁「提取核心」分析');
      }
      if (!isMcu && !castellated && (comp.clipDecision ?? recommended) === 'full') {
        reasons.push(`⚠ ${comp.physical?.connectorType || '该'}连接形态不可直接焊接到量产板 —— 整模块保留仅适合原型阶段`);
      }
      return { comp, codeStatus: src as any, hasKicad, partsTotal: hasKicad ? parts!.length : 0, connectors, regulators, castellated, recommended, reasons };
    });
  }, [comps, confirmValid, fc]);

  // 提取核心的脚印尺寸:从该模块 KiCad BOM 找核心 IC 的封装尺寸(名称中的 NxNmm),
  // 外扩 6mm 容纳必要外围(去耦/上拉);解析不到用保守默认 12×10。
  const coreFootprintOf = (comp: CanvasComponent): { width: number; height: number } => {
    const parts = ((comp as any).pcbIR?.components || []) as { designator: string; value: string; footprint: string; category: string }[];
    const ics = parts.filter(p => (p.category || '').toLowerCase() === 'ic' || /^U\d/i.test(p.designator || ''));
    let best: { w: number; h: number } | null = null;
    for (const p of ics) {
      const m = /([0-9]+(?:\.[0-9]+)?)x([0-9]+(?:\.[0-9]+)?)mm/i.exec(p.footprint || '');
      if (m) {
        const w = parseFloat(m[1]), h = parseFloat(m[2]);
        if (!best || w * h > best.w * best.h) best = { w, h };
      }
    }
    return best ? { width: Math.ceil(best.w + 6), height: Math.ceil(best.h + 6) } : { width: 12, height: 10 };
  };

  const setDecision = (instanceId: string, d: ClipDecision) => {
    setState(p => ({
      ...p,
      components: p.components.map(c => {
        if (c.instanceId !== instanceId) return c;
        if (d === 'core') {
          // 决策落地:后续布局/布线/外壳按"核心器件簇"尺寸计算,不再用整模块脚印
          return { ...c, clipDecision: d, isChipOnly: true, footprint: { ...(c.footprint || {}), ...coreFootprintOf(c), type: 'SMD' } as any };
        }
        return { ...c, clipDecision: d, isChipOnly: false };
      }),
    }));
  };

  // ===== 聚合建议(仅统计有数据的模块,覆盖率如实标注)=====
  const agg = useMemo(() => {
    const active = analyses.filter(a => (a.comp.clipDecision ?? a.recommended) !== 'remove');
    const withData = active.filter(a => a.hasKicad);
    const totalReg = withData.reduce((s, a) => s + a.regulators, 0);
    const coreChosen = analyses.filter(a => (a.comp.clipDecision ?? a.recommended) === 'core' && a.hasKicad);
    const removableConn = coreChosen.reduce((s, a) => s + a.connectors, 0);
    const removedCnt = analyses.filter(a => (a.comp.clipDecision ?? a.recommended) === 'remove').length;
    return { activeCnt: active.length, dataCnt: withData.length, totalReg, removableConn, removedCnt };
  }, [analyses]);

  // ===== 门禁 =====
  if (comps.length === 0) {
    return (
      <div className="flex-1 h-full flex items-center justify-center p-10">
        <div className="text-center max-w-sm space-y-3">
          <div className="text-4xl">🔩</div>
          <div className="text-h3 text-ink-900 font-bold">硬件剪裁需要先有方案</div>
          <p className="text-body text-ink-500">画布为空。请先在「原型设计」完成方案搭建与固件确认。</p>
        </div>
      </div>
    );
  }
  if (!confirmValid) {
    return (
      <div className="flex-1 h-full flex items-center justify-center p-10">
        <div className="text-center max-w-md space-y-3">
          <div className="text-4xl">🔒</div>
          <div className="text-h3 text-ink-900 font-bold">先确认固件,再做剪裁</div>
          <p className="text-body text-ink-500 leading-relaxed">
            剪裁依据是「最终确认的代码里到底用了哪些模块」。
            {fc ? '组件方案在确认固件后发生了变化,请回固件页重新确认。' : '请在原型设计 → 固件构建 页完成代码并点击「✅ 确认固件」。'}
            未经确认的代码不能作为器件取舍依据 —— 这是流程门禁,不是故障。
          </p>
          <button
            onClick={() => setState(p => ({ ...p, mode: 'PROTOTYPE' as any, currentStep: 2 }))}
            className="px-5 py-2.5 bg-brand-600 text-white rounded-eng-lg text-body font-semibold hover:bg-brand-700">
            前往固件构建
          </button>
        </div>
      </div>
    );
  }

  const decisionMeta: Record<ClipDecision, { label: string; cls: string }> = {
    full: { label: '整模块保留', cls: 'border-sky-500 text-sky-700 bg-sky-50' },
    core: { label: '提取核心器件', cls: 'border-emerald-500 text-emerald-700 bg-emerald-50' },
    remove: { label: '移除', cls: 'border-red-400 text-red-600 bg-red-50' },
  };
  const codeBadge: Record<string, { t: string; cls: string }> = {
    mcu: { t: '主控', cls: 'bg-ink-800 text-white' },
    db: { t: '代码:库内片段', cls: 'bg-emerald-100 text-emerald-700' },
    builtin: { t: '代码:内置参考', cls: 'bg-slate-200 text-slate-600' },
    todo: { t: '代码:未实现', cls: 'bg-amber-100 text-amber-700' },
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 space-y-4">
      <div>
        <h2 className="text-h2 font-black text-ink-900">硬件剪裁 <span className="text-meta font-mono text-ink-400 ml-2">CLIP &amp; MERGE</span></h2>
        <p className="text-body text-ink-500 mt-0.5">
          基于已确认固件({fc!.lang === 'arduino' ? 'Arduino' : 'MicroPython'} · {new Date(fc!.at).toLocaleString()})与模块 KiCad 数据的<b>建议清单</b> —— 最终取舍由工程师逐项确认。
        </p>
      </div>

      {/* 聚合建议 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3 bg-white border border-ink-200 rounded-eng-lg">
          <div className="text-meta text-ink-400 font-bold uppercase">保留模块</div>
          <div className="text-h3 font-black text-ink-900">{agg.activeCnt} <span className="text-meta text-ink-400">/ {analyses.length}</span></div>
          <div className="text-meta text-ink-500 mt-0.5">{agg.removedCnt > 0 ? `${agg.removedCnt} 个标记移除` : '无移除项'}</div>
        </div>
        <div className="p-3 bg-white border border-ink-200 rounded-eng-lg">
          <div className="text-meta text-ink-400 font-bold uppercase">电源合并建议</div>
          {agg.dataCnt === 0 ? (
            <div className="text-body text-ink-500 mt-1">无器件数据,无法分析</div>
          ) : agg.totalReg >= 2 ? (
            <>
              <div className="text-h3 font-black text-emerald-600">{agg.totalReg} → 1</div>
              <div className="text-meta text-ink-500 mt-0.5">检出 {agg.totalReg} 路稳压,合并保留 1 路(电压等级需人工确认)</div>
            </>
          ) : (
            <div className="text-body text-ink-600 mt-1">检出 {agg.totalReg} 路稳压,无合并空间</div>
          )}
        </div>
        <div className="p-3 bg-white border border-ink-200 rounded-eng-lg">
          <div className="text-meta text-ink-400 font-bold uppercase">可移除连接器</div>
          <div className="text-h3 font-black text-ink-900">{agg.removableConn}</div>
          <div className="text-meta text-ink-500 mt-0.5">来自选择「提取核心」的模块</div>
        </div>
        <div className="p-3 bg-white border border-ink-200 rounded-eng-lg">
          <div className="text-meta text-ink-400 font-bold uppercase">器件数据覆盖</div>
          <div className="text-h3 font-black text-ink-900">{agg.dataCnt} <span className="text-meta text-ink-400">/ {analyses.length}</span></div>
          <div className="text-meta text-ink-500 mt-0.5">无数据模块可导入 KiCad 工程解锁</div>
        </div>
      </div>

      {/* 逐模块决策 */}
      <div className="space-y-2.5">
        {analyses.map(a => {
          const current = a.comp.clipDecision ?? a.recommended;
          return (
            <div key={a.comp.instanceId} className="p-3.5 bg-white border border-ink-200 rounded-eng-lg">
              <div className="flex items-start gap-3">
                <img src={a.comp.thumb} className="w-10 h-10 object-contain rounded border border-ink-100 bg-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-bold text-ink-900">{a.comp.name}</span>
                    <span className={`text-meta px-1.5 py-0.5 rounded-eng font-bold ${codeBadge[a.codeStatus].cls}`}>{codeBadge[a.codeStatus].t}</span>
                    {a.castellated && <span className="text-meta px-1.5 py-0.5 rounded-eng bg-sky-100 text-sky-700 font-bold">邮票孔可贴装</span>}
                    {a.hasKicad
                      ? <span className="text-meta text-ink-400 font-mono">{a.partsTotal} 器件 · {a.connectors} 连接器 · {a.regulators} 稳压</span>
                      : <span className="text-meta text-ink-400">无 KiCad 器件数据</span>}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {a.reasons.map((r, i) => <li key={i} className="text-meta text-ink-500 leading-snug">· {r}</li>)}
                  </ul>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {(['full', 'core', 'remove'] as ClipDecision[]).map(d => {
                    const disabled = d === 'core' && !a.hasKicad && a.codeStatus !== 'mcu';
                    return (
                      <button key={d}
                        disabled={disabled}
                        title={disabled ? '该模块无 KiCad 器件数据,无法生成核心器件清单' : (d === a.recommended ? '系统建议' : '')}
                        onClick={() => setDecision(a.comp.instanceId, d)}
                        className={`px-2.5 py-1.5 text-meta font-bold rounded-eng border transition-colors ${current === d ? decisionMeta[d].cls : 'border-ink-200 text-ink-400 hover:border-ink-400'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        {decisionMeta[d].label}{d === a.recommended ? ' ★' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 下一步操作栏 */}
      <div className="flex items-center justify-between p-3.5 bg-white border border-ink-200 rounded-eng-lg">
        <div className="text-body text-ink-600">
          {(() => {
            const cnt = { full: 0, core: 0, remove: 0 } as Record<string, number>;
            analyses.forEach(a => { cnt[(a.comp.clipDecision ?? a.recommended)]++; });
            return <>决策汇总:<b className="text-sky-700">{cnt.full} 整模块</b> · <b className="text-emerald-700">{cnt.core} 提取核心</b> · <b className="text-red-600">{cnt.remove} 移除</b>(未手动选择的按 ★ 建议计,已随项目自动保存)</>;
          })()}
        </div>
        <button
          onClick={() => setShowSchematic(true)}
          className="px-6 py-2.5 bg-brand-600 text-white rounded-eng-lg text-body font-bold hover:bg-brand-700 transition-colors flex items-center gap-2">
          决策完成 · 生成原理图确认 →
        </button>
      </div>

      {showSchematic && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setShowSchematic(false)}>
          <div className="bg-white rounded-eng-xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-ink-200 flex items-center justify-between">
              <div>
                <div className="text-body font-bold text-ink-900">原理图确认(按剪裁决策拼装)</div>
                <div className="text-meta text-ink-500">整模块按模块符号,「提取核心」的按核心器件符号(标 ·核心);连线为信号级示意。确认无误后进入布局。</div>
              </div>
              <button onClick={() => setShowSchematic(false)} className="text-ink-400 hover:text-ink-700 text-xl">×</button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50">
              <SchematicView state={state} setState={setState} />
            </div>
            <div className="px-5 py-3 border-t border-ink-200 flex justify-end gap-2">
              <button onClick={() => setShowSchematic(false)} className="px-4 py-2 text-body text-ink-500 hover:text-ink-800">返回调整决策</button>
              <button
                onClick={() => { setShowSchematic(false); setState(p => ({ ...p, currentStep: 2 })); }}
                className="px-6 py-2 bg-emerald-600 text-white rounded-eng-lg text-body font-bold hover:bg-emerald-700">
                ✅ 确认原理图 · 进入 PCB 约束 →
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-meta text-ink-400 leading-relaxed">
        ★ = 系统建议 · 决策随项目保存。「提取核心」的具体器件保留清单依赖各模块 KiCad 子电路提取(网络与 BOM 数据已就位,精细到"哪个电阻必须留"的自动分析在后续版本提供);当前版本给出模块级取舍与连接器/电源冗余合并方向。
      </p>
    </div>
  );
};

export default HardwareClippingView;
