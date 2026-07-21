import { GoogleGenAI } from "@google/genai";

// 固件 AI 助手 serverless(此前前端直连 Gemini,构建期 API_KEY 为空必失败 → 迁到服务端)
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  const { lang, peripherals, currentCode, instruction } = req.body || {};
  if (!instruction) return res.status(400).json({ error: 'Missing instruction' });
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { thinkingConfig: { thinkingBudget: 0 } },
      contents: `Current Language: ${lang}
Hardware List (with real protocols from database): ${JSON.stringify(peripherals)}
Current Code:\n\`\`\`\n${currentCode}\n\`\`\`\n
User Instruction: ${instruction}

Please act as a senior Seeed Studio firmware expert.
1. Respect each module's real protocol (I2C devices must use I2C drivers, never analogRead).
2. If the user wants a code change, provide the FULL corrected code inside one markdown code block.
3. Explain changes briefly in Chinese using Markdown.`,
    });
    return res.status(200).json({ text: result.text || '' });
  } catch (e: any) {
    console.error('firmware-chat error', e);
    return res.status(500).json({ error: 'AI 调用失败', details: e.message });
  }
}
