/**
 * D:布局引擎 —— 混合架构的「算法执行 + 规则校验」层。
 * AI(或规则基线)只产出**策略**(每模块分区/理由),坐标一律由本引擎计算:
 *   strategy → 分区种子落位 → 迭代弛豫(去重叠/拉近主控/边界约束)→ 规则打分
 * 单位:全程 mm;调用方自行乘 FOOTPRINT_SCALE 转像素。
 */
import { CanvasComponent } from '../types';
import { numeric } from '../utils/safe';

export type Zone = 'edge-n' | 'edge-s' | 'edge-e' | 'edge-w' | 'corner' | 'center' | 'any';
export interface ModuleStrategy { instanceId: string; zone: Zone; reason: string; }
export interface StrategyResult { perModule: ModuleStrategy[]; source: 'ai' | 'rules'; notes: string[]; }
export interface PlacedBox { instanceId: string; x: number; y: number; w: number; h: number; } // x,y = 左上角 mm
export interface RuleCheck { rule: string; status: 'pass' | 'warn'; detail: string; }

const RF_PROTOS = ['WIFI', 'BLE', 'LORA', 'ZIGBEE', 'NFC'];
const HOT_MA = 100;
const EDGE_NEAR_MM = 6;     // 判定"贴边"的距离
const ANTENNA_CLEAR_MM = 8; // 天线净空
const HOT_SPACING_MM = 10;  // 发热器件间距
const MARGIN = 3;           // 板边留白
const GAP = 2;              // 模块最小间隙

const isMcu = (c: CanvasComponent) => c.type === 'mcu' || c.type === 'processor';
const hasRF = (c: CanvasComponent) => (c.electrical?.protocols || []).some(p => RF_PROTOS.includes(String(p).toUpperCase()));
const isHot = (c: CanvasComponent) => (numeric(c.electrical?.currentDraw) ?? 0) >= HOT_MA;
const hasExtConn = (c: CanvasComponent) => ['Grove', 'USB-C'].includes(c.physical?.connectorType || '');

export function sizeOf(c: CanvasComponent): { w: number; h: number } {
  const fp = (c as any).isChipOnly ? (c as any).footprint : (c as any).moduleFootprint;
  return { w: fp?.width || 20, h: fp?.height || 20 };
}

/** 规则基线策略(AI 不可用时的回退,也是 AI 输出的合法性参照) */
export function buildRuleStrategy(comps: CanvasComponent[]): StrategyResult {
  const edges: Zone[] = ['edge-e', 'edge-s', 'edge-n', 'edge-w'];
  let edgeIdx = 0;
  const perModule: ModuleStrategy[] = comps.map(c => {
    if (isMcu(c)) {
      return hasRF(c)
        ? { instanceId: c.instanceId, zone: 'edge-w', reason: '主控含射频(天线端贴板边,减少遮挡),USB 口朝外便于烧录' }
        : { instanceId: c.instanceId, zone: 'center', reason: '主控居中,缩短到各外设的走线' };
    }
    if (hasRF(c)) return { instanceId: c.instanceId, zone: 'corner', reason: '含射频天线 → 角落放置并保持净空' };
    if (hasExtConn(c)) {
      const z = edges[edgeIdx++ % edges.length];
      return { instanceId: c.instanceId, zone: z, reason: `${c.physical?.connectorType} 对外接口 → 贴板边便于插拔与开孔` };
    }
    if (isHot(c)) return { instanceId: c.instanceId, zone: 'edge-s', reason: `工作电流 ${numeric(c.electrical?.currentDraw)}mA → 贴边利于散热并远离敏感器件` };
    return { instanceId: c.instanceId, zone: 'any', reason: '无特殊约束,按走线最短就近主控' };
  });
  return { perModule, source: 'rules', notes: ['策略由内置布局规则生成(连接器贴边/射频净空/发热分散/主控居中)'] };
}

