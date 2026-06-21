import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on Vercel.' });
  }

  const { state } = req.body;
  if (!state) {
    return res.status(400).json({ error: 'Missing state in request body.' });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const componentsInfo = state.components.map((c: any) => {
      const footprint = c.isChipOnly ? c.footprint : c.moduleFootprint;
      return {
        id: c.instanceId,
        name: c.name,
        type: c.type,
        width_mm: footprint?.width || 20,
        height_mm: footprint?.height || 20
      };
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Board: ${state.pcbConstraints.width}x${state.pcbConstraints.height}mm. Safe Margin: 2mm. Components (IDs and sizes in mm): ${JSON.stringify(componentsInfo)}. IMPORTANT: Calculate precise (x,y) to avoid ANY overlap.`,
      config: {
        systemInstruction: `You are a PCB Layout Engineer. 
        Identify the optimal non-overlapping placement for components in millimeters.
        Board: ${state.pcbConstraints.width}mm x ${state.pcbConstraints.height}mm.
        Origin (0,0) is TOP-LEFT.
        
        Rules:
        1. Return TOP-LEFT corner (x, y) in mm for each id.
        2. MUST NOT OVERLAP. Check (x, y, width_mm, height_mm) of each component.
        3. Buffer: Keep at least 2mm from board edges.
        4. Buffer: Keep at least 2mm between components.
        5. If space is tight, distribute them uniformly.
        6. Return JSON only: { "layout": { "id": { "x": float, "y": float } }, "text": "brief Chinese explanation" }`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            layout: {
              type: Type.OBJECT,
              additionalProperties: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER }
                },
                required: ['x', 'y']
              }
            }
          },
          required: ['text', 'layout']
        }
      }
    });

    const text = response.text;
    if (!text) {
      return res.status(500).json({ error: 'Did not receive valid text from Gemini API.' });
    }
    
    return res.status(200).json(JSON.parse(text));
  } catch (error: any) {
    console.error("PCB Layout Serverless Error:", error);
    return res.status(500).json({ 
      error: "Failed to generate PCB layout via Gemini",
      details: error.message 
    });
  }
}
