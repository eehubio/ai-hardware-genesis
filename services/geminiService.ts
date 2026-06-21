
import { GoogleGenAI, Type } from "@google/genai";
import { ProjectState } from "../types";

export const generateAIAssistance = async (prompt: string, state: ProjectState, history: any[] = []) => {
  const activeApiKey = process.env.API_KEY;

  if (!activeApiKey) {
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, state, history })
      });
      if (!res.ok) throw new Error(`Vercel status ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error("Vercel Serverless Assistant Fetch Error:", error);
      return { 
        text: "抱歉，分析您的设计意图时遇到了问题。请确保描述清晰或稍后重试。", 
        cards: [
          { 
            title: "连接超时", 
            description: "AI 引擎目前响应较慢，您可以尝试直接从左侧库中手动拖拽组件。", 
            type: "warn" 
          }
        ] 
      };
    }
  }

  const ai = new GoogleGenAI({ apiKey: activeApiKey });

  const systemInstruction = `You are AI Orchestrator, an AI hardware expert for Seeed Studio.
      Your task is to help users design hardware projects using Seeed's XIAO MCUs and Grove modules.
      
      CRITICAL RULE FOR GRADUAL DESIGN DISCOVERY (FOR MULTI-STEP QUESTIONS):
      1. DO NOT instantly recommend a full set of components on the first turn or if user intent is still generic, broad, or lacks specific detail.
      2. If the user's prompt is broad (e.g., "制作一个自动浇花系统", "做一个智能手表", "我想连WIFI做个采集器") or the design scope is not locked in yet:
         - Keep the conversation interactive and step-by-step.
         - Do not suggest full systems immediately. Instead, ask 1 to 2 key questions about their target application, preferred communication protocols (WiFi/BLE/LoRa), sensor requirements, power supply constraints, or user interface preference (screen/web/relay).
         - In this questioning/exploration stage, your "cards" array should NOT have "solutionComponents" with actual hardware IDs. Set "solutionComponents: []" (empty array) or omit it. This prevents the UI from displaying "应用完整系统方案" or "应用此子方案" buttons too early. Keep card type as "info" or "warn" to provide hints or explanation.
         - ALWAYS provide 2 to 4 concise option strings in the "options" array reflecting potential responses (e.g., ["需要屏幕显示", "不需要屏幕", "支持WiFi与手机通信", "采用本地音频报警"]). These options will be displayed as clickable buttons for the user to answer with one-click. Make them short (under 12 Chinese characters).
      3. ONLY when the user's requirements are clearly defined (typically after 2-3 turns of dialogue, or if they explicitly ask "直接给我推荐方案", "不用问了请输出列表", "直接出方案吧"), THEN generate and suggest the concrete set of component IDs.
         - During this recommendation stage, "options" can be empty or empty list.
      4. When recommending a final solution, ALWAYS include EXACTLY ONE MCU in the solution.
         - The "solutionComponents" array in your final solution cards MUST contain the IDs of EVERY piece of hardware mentioned. If you describe 4 components, there must be 4 IDs.
      5. Whenever you recommend a final solution/system (typically in step 3), you MUST explicitly include the following sections under the solution description (either in the main conversational text or in a designated supplementary layout info card):
         - 🔋 **供电建议 (Power Supply Advice)**: Clearly state whether to use USB, battery, or both, as well as the working voltage (e.g., 3.3V / 5V) and recommended minimum current (e.g., 500mA or 1A).
         - 🛠️ **编程及刷录工具 (Programming Tools)**: Recommend suitable IDEs (like Arduino IDE, VS Code + PlatformIO) and any driver/flashing requirements.
         - 📚 **所需技术基础 (Required Tech Skills)**: Level of experience needed (e.g., basic C/C++ programming, basic electronics/wiring concept).
         - ⏱️ **预计项目工时 (Estimated Project Time)**: An realistic estimate of how long this project takes to fully assemble, code, and test (e.g., 2-4 hours, 1 day, depending on complexity).
      
      Available Library IDs:
      - MCUs: xiao_esp32s3, xiao_nrf52840_sense, xiao_rp2040
      - Sensors: bme280, sht40, sgp40, lis3dhtr, gps_air530, grove_vision_ai_v2, ultrasonic, pir_sensor, light_sensor, soil_moisture
      - Displays: oled_096, lcd_rgb_backlight
      - Actuators: relay, buzzer, rotary_encoder, led_chainable, lora_e5
      
      Response Format:
      - Return a friendly, professional explanation in Chinese ('text').
      - In 'cards', provide helpful high-level summary cards (e.g., '准备步骤', '核心思路', '当前选择'). Only include actual component IDs in 'solutionComponents' when ready to recommend the final system.
      - In 'options', provide 2 to 4 quick action choices for the user. Keep them short, clean, and contextually matching your questions.
      - Output MUST be valid JSON only.`;

  try {
    const formattedHistory = history
      .map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`)
      .join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Available Hardware:
      - MCUs: xiao_esp32s3 (ESP32-S3), xiao_nrf52840_sense, xiao_rp2040
      - Sensors: bme280 (temp/humidity/pressure), sht40 (temp/humidity), sgp40 (VOC), lis3dhtr (accelerometer), gps_air530 (GPS), grove_vision_ai_v2 (vision AI), ultrasonic (distance), pir_sensor (motion), light_sensor, soil_moisture
      - Displays: oled_096, lcd_rgb_backlight
      - Actuators: relay, buzzer, rotary_encoder, led_chainable, lora_e5 (LoRaWAN)

      Current components placed on board: ${JSON.stringify(state.components.map(c => c.id))}
      
      Conversation History:
      ${formattedHistory}
      
      New User Input: ${prompt}`,
      config: {
        systemInstruction: systemInstruction,
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
              items: { type: Type.STRING },
              description: "2 to 4 quick action options in Chinese for the user to select. Representing common, concise responses to the current question (e.g. ['有屏幕需求', '无需屏幕']). Make them very short and clickable."
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

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Gemini Assistant Error:", error);
    return { 
      text: "抱歉，分析您的设计意图时遇到了问题。请确保描述清晰或稍后重试。", 
      cards: [
        { 
          title: "连接超时", 
          description: "AI 引擎目前响应较慢，您可以尝试直接从左侧库中手动拖拽组件。", 
          type: "warn" 
        }
      ] 
    };
  }
};

export const generatePCBlayout = async (state: ProjectState) => {
  const activeApiKey = process.env.API_KEY;

  if (!activeApiKey) {
    try {
      const res = await fetch("/api/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state })
      });
      if (!res.ok) throw new Error(`Vercel status ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error("Vercel Serverless PCB Layout Fetch Error:", error);
      return null;
    }
  }

  const ai = new GoogleGenAI({ apiKey: activeApiKey });

  try {
    const componentsInfo = state.components.map(c => {
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
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    console.error("PCB Layout AI Error:", error);
    return null;
  }
};
