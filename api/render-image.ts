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

  const { prompt, refImage } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body.' });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // 构建 contents:有参考图则走图生图(文本 + 图像),否则纯文本生成
    let contents: any;
    if (refImage && typeof refImage === 'string' && refImage.startsWith('data:')) {
      const match = refImage.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const data = match[2];
        contents = [
          { inlineData: { mimeType, data } },
          { text: prompt },
        ];
      } else {
        contents = prompt;
      }
    } else {
      contents = prompt;
    }

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents,
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