function zoneSeed(zone: Zone, i: number, n: number, bw: number, bh: number, w: number, h: number): { x: number; y: number } {
  const t = n > 1 ? i / (n - 1) : 0.5;
  switch (zone) {
    case 'edge-n': return { x: MARGIN + t * (bw - w - 2 * MARGIN), y: MARGIN };
    case 'edge-s': return { x: MARGIN + t * (bw - w - 2 * MARGIN), y: bh - h - MARGIN };
    case 'edge-w': return { x: MARGIN, y: MARGIN + t * (bh - h - 2 * MARGIN) };
    case 'edge-e': return { x: bw - w - MARGIN, y: MARGIN + t * (bh - h - 2 * MARGIN) };
    case 'corner': {
      const corners = [{ x: MARGIN, y: MARGIN }, { x: bw - w - MARGIN, y: MARGIN }, { x: MARGIN, y: bh - h - MARGIN }, { x: bw - w - MARGIN, y: bh - h - MARGIN }];
      return corners[i % 4];
    }
    case 'center': return { x: (bw - w) / 2, y: (bh - h) / 2 };
    default: return { x: bw * (0.3 + 0.4 * ((i * 37) % 10) / 10) - w / 2, y: bh * (0.3 + 0.4 * ((i * 53) % 10) / 10) - h / 2 };
  }
}

/** 分区落位 + 迭代弛豫(确定性,无随机) */
export function executePlacement(comps: CanvasComponent[], strategy: StrategyResult, bw: number, bh: number): PlacedBox[] {
  const stratMap = new Map(strategy.perModule.map(s => [s.instanceId, s]));
  const byZone: Record<string, number> = {};
  const boxes: PlacedBox[] = comps.map(c => {
    const { w, h } = sizeOf(c);
    const z = stratMap.get(c.instanceId)?.zone || 'any';
    const idx = (byZone[z] = (byZone[z] ?? -1) + 1);
    const cnt = strategy.perModule.filter(s => s.zone === z).length;
    const seed = zoneSeed(z, idx, cnt, bw, bh, w, h);
    return { instanceId: c.instanceId, x: seed.x, y: seed.y, w, h };
  });

  const anchorZone = (b: PlacedBox) => stratMap.get(b.instanceId)?.zone || 'any';
  const mcuBox = boxes.find(b => { const c = comps.find(x => x.instanceId === b.instanceId)!; return isMcu(c); });

  for (let iter = 0; iter < 120; iter++) {
    // 1) 两两去重叠(带间隙的矩形斥力,各推一半)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
        const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
        const ox = (a.w + b.w) / 2 + GAP - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + GAP - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) { const push = (dx >= 0 ? 1 : -1) * ox / 2; a.x += push; b.x -= push; }
          else { const push = (dy >= 0 ? 1 : -1) * oy / 2; a.y += push; b.y -= push; }
        }
      }
    }
    // 2) 'any' 区模块向主控轻微吸引(缩短走线)
    if (mcuBox) {
      for (const b of boxes) {
        if (b === mcuBox || anchorZone(b) !== 'any') continue;
        b.x += ((mcuBox.x + mcuBox.w / 2) - (b.x + b.w / 2)) * 0.04;
        b.y += ((mcuBox.y + mcuBox.h / 2) - (b.y + b.h / 2)) * 0.04;
      }
    }
    // 3) 分区锚定(贴边的每轮拉回边线,防止被斥力推离)
    for (const b of boxes) {
      const z = anchorZone(b);
      if (z === 'edge-n') b.y += (MARGIN - b.y) * 0.5;
      if (z === 'edge-s') b.y += (bh - b.h - MARGIN - b.y) * 0.5;
      if (z === 'edge-w') b.x += (MARGIN - b.x) * 0.5;
      if (z === 'edge-e') b.x += (bw - b.w - MARGIN - b.x) * 0.5;
    }
    // 4) 边界硬约束
    for (const b of boxes) {
      b.x = Math.max(MARGIN, Math.min(b.x, bw - b.w - MARGIN));
      b.y = Math.max(MARGIN, Math.min(b.y, bh - b.h - MARGIN));
    }
  }
  for (const b of boxes) { b.x = Math.round(b.x * 10) / 10; b.y = Math.round(b.y * 10) / 10; }
  return boxes;
}

