import { GoogleGenAI } from "@google/genai";

// 生成产品工业设计效果图 —— 使用 Nano Banana (gemini-2.5-flash-image)
// 支持多参考图:模块照片(thumbs)+ 可选用户草图,融合成整机概念图。
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on Vercel.' });
  }

  const { prompt, refImage, refImages } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body.' });
  }

  const ai = new GoogleGenAI({ apiKey });

  // 把一个图像引用(data: URI 或 http URL)规整成 inlineData part
  async function toInlinePart(ref: string): Promise<any | null> {
    if (!ref || typeof ref !== 'string') return null;
    try {
      if (ref.startsWith('data:')) {
        const m = ref.match(/^data:(.+?);base64,(.+)$/);
        if (!m) return null;
        return { inlineData: { mimeType: m[1], data: m[2] } };
      }
      if (ref.startsWith('http')) {
        const resp = await fetch(ref);
        if (!resp.ok) return null;
        const mimeType = resp.headers.get('content-type') || 'image/png';
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > 4 * 1024 * 1024) return null; // 跳过过大图
        return { inlineData: { mimeType, data: buf.toString('base64') } };
      }
    } catch {
      return null;
    }
    return null;
  }

  try {
    const refs: string[] = Array.isArray(refImages)
      ? refImages
      : (refImage ? [refImage] : []);

    const imageParts: any[] = [];
    for (const ref of refs.slice(0, 8)) {
      const part = await toInlinePart(ref);
      if (part) imageParts.push(part);
    }

    const contents: any = imageParts.length > 0
      ? [...imageParts, { text: prompt }]
      : prompt;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents,
    });

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
      refCount: imageParts.length,
    });
  } catch (error: any) {
    console.error("Gemini Render-Image Serverless Error:", error);
    return res.status(500).json({
      error: "Failed to generate product render",
      details: error.message,
    });
  }
}
