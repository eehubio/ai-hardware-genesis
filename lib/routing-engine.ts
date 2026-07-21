/**
 * E:布线引擎 —— 曼哈顿网格 A* 避障(示意级)。
 * 定位诚实声明:本引擎验证"连通走廊"——正交走线、绕开模块、少转角、尽量不交叉;
 * 不含线宽/间距/过孔/阻抗等 DRC 规则,交叉处实际制板需换层。绝不显示 "Router Solved"。
 * 单位:mm;确定性(同输入同输出)。
 */
import { CanvasComponent } from '../types';

export interface RBox { instanceId: string; x: number; y: number; w: number; h: number; }
export interface RoutedNet {
  label: string;
  kind: 'I2C' | 'SPI' | 'UART' | 'GPIO';
  from: string; to: string;
  path: { x: number; y: number }[]; // mm 折点序列
  crossings: number;
  fallback: boolean; // A* 失败,退化为直角折线(未避障)
}
export interface RoutingResult {
  nets: RoutedNet[];
  stats: { routed: number; fallbacks: number; crossings: number; totalLenMm: number; corners: number };
}

const CLEAR = 1;      // 模块外扩间隙(mm)
const TURN_COST = 3;  // 转角代价(压少转角)
const CROSS_COST = 8; // 借用已占网格的代价(压少交叉)

const isMcu = (c: CanvasComponent) => c.type === 'mcu' || c.type === 'processor';

function kindOf(c: CanvasComponent): RoutedNet['kind'] {
  const ps = (c.electrical?.protocols || []).map(p => String(p).toUpperCase());
  const spec = (c.spec || '').toLowerCase();
  if (ps.includes('I2C') || spec.includes('i2c')) return 'I2C';
  if (ps.includes('SPI') || spec.includes('spi')) return 'SPI';
  if (ps.includes('UART') || spec.includes('uart')) return 'UART';
  return 'GPIO';
}

/** 面向对端的模块边缘出线点 */
function escapePoint(b: RBox, towards: { x: number; y: number }): { x: number; y: number } {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dx = towards.x - cx, dy = towards.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? b.x + b.w + CLEAR : b.x - CLEAR, y: cy };
  }
  return { x: cx, y: dy >= 0 ? b.y + b.h + CLEAR : b.y - CLEAR };
}

/** I2C 总线成链:主控出发,最近邻贪心 */
function chainOrder(mcuC: { x: number; y: number }, devs: { id: string; c: { x: number; y: number } }[]): string[] {
  const rest = [...devs];
  const order: string[] = [];
  let cur = mcuC;
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((d, i) => {
      const dd = Math.hypot(d.c.x - cur.x, d.c.y - cur.y);
      if (dd < bd) { bd = dd; bi = i; }
    });
    const [pick] = rest.splice(bi, 1);
    order.push(pick.id);
    cur = pick.c;
  }
  return order;
}

