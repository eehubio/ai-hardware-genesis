import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on Vercel.' });
  }

  const { prompt, state, history = [] } = req.body;
  if (!prompt || !state) {
    return res.status(400).json({ error: 'Missing prompt or state in request body.' });
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are AI Orchestrator, an AI hardware expert for Seeed Studio.
      Your task is to help users design hardware projects using Seeed's XIAO MCUs and Grove modules.
      
      CRITICAL RULE FOR GRADUAL DESIGN DISCOVERY (FOR MULTI-STEP QUESTIONS):
      1. DO NOT instantly recommend a full set of components on the first turn or if user intent is still generic, broad, or lacks specific detail.
      2. If the user's prompt is broad (e.g., "制作一个自动浇花系统", "做一个智能手表", "我想连WIFI做个采集器") or the design scope is not locked in yet:
         - Keep the conversation interactive and step-by-step.
         - Do not suggest full systems immediately. Instead, ask 1 to 2 key questions about their target application, preferred communication protocols (WiFi/BLE/LoRa), sensor requirements, power supply constraints, or user interface preference (screen/web/relay).
         - In this questioning/exploration stage, your "cards" array should NOT have "solutionComponents" with actual hardware IDs. Set "solutionComponents: []" (empty array) or omit it. This prevents the UI from displaying "应用完整系统方案" or "应用此子方案" buttons too early. Keep card type as "info" or "warn" to provide hints or explanation.
         - ALWAYS provide 2 to 4 structured options in the "options" array. Each option = {label(中文≤12字), dimension, value, exclusive}. dimension ∈ [mcu, display, sensing, connectivity, power, audio, input, enclosure, other]. exclusive=true when the dimension is single-choice (display type, mcu, power source, connectivity) so mutually exclusive choices REPLACE each other; exclusive=false for stackable features (sensing capabilities). Options in the same question about the same single-choice dimension MUST share the same dimension and exclusive=true.
      3. ONLY when the user's requirements are clearly defined (typically after 2-3 turns of dialogue, or if they explicitly ask "直接给我推荐方案", "不用问了请输出列表", "直接出方案吧"), THEN generate and suggest the concrete set of component IDs.
         - During this recommendation stage, "options" can be empty or empty list.
      4. When recommending a final solution, ALWAYS include EXACTLY ONE MCU in the solution.
         - The "solutionComponents" array in your final solution cards MUST contain the IDs of EVERY piece of hardware mentioned. If you describe 4 components, there must be 4 IDs.
      5. Whenever you recommend a final solution/system (typically in step 3), you MUST explicitly include the following sections under the solution description (either in the main conversational text or in a designated supplementary layout info card):
         - 🔋 **供电建议 (Power Supply Advice)**: Clearly state whether to use USB, battery, or both, as well as the working voltage (e.g., 3.3V / 5V) and recommended minimum current (e.g., 500mA or 1A).
         - 🛠️ **编程及刷录工具 (Programming Tools)**: Recommend suitable IDEs (like Arduino IDE, VS Code + PlatformIO) and any driver/flashing requirements.
         - 📚 **所需技术基础 (Required Tech Skills)**: Level of experience needed (e.g., basic C/C++ programming, basic electronics/wiring concept).
         - ⏱️ **预计项目工时 (Estimated Project Time)**: An realistic estimate of how long this project takes to fully assemble, code, and test (e.g., 2-4 hours, 1 day, depending on complexity).
      
      Hardware catalog: the LIVE catalog is provided in the user message ("Available Hardware Catalog"). ONLY use ids from it — never this outdated list, never invent ids.
      
      Response Format:
      - Return a friendly, professional explanation in Chinese ('text').
      - In 'cards', provide helpful high-level summary cards (e.g., '准备步骤', '核心思路', '当前选择'). Only include actual component IDs in 'solutionComponents' when ready to recommend the final system.
      - In 'options', provide structured {label, dimension, value, exclusive} objects per the rules above.
      - REQUIREMENT STATE MACHINE: the user message includes "Confirmed requirements". NEVER re-ask a dimension that already has a confirmed decision. Every solution MUST respect all confirmed decisions. If the user's new input contradicts a confirmed decision, treat it as an intentional change, acknowledge it, and proceed with the new value.
      - Output MUST be valid JSON only.`;

  try {
    const formattedHistory = (history || []).slice(-8)
      .map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${String(h.text || '').slice(0, 400)}`)
      .join('\n');

    // F-03 根修:硬件清单从真实模块库动态生成(前端已随 state.library 传入),
    // 不再使用写死清单 —— 新建到云库的模块(如音频放大器)立刻可被推荐。
    const lib: any[] = Array.isArray(state.library) ? state.library : [];
    const catalog = lib.length > 0
      ? lib.map((c: any) => `${c.id} | ${c.name || ''} | ${c.type || ''}${c.spec ? ' | ' + String(c.spec).slice(0, 40) : ''}`).join('\n')
      : '(module library is empty)';

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Confirmed requirements (state machine; do NOT re-ask these dimensions, solutions MUST respect them):
${JSON.stringify(Object.fromEntries(Object.entries((state.requirements || {}) as Record<string, any[]>).map(([k, v]) => [k, (v || []).map((d: any) => d.label)])))}

