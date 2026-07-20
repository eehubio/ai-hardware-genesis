/**
 * 渲染安全工具 —— 修复 F-01/F-10 类崩溃的根源。
 *
 * 模块数据里的 pinMapping / currentDraw 等字段可能是字符串、数字、
 * 对象或对象数组(云库 212 条模块里 171 条 pinMapping 顶层值为对象)。
 * React 不能直接渲染对象,否则抛
 * "Objects are not valid as a React child" 并清空渲染树。
 *
 * 规则:任何要作为 React child 输出的动态值,必须先过 formatValue()。
 */

/** 把任意值格式化成可安全渲染的短字符串。 */
export function formatValue(v: unknown, maxLen = 40): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > maxLen ? v.slice(0, maxLen) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    // 数组:逐项格式化,合并
    const parts = v.slice(0, 4).map(item => formatValue(item, 16));
    const s = parts.join(', ') + (v.length > 4 ? ` 等${v.length}项` : '');
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // 常见形态:{ name/pin/label: xx } 取代表性字段
    for (const key of ['name', 'pin', 'label', 'value', 'type']) {
      if (typeof o[key] === 'string' || typeof o[key] === 'number') return String(o[key]);
    }
    const keys = Object.keys(o);
    if (keys.length === 0) return '—';
    const s = keys.slice(0, 3).join('/') + (keys.length > 3 ? '…' : '');
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  }
  return String(v);
}

/** 安全取数值:数字直接返回;数字字符串解析;对象尝试常见字段;否则 null。 */
export function numeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const key of ['typical', 'max', 'peak', 'value', 'active']) {
      const n = numeric(o[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

/** pinMapping 规整成 [名称, 显示值] 的安全数组。
 *  只保留标量值(string/number)的条目 —— 这些才是真正的引脚分配(如 SDA→"D4")。
 *  对象/数组值(KiCad 导入的结构化连接器/溯源数据混入 pinMapping 时)直接跳过,
 *  既防崩溃,也避免把 "reference/kind/…" 之类的内部结构当引脚显示出来。 */
const PIN_META_KEYS = new Set([
  'connectors', 'verificationstatus', 'source', 'provenance', 'notes',
  'reference', 'kind', 'documentation', 'sourcefile', 'sourcecommit',
  'status', 'verified', 'datasheet', 'wiki', 'description', 'comment',
]);

export function normalizePinMapping(pm: unknown): [string, string][] {
  if (!pm || typeof pm !== 'object' || Array.isArray(pm)) return [];
  return Object.entries(pm as Record<string, unknown>)
    .filter(([k, v]) => {
      // 元数据键(混入 pinMapping 的校验状态/来源说明等)不属于引脚,跳过
      if (PIN_META_KEYS.has(k.toLowerCase())) return false;
      // 只认标量值
      if (typeof v !== 'string' && typeof v !== 'number') return false;
      const s = String(v).trim();
      // 引脚号形如 D4 / A0 / GPIO21 / 3V3:短、无空格。含空格或过长的是说明文字,不是引脚
      if (!s || s.length > 12 || /\s/.test(s)) return false;
      return true;
    })
    .map(([k, v]) => [k, String(v).trim()] as [string, string]);
}

/** 从 pinMapping 安全取单个引脚:仅当值为标量时返回字符串,否则返回 fallback。 */
export function scalarPin(pm: unknown, key: string, fallback: string): string {
  if (!pm || typeof pm !== 'object' || Array.isArray(pm)) return fallback;
  const v = (pm as Record<string, unknown>)[key] ?? (pm as Record<string, unknown>)[key.toLowerCase()];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
}
