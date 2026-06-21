import { HardwareComponent } from '../types';
import { SEEED_MODULE_LIBRARY_IR } from '../constants';

// ---------------------------------------------------------------------------
// 模块数据来源：线上「模块数据平台」的 REST API。
//
// 设计前端通过这里拉取硬件库，实现「单一数据源」：
// 技术编辑在 /admin 后台改了数据，这里下次刷新就能拿到最新的，无需改前端代码。
//
// 部署地址可通过环境变量覆盖；默认指向已部署的 Vercel 平台。
// ---------------------------------------------------------------------------

const API_BASE =
  (typeof process !== 'undefined' && process.env?.MODULE_API_BASE) ||
  'https://ai-hardware-genesis-platform.vercel.app';

/**
 * 字段兜底：平台 API 为了精简会省略空字段，但前端把
 * electrical/physical/software/thumb/spec 当作必填。这里补齐默认值，
 * 防止前端访问 c.electrical.protocols 之类时空指针崩溃。
 */
function normalize(raw: any): HardwareComponent {
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    type: raw.type ?? 'other',
    thumb: raw.thumb ?? '',
    spec: raw.spec ?? '',
    price: typeof raw.price === 'number' ? raw.price : 0,
    sku: raw.sku,
    electrical: raw.electrical ?? {
      voltageRange: [3.3, 5.0],
      currentDraw: 0,
      protocols: [],
      pinMapping: {},
    },
    physical: raw.physical ?? {
      dimensions: { width: 20, height: 20, depth: 10 },
      weight: 0,
      connectorType: 'Grove',
    },
    software: raw.software ?? {
      requiredLibraries: [],
      initCodeSnippet: {},
      sampleUsageSnippet: {},
    },
    pcbIR: raw.pcbIR,
    footprint: raw.footprint,
    moduleFootprint: raw.moduleFootprint,
    availableFootprints: raw.availableFootprints,
    description: raw.description,
    functionalities: raw.functionalities ?? [],
    voltageSource: raw.voltageSource,
    driverRequired: raw.driverRequired,
    referenceProjectUrl: raw.referenceProjectUrl,
    designProjectFiles: raw.designProjectFiles ?? [],
    llmPromptTags: raw.llmPromptTags ?? [],
  };
}

/**
 * 从平台拉取已发布(published)的模块库。
 * 失败时回退到本地写死的种子库，保证前端永远有数据可用。
 */
export async function fetchModuleLibrary(): Promise<HardwareComponent[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/modules?limit=500`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();
    const data: any[] = json?.data ?? [];
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('API returned empty library');
    }
    return data.map(normalize);
  } catch (err) {
    console.warn(
      '[apiService] 无法从云端平台获取模块库，回退到本地种子数据：',
      err
    );
    return SEEED_MODULE_LIBRARY_IR.map(normalize);
  }
}

/** 读取单个模块的完整数据(含工程 IR)。前端按需深取时用。 */
export async function fetchModuleById(
  id: string
): Promise<HardwareComponent | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/modules/${id}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ? normalize(json.data) : null;
  } catch {
    return null;
  }
}
