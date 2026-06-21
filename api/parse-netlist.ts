import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured.' });
  }

  const { text, filename } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing file content text in request body.' });
  }

  // Cap the text length to avoid token limits for very large files
  const maxLength = 50000;
  const processText = text.substring(0, maxLength);

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are an expert AI hardware design engineer, specialized in electronic CAD, netlist formats (such as KiCad .net, XML, Protel, or Eagle netlists) and KiCad schematic (.kicad_sch) files.

Your role is to analyze a raw CAD engineering netlist or schematic file uploaded by the user, extract component information, identify physical pin assignments, trace network (net) connections, and provide a technical analysis of the sub-circuit.

Please analyze the provided file carefully. Follow these rules for extraction and synthesis:
1. Identify the primary or most complex functional component in interest from the netlist/schematic (e.g., if there's a BME280 sensor, an OLED, or a main chip, identify it).
2. Extract all of its connected pins: find which pin numbers of that focal component connect to which network labels (Nets like GND, VCC, 3V3, SDA, SCL, TX, RX, MISO, MOSI, SCK, CS, etc.).
3. Standardize signal names:
   - Map ground lines to 'GND'.
   - Map power lines to 'VCC' or '3V3' or '5V'.
   - Map I2C signals to 'SDA' and 'SCL'.
   - Map UART signals to 'TX' and 'RX'.
   - Map SPI signals to 'MISO', 'MOSI', 'SCK', 'CS'.
4. Provide a structured and readable breakdown of:
   - componentName: Desired name of the detected module/chip (e.g., "Grove BME280 Sensor" or "VEML7700 Light Sensor").
   - description: A brief description of what this part does based on its value/type.
   - category: One of ['MCU', 'Sensor', 'Display', 'Actuator', 'Interface', 'Power'].
   - pins: A list of objects { "pinNumber": "1", "pinName": "GND" } representing the pins of the primary component and their standard signal tags.
   - specifications: Estimated working voltage (e.g. "3.3V") or other parameters extracted.
   - driverRequired: Recommended software driver library if it's a known sensor/actuator (e.g. "Adafruit BME280 Library").
   - netlistAnalysisReport: A clear, concise, professional markdown report summarizing the electrical network and component connections found. (e.g., which connectors the signals run to, what capacitors or status LEDs are tied to it, pull-up resistor counts on SDA/SCL, etc.). Make this look beautiful, structured, and informative.

Response Format MUST be JSON strictly adhering to the schema.`;

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Filename: ${filename || 'unknown.sch'}
Content:
\`\`\`
${processText}
\`\`\`

Analyze the netlist or schematic text and return the structured component and connection report.`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            componentName: { 
              type: Type.STRING, 
              description: "The identified high-level name of the main component in the netlist." 
            },
            description: { 
              type: Type.STRING, 
              description: "Clear description of the main component's role." 
            },
            category: { 
              type: Type.STRING, 
              description: "Must be one of MCU, Sensor, Display, Actuator, Interface, Power." 
            },
            pins: {
              type: Type.ARRAY,
              description: "A standardized list of physical pin numbers mapped to functional signal names (SDA, SCL, TX, RX, GND, VCC etc.).",
              items: {
                type: Type.OBJECT,
                properties: {
                  pinNumber: { type: Type.STRING, description: "e.g. '1', '2', 'A1', 'D4'" },
                  pinName: { type: Type.STRING, description: "e.g. 'GND', 'VCC', 'SDA', 'SCL'" }
                },
                required: ['pinNumber', 'pinName']
              }
            },
            specifications: { 
              type: Type.STRING, 
              description: "Voltage, current, or size specs, e.g., '3.3V / 5.0V, < 10mA'." 
            },
            driverRequired: { 
              type: Type.STRING, 
              description: "Recommended Arduino/C++ library, e.g. 'Adafruit BME280 Library'." 
            },
            netlistAnalysisReport: { 
              type: Type.STRING, 
              description: "Markdown report summarizing the netlist's electrical connections, sub-circuits, decaps, pull-ups, and connectors detected." 
            }
          },
          required: ['componentName', 'description', 'category', 'pins', 'netlistAnalysisReport']
        }
      }
    });

    const responseText = result.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini parsing netlist");
    }

    let jsonStr = responseText.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```/, "").replace(/```$/, "").trim();
    }

    return res.status(200).json(JSON.parse(jsonStr));
  } catch (error: any) {
    console.error("Gemini Netlist Parser Serverless Error:", error);
    return res.status(500).json({ 
      error: "Failed to parse design file / netlist via AI",
      details: error.message 
    });
  }
}
