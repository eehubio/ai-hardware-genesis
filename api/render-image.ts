import { GoogleGenAI } from "@google/genai";

// 生成产品工业设计效果图 —— 使用 Nano Banana (gemini-2.5-flash-image)
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on Vercel.' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body.' });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
    });

    // 从返回的 parts 中提取 base64 图像
    const parts = result?.candidates?.[0]?.content?.parts || [];
    let imageData: string | null = null;
    let mimeType = 'image/png';
    for (const part of parts) {
      if ((part as any).inlineData?.data) {
        imageData = (part as any).inlineData.data;
        mimeType = (part as any).inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!imageData) {
      return res.status(502).json({ error: '模型未返回图像,请重试或调整描述。' });
    }

    return res.status(200).json({
      image: `data:${mimeType};base64,${imageData}`,
    });
  } catch (error: any) {
    console.error("Gemini Render-Image Serverless Error:", error);
    return res.status(500).json({
      error: "Failed to generate product render",
      details: error.message,
    });
  }
}