Available Hardware Catalog (LIVE database, format: id | name | type | brief):
${catalog}

      STRICT RULE: solutionComponents may ONLY contain ids from the catalog above (first column, exact match). Never invent ids. If no suitable module exists in the catalog for a needed function, say so explicitly in text instead of substituting.
      CAPABILITY MATCHING RULE: when the user's request implies a capability (audio output → speaker/amplifier/audio modules; display → display modules; wireless → communication modules; storage, input, etc.), SEARCH the catalog for matching modules and INCLUDE them in the solution. Do NOT tell the user to attach external hardware when a matching module exists in the catalog, unless the user explicitly prefers external.

      Current components placed on board: ${JSON.stringify(state.components.map((c: any) => c.id))}
      
      Conversation History:
      ${formattedHistory}
      
      New User Input: ${prompt}`,
      config: {
        systemInstruction: systemInstruction,
        // 504 修复:关闭 thinking(默认开启,叠加大目录+结构化 schema 常跑超 60s 函数上限)
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 8192, // 上限护栏(2400 会截断结构化 JSON 导致解析 500;超时根因已由历史裁剪+关thinking解决)
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { 
              type: Type.STRING,
              description: "Main conversational response to the user."
            },
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['info', 'warn', 'success'] },
                  action: { type: Type.STRING, description: "Small button text" },
                  solutionComponents: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "A list of hardware IDs that form a complete working system. MUST match the text description."
                  }
                },
                required: ['title', 'description', 'type']
              }
            },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "中文按钮文字,≤12 字" },
                  dimension: { type: Type.STRING, description: "mcu|display|sensing|connectivity|power|audio|input|enclosure|other" },
                  value: { type: Type.STRING, description: "机器可读值,如 oled_096 / wifi / battery" },
                  exclusive: { type: Type.BOOLEAN, description: "该维度是否单选(互斥)" }
                },
                required: ['label']
              },
              description: "2 to 4 structured quick options; mutually exclusive choices share a dimension with exclusive=true."
            }
          },
          required: ['text', 'cards']
        }
      }
    });

    const responseText = result.text;
    if (!responseText) {
      throw new Error("Empty response from AI");
    }

    let jsonStr = responseText.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```/, "").replace(/```$/, "").trim();
    }

    return res.status(200).json(JSON.parse(jsonStr));
  } catch (error: any) {
    console.error("Gemini Assistant Serverless Error:", error);
    return res.status(500).json({ 
      error: "Failed to generate AI response",
      details: error.message 
    });
  }
}