export function routeAll(comps: CanvasComponent[], boxes: RBox[], bwMm: number, bhMm: number): RoutingResult {
  const W = Math.max(10, Math.ceil(bwMm)), H = Math.max(10, Math.ceil(bhMm));
  const boxOf = new Map(boxes.map(b => [b.instanceId, b]));
  const center = (b: RBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  // 障碍网格:模块外扩 CLEAR
  const blocked = new Uint8Array(W * H);
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x - CLEAR)), x1 = Math.min(W - 1, Math.ceil(b.x + b.w + CLEAR));
    const y0 = Math.max(0, Math.floor(b.y - CLEAR)), y1 = Math.min(H - 1, Math.ceil(b.y + b.h + CLEAR));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * W + x] = 1;
  }
  const occupied = new Uint16Array(W * H); // 已布网络计数(软障碍)

  const mcu = comps.find(isMcu);
  if (!mcu || !boxOf.get(mcu.instanceId)) return { nets: [], stats: { routed: 0, fallbacks: 0, crossings: 0, totalLenMm: 0, corners: 0 } };
  const mcuBox = boxOf.get(mcu.instanceId)!;

  // ---- 组网 ----
  type Job = { label: string; kind: RoutedNet['kind']; fromId: string; toId: string };
  const jobs: Job[] = [];
  const periph = comps.filter(c => !isMcu(c) && boxOf.get(c.instanceId));
  const i2cDevs = periph.filter(c => kindOf(c) === 'I2C');
  const others = periph.filter(c => kindOf(c) !== 'I2C');
  // I2C 多点总线:链式(SDA/SCL 走同一走廊,示意为一条)
  const order = chainOrder(center(mcuBox), i2cDevs.map(c => ({ id: c.instanceId, c: center(boxOf.get(c.instanceId)!) })));
  let prev = mcu.instanceId;
  for (const id of order) {
    jobs.push({ label: 'I2C 总线', kind: 'I2C', fromId: prev, toId: id });
    prev = id;
  }
  // 网络优先级:I2C 总线已优先入队;其余按 SPI > UART > GPIO(先布关键网络,占用最优走廊)
  const PRIO: Record<string, number> = { SPI: 0, UART: 1, GPIO: 2 };
  for (const c of [...others].sort((a, b) => PRIO[kindOf(a)] - PRIO[kindOf(b)])) {
    jobs.push({ label: kindOf(c), kind: kindOf(c), fromId: mcu.instanceId, toId: c.instanceId });
  }

  // ---- A*(4 邻域 + 方向状态做转角代价)----
  const astar = (s: { x: number; y: number }, t: { x: number; y: number }, allow: Set<number>) => {
    const sx = Math.max(0, Math.min(W - 1, Math.round(s.x))), sy = Math.max(0, Math.min(H - 1, Math.round(s.y)));
    const tx = Math.max(0, Math.min(W - 1, Math.round(t.x))), ty = Math.max(0, Math.min(H - 1, Math.round(t.y)));
    const key = (x: number, y: number, d: number) => (y * W + x) * 4 + d;
    const gScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const open: [number, number, number, number, number][] = []; // f, x, y, dir, g
    const h = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);
    for (let d = 0; d < 4; d++) { open.push([h(sx, sy), sx, sy, d, 0]); gScore.set(key(sx, sy, d), 0); }
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let steps = 0;
    while (open.length && steps++ < 60000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y, dir, g] = open.splice(bi, 1)[0];
      if (x === tx && y === ty) {
        // 回溯
        const pts: { x: number; y: number }[] = [];
        let ck: number | undefined = key(x, y, dir);
        while (ck !== undefined) {
          const cell = Math.floor(ck / 4);
          pts.push({ x: cell % W, y: Math.floor(cell / W) });
          ck = cameFrom.get(ck);
        }
        pts.reverse();
        return pts;
      }
      for (let nd = 0; nd < 4; nd++) {
        const nx = x + DIRS[nd][0], ny = y + DIRS[nd][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const idx = ny * W + nx;
        if (blocked[idx] && !allow.has(idx)) continue;
        let cost = 1 + (nd !== dir ? TURN_COST : 0) + (occupied[idx] > 0 ? CROSS_COST : 0);
        const nk = key(nx, ny, nd);
        const ng = g + cost;
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          cameFrom.set(nk, key(x, y, dir));
          open.push([ng + h(nx, ny), nx, ny, nd, ng]);
        }
      }
    }
    return null;
  };

  // 端点附近解禁(允许从障碍边缘出线)
  const allowNear = (p: { x: number; y: number }, r = 2) => {
    const out = new Set<number>();
    const px = Math.round(p.x), py = Math.round(p.y);
    for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++)
      if (x >= 0 && y >= 0 && x < W && y < H) out.add(y * W + x);
    return out;
  };

  const simplify = (pts: { x: number; y: number }[]) => {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
      out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  const nets: RoutedNet[] = [];
  let totalLen = 0, totalCorners = 0, totalCross = 0, fallbacks = 0;

  for (const job of jobs) {
    const fb = boxOf.get(job.fromId)!, tb = boxOf.get(job.toId)!;
    const s = escapePoint(fb, center(tb));
    const t = escapePoint(tb, center(fb));
    const allow = new Set([...allowNear(s), ...allowNear(t)]);
    const raw = astar(s, t, allow);
    let path: { x: number; y: number }[];
    let isFallback = false;
    if (raw) {
      path = simplify(raw);
    } else {
      // 诚实退化:直角折线(可能穿越模块),明确标记
      isFallback = true; fallbacks++;
      const midX = (s.x + t.x) / 2;
      path = [{ x: s.x, y: s.y }, { x: midX, y: s.y }, { x: midX, y: t.y }, { x: t.x, y: t.y }];
    }
    // 统计 + 登记占用(交叉计数)
    let cross = 0;
    if (raw) {
      for (const p of raw) {
        const idx = Math.round(p.y) * W + Math.round(p.x);
        if (occupied[idx] > 0) cross++;
        occupied[idx]++;
      }
    }
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    totalLen += len;
    totalCorners += Math.max(0, path.length - 2);
    totalCross += cross;
    nets.push({ label: job.label, kind: job.kind, from: job.fromId, to: job.toId, path, crossings: cross, fallback: isFallback });
  }

  return { nets, stats: { routed: nets.length, fallbacks, crossings: totalCross, totalLenMm: Math.round(totalLen), corners: totalCorners } };
}