/** 规则校验打分 —— 结果如实,不粉饰 */
export function validateLayout(comps: CanvasComponent[], boxes: PlacedBox[], bw: number, bh: number): RuleCheck[] {
  const out: RuleCheck[] = [];
  const box = (id: string) => boxes.find(b => b.instanceId === id)!;
  const compOf = (id: string) => comps.find(c => c.instanceId === id)!;
  const center = (b: PlacedBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const dist = (a: PlacedBox, b: PlacedBox) => { const ca = center(a), cb = center(b); return Math.hypot(ca.x - cb.x, ca.y - cb.y); };
  const edgeDist = (b: PlacedBox) => Math.min(b.x, b.y, bw - b.x - b.w, bh - b.y - b.h);

  // 1) 板内 + 无重叠(硬)
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (!(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)) overlaps++;
    }
  const outside = boxes.filter(b => b.x < 0 || b.y < 0 || b.x + b.w > bw || b.y + b.h > bh).length;
  out.push(overlaps === 0 && outside === 0
    ? { rule: '板框与间距', status: 'pass', detail: '全部模块在板内且无重叠' }
    : { rule: '板框与间距', status: 'warn', detail: `${overlaps} 处重叠 / ${outside} 个越界 —— 请手动微调` });

  // 2) 对外连接器贴边
  const connMods = comps.filter(hasExtConn);
  if (connMods.length) {
    const bad = connMods.filter(c => edgeDist(box(c.instanceId)) > EDGE_NEAR_MM);
    out.push(bad.length === 0
      ? { rule: '连接器贴边', status: 'pass', detail: `${connMods.length}/${connMods.length} 个对外接口模块贴近板边` }
      : { rule: '连接器贴边', status: 'warn', detail: `${bad.map(c => c.name).join('、')} 距板边 >${EDGE_NEAR_MM}mm,插拔/开孔不便` });
  }

  // 3) 射频净空
  const rfMods = comps.filter(hasRF);
  for (const rf of rfMods) {
    const rb = box(rf.instanceId);
    const near = boxes.filter(b => b !== rb && dist(rb, b) - (Math.max(rb.w, rb.h) + Math.max(b.w, b.h)) / 2 < ANTENNA_CLEAR_MM);
    out.push(near.length === 0
      ? { rule: `射频净空(${rf.name.split(' ').pop()})`, status: 'pass', detail: `周边 ${ANTENNA_CLEAR_MM}mm 内无其他模块` }
      : { rule: `射频净空(${rf.name.split(' ').pop()})`, status: 'warn', detail: `${near.length} 个模块过近,可能影响天线性能` });
  }

  // 4) 发热分散
  const hotMods = comps.filter(isHot);
  if (hotMods.length >= 2) {
    let minD = Infinity;
    for (let i = 0; i < hotMods.length; i++)
      for (let j = i + 1; j < hotMods.length; j++)
        minD = Math.min(minD, dist(box(hotMods[i].instanceId), box(hotMods[j].instanceId)));
    out.push(minD >= HOT_SPACING_MM
      ? { rule: '发热分散', status: 'pass', detail: `${hotMods.length} 个大电流模块最小间距 ${minD.toFixed(1)}mm` }
      : { rule: '发热分散', status: 'warn', detail: `大电流模块最小间距仅 ${minD.toFixed(1)}mm(建议 ≥${HOT_SPACING_MM}mm)` });
  }

  // 5) 走线经济(信息项)
  const mcu = comps.find(isMcu);
  if (mcu) {
    const mb = box(mcu.instanceId);
    const others = boxes.filter(b => b.instanceId !== mcu.instanceId);
    if (others.length) {
      const avg = others.reduce((s, b) => s + dist(mb, b), 0) / others.length;
      out.push({ rule: '走线经济', status: 'pass', detail: `外设到主控平均距离 ${avg.toFixed(1)}mm(越小越省走线)` });
    }
  }
  return out;
}
