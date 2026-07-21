import { GoogleGenAI, Type } from "@google/genai";

// D:AI 布局策略端点 —— AI 只产出"策略"(分区+理由),坐标由前端引擎计算。
// 这是刻意的架构选择:大模型直接吐坐标不可复现且常违反硬约束。
export const maxDuration = 60;
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  const { modules, board } = req.body || {};
  if (!Array.isArray(modules) || !board) return res.status(400).json({ error: 'Missing modules/board' });
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            perModule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  instanceId: { type: Type.STRING },
                  zone: { type: Type.STRING, description: "edge-n|edge-s|edge-e|edge-w|corner|center|any" },
                  reason: { type: Type.STRING, description: "中文,一句话工程理由" },
                },
                required: ['instanceId', 'zone', 'reason'],
              },
            },
            notes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "全局布局说明(中文,≤3条)" },
          },
          required: ['perModule'],
        },
      },
      contents: `You are a senior PCB layout engineer. Assign a placement ZONE (not coordinates) to every module.
Board: ${board.width}mm × ${board.height}mm.
Principles (priority order):
1. External connectors (Grove/USB-C) and the MCU's USB → board edges (edge-n/s/e/w) for accessibility and enclosure openings.
2. RF/antenna modules (WiFi/BLE/LoRa) → corner or edge with clearance; keep other modules away.
3. High-current (>100mA) modules → spread apart, prefer edges for heat dissipation.
4. MCU → center when no RF, else an edge with antenna outward.
5. Everything else → 'any' (engine pulls them near the MCU to minimize trace length).
Return one entry per module with a one-line Chinese reason.

Modules:
${modules.map((m: any) => `${m.instanceId} | ${m.name} | type=${m.type} | conn=${m.connectorType || '-'} | protocols=${(m.protocols || []).join('/')} | current=${m.currentDraw ?? '?'}mA | ${m.w}×${m.h}mm`).join('\n')}`,
    });
    const parsed = JSON.parse(result.text || '{}');
    if (!Array.isArray(parsed.perModule)) throw new Error('bad shape');
    return res.status(200).json(parsed);
  } catch (e: any) {
    console.error('layout-strategy error', e);
    return res.status(502).json({ error: 'AI 策略生成失败', details: e?.message });
  }
}
