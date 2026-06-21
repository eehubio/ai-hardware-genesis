
import React, { useState, useEffect, useRef } from 'react';
import { ProjectState, CanvasComponent } from '../types';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const FirmwareView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>> }> = ({ state, setState }) => {
  const [lang, setLang] = useState<'arduino' | 'micropython'>('arduino');
  const [currentCode, setCurrentCode] = useState('');
  const [isEdited, setIsEdited] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [zoomedMessage, setZoomedMessage] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([
    { role: 'assistant', text: "你好！我是 **Seeed 固件助手**。我已经根据你的硬件布局生成了基础代码，有什么需要我定制修改的吗？\n\n例如：\n- *改变传感器采样频率*\n- *添加 OLED 屏幕显示逻辑*\n- *编写超声波避障算法*" }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const mcu = state.components.find(c => c.type === 'mcu');
  const peripherals = state.components.filter(c => c.type !== 'mcu');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiThinking]);

  // 模拟管脚分配
  const getPinForIndex = (idx: number, spec: string) => {
    const s = spec.toLowerCase();
    if (s.includes('i2c')) return { pins: ['D4', 'D5'], names: ['SDA', 'SCL'] };
    if (s.includes('spi')) return { pins: ['D8', 'D9', 'D10'], names: ['SCK', 'MISO', 'MOSI'] };
    if (s.includes('uart')) return { pins: ['D6', 'D7'], names: ['TX', 'RX'] };
    return { pins: [`D${idx % 4}`], names: ['SIG'] };
  };

  const getModuleLogic = (p: CanvasComponent, idx: number, isCpp: boolean) => {
    const pinInfo = getPinForIndex(idx, p.spec);
    const name = p.name.toLowerCase();
    if (isCpp) {
      if (name.includes('bme280')) return `  // ${p.name} Logic\n  float temp = bme.readTemperature();\n  float humi = bme.readHumidity();\n  Serial.print("Temp: "); Serial.println(temp);`;
      if (name.includes('oled')) return `  // ${p.name} Refresh\n  display.clearDisplay();\n  display.setCursor(0,0);\n  display.println("Seeed Genesis v1.0");\n  display.display();`;
      if (name.includes('relay')) return `  digitalWrite(${pinInfo.pins[0]}, HIGH); // Switch Relay ON\n  delay(1000);\n  digitalWrite(${pinInfo.pins[0]}, LOW);`;
      return `  int val_${idx} = analogRead(${pinInfo.pins[0]});\n  Serial.print("${p.name}: "); Serial.println(val_${idx});`;
    }
    return `        # Read ${p.name}\n        val_${idx} = pin_${idx}.value()\n        print("${p.name} value:", val_${idx})`;
  };

  const generateFullCode = (targetLang: 'arduino' | 'micropython') => {
    if (!mcu) return "// 请先添加主控板";
    if (targetLang === 'arduino') {
      const includes = Array.from(new Set(['#include <Arduino.h>', '#include <Wire.h>', ...peripherals.map(p => p.name.includes('BME280') ? '#include <Adafruit_BME280.h>' : p.name.includes('OLED') ? '#include <Adafruit_SSD1306.h>' : '')])).filter(v => v).join('\n');
      const instances = peripherals.map(p => p.name.includes('BME280') ? 'Adafruit_BME280 bme;' : p.name.includes('OLED') ? '#define SCREEN_WIDTH 128\n#define SCREEN_HEIGHT 64\nAdafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);' : '').filter(v => v).join('\n');
      return `${includes}\n\n// --- Hardware Instances ---\n${instances}\n\nvoid setup() {\n  Serial.begin(115200);\n  Wire.begin();\n  \n${peripherals.map((p, i) => p.name.includes('BME280') ? '  bme.begin(0x76);' : p.name.includes('OLED') ? '  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);' : `  pinMode(${getPinForIndex(i, p.spec).pins[0]}, INPUT);`).join('\n')} \n}\n\nvoid loop() {\n${peripherals.map((p, i) => getModuleLogic(p, i, true)).join('\n')}\n  delay(2000);\n}`;
    }
    return `import time\nfrom machine import Pin, I2C\n\n# --- System Setup ---\ni2c = I2C(0, scl=Pin(5), sda=Pin(4))\n\n# --- Peripheral Initialization ---\n${peripherals.map((p, i) => `pin_${i} = Pin(${getPinForIndex(i, p.spec).pins[0].replace('D','')}, Pin.IN)`).join('\n')}\n\ndef main():\n    while True:\n${peripherals.map((p, i) => getModuleLogic(p, i, false)).join('\n')}\n        time.sleep(2)\n\nif __name__ == "__main__":\n    main()`;
  };

  useEffect(() => {
    if (!isEdited) setCurrentCode(generateFullCode(lang));
  }, [lang, state.components, isEdited]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiThinking) return;

    const userText = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput('');
    setIsAiThinking(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        Current Language: ${lang}
        Hardware List: ${JSON.stringify(peripherals.map(p => ({name: p.name, spec: p.spec})))}
        Current Code: 
        \`\`\`
        ${currentCode}
        \`\`\`
        
        User Instruction: ${userText}
        
        Please act as a senior Seeed Studio firmware expert. 
        1. If the user wants a code change, provide the FULL corrected code inside a markdown block.
        2. Explain the changes briefly in Chinese using Markdown (use bold, lists, etc. for readability).
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });

      const fullText = response.text || "抱歉，我无法处理该请求。";
      setMessages(prev => [...prev, { role: 'assistant', text: fullText }]);

      const codeMatch = fullText.match(/```(?:arduino|cpp|python|micropython|)\n([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        setCurrentCode(codeMatch[1].trim());
        setIsEdited(true);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', text: "连接 AI 引擎失败，请检查网络或重试。" }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lang === 'arduino' ? 'main.ino' : 'main.py';
    a.click();
  };

  return (
    <div className="p-8 h-full flex flex-col bg-[#0a0f14] relative overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col space-y-6 min-h-0">
        <div className="flex items-center justify-between shrink-0 gap-4">
          <div>
            <h2 className="text-h2 text-white">固件构建 <span className="text-brand-400 text-meta font-mono border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 rounded-eng align-middle">SDK Genesis</span></h2>
            <p className="text-body text-ink-400 mt-1">根据物理布局自动生成驱动代码,可实时编辑与导出</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
             <div className="flex bg-ink-900 p-1 rounded-eng-lg border border-ink-800">
                <button onClick={() => {setLang('arduino'); setIsEdited(false);}} className={`px-4 py-2 rounded-eng text-body font-semibold transition-colors ${lang === 'arduino' ? 'bg-brand-600 text-white' : 'text-ink-400 hover:text-white'}`}>Arduino (C++)</button>
                <button onClick={() => {setLang('micropython'); setIsEdited(false);}} className={`px-4 py-2 rounded-eng text-body font-semibold transition-colors ${lang === 'micropython' ? 'bg-brand-600 text-white' : 'text-ink-400 hover:text-white'}`}>MicroPython</button>
             </div>
             <button onClick={() => {setIsEdited(false); setCurrentCode(generateFullCode(lang));}} className="px-4 py-2 bg-ink-800 text-ink-300 rounded-eng text-body font-semibold hover:bg-ink-700 border border-ink-700 transition-colors">重新生成</button>
             <button 
                onClick={() => setState(p => ({ ...p, currentStep: 3 }))}
                className="px-4 py-2 bg-brand-600 text-white rounded-eng text-body font-semibold hover:bg-brand-700 transition-colors flex items-center gap-1.5"
              >
                <span>设计外壳</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
              </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
          {/* Editor Area */}
          <div className="lg:col-span-9 bg-[#111827] rounded-eng-xl overflow-hidden shadow-3xl flex flex-col border border-white/5 relative">
             <div className="flex items-center justify-between px-8 py-4 bg-slate-900/80 backdrop-blur-md border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                   <div className="flex gap-1.5">
                     <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                     <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                     <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                   </div>
                   <span className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest ml-4">main.{lang === 'arduino' ? 'ino' : 'py'}</span>
                   {isEdited && <span className="text-[9px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-black uppercase tracking-widest animate-pulse">已由 AI 优化</span>}
                </div>
                <button onClick={handleDownload} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-green-500 transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  导出代码
                </button>
             </div>
             <div className="relative flex-1 bg-slate-950 overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-900/50 border-r border-white/5 flex flex-col items-center py-8 text-[10px] font-mono text-slate-700 pointer-events-none z-10">
                  {Array.from({length: 40}).map((_, i) => <div key={i} className="h-6 leading-6">{i+1}</div>)}
                </div>
                <textarea 
                  value={currentCode}
                  onChange={(e) => {setCurrentCode(e.target.value); setIsEdited(true);}}
                  spellCheck={false}
                  className="w-full h-full bg-transparent text-green-500/90 font-mono text-sm p-8 pl-16 resize-none focus:outline-none scrollbar-thin scrollbar-thumb-slate-800 leading-6 overflow-y-auto"
                />
             </div>
          </div>

          {/* AI Interactive Sidebar */}
          <div className="lg:col-span-3 flex flex-col space-y-3 h-full min-h-0">
             {/* 真实固件信息卡:目标板、依赖库、烧录 */}
             <div className="bg-ink-900 rounded-eng-xl border border-ink-800 p-4 shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-semibold text-ink-400 uppercase tracking-wide">固件信息</span>
                  <span className="text-meta text-brand-400 font-mono">{lang === 'arduino' ? 'Arduino' : 'MicroPython'}</span>
                </div>
                {/* 目标板 */}
                <div className="flex items-start gap-2 text-body">
                  <span className="text-ink-500 shrink-0 w-14">目标板</span>
                  <span className="text-ink-200 font-mono">{mcu ? mcu.name : '未指定主控'}</span>
                </div>
                {/* 依赖库:从生成代码里提取真实 #include */}
                <div className="flex items-start gap-2 text-body">
                  <span className="text-ink-500 shrink-0 w-14">依赖库</span>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const libs = Array.from(new Set((currentCode.match(/#include\s+<([^>]+)>/g) || [])
                        .map(s => s.replace(/#include\s+<|>/g, ''))
                        .filter(l => !['Arduino.h', 'Wire.h', 'SPI.h'].includes(l))));
                      if (libs.length === 0) return <span className="text-ink-500 text-meta">仅标准库</span>;
                      return libs.map(l => <span key={l} className="text-meta font-mono bg-ink-800 text-brand-300 px-1.5 py-0.5 rounded-eng">{l}</span>);
                    })()}
                  </div>
                </div>
                {/* 烧录提示 */}
                <div className="flex items-start gap-2 text-body">
                  <span className="text-ink-500 shrink-0 w-14">烧录</span>
                  <span className="text-ink-300 text-meta leading-relaxed">
                    {mcu?.name?.includes('ESP32') ? 'USB 连接 → 选择对应 XIAO ESP32 板 → 上传(必要时按住 BOOT)'
                     : mcu?.name?.includes('RP2040') ? 'USB 连接 → 双击 RESET 进入 UF2 模式 → 拖入固件'
                     : mcu?.name?.includes('nRF52840') ? 'USB 连接 → 双击 RESET 进入 bootloader → 上传'
                     : 'USB 连接开发板 → 在 IDE 选择对应板与串口 → 上传'}
                  </span>
                </div>
                <div className="text-meta text-ink-500 border-t border-ink-800 pt-2 leading-relaxed">
                  代码由模块数据自动生成,作为起点;烧录前请按接线图核对引脚。
                </div>
             </div>

             <div className={`bg-indigo-600 rounded-eng-xl text-white shadow-lg relative overflow-hidden flex flex-col border border-white/10 ${aiCollapsed ? 'shrink-0' : 'flex-1 min-h-0'}`}>
                <button onClick={() => setAiCollapsed(v => !v)} className="w-full p-3 bg-indigo-700/50 flex items-center justify-between border-b border-white/10 shrink-0 hover:bg-indigo-700/70 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-white/20 rounded-eng flex items-center justify-center text-body">🤖</div>
                    <div className="text-left">
                      <h4 className="text-body font-semibold">AI 固件助手</h4>
                      <div className="text-meta text-indigo-300">点此{aiCollapsed ? '展开' : '收起'}对话</div>
                    </div>
                  </div>
                  {isAiThinking ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="text-indigo-300">{aiCollapsed ? '▼' : '▲'}</span>}
                </button>

                {!aiCollapsed && (<>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-indigo-400/50">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div 
                        onClick={() => msg.role === 'assistant' && setZoomedMessage(msg.text)}
                        className={`max-w-[90%] p-4 rounded-[28px] text-[11px] leading-relaxed shadow-lg transition-all relative group/msg ${msg.role === 'assistant' ? 'cursor-zoom-in hover:ring-2 hover:ring-white/20' : ''} ${msg.role === 'user' ? 'bg-white/10 border border-white/10 rounded-tr-none text-white' : 'bg-white text-indigo-900 rounded-tl-none'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                             <div className="p-1.5 bg-slate-100 rounded-lg text-indigo-600 shadow-sm">
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                             </div>
                          </div>
                        )}
                        <div className="markdown-body pointer-events-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                        {msg.role === 'assistant' && msg.text.includes('```') && (
                          <div className="mt-4 pt-3 border-t border-indigo-100 flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                             <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">已应用到编辑器</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isAiThinking && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 p-4 rounded-3xl rounded-tl-none flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-1 h-1 bg-indigo-300 rounded-full animate-bounce" />
                          <div className="w-1 h-1 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1 h-1 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleChatSubmit} className="p-4 bg-indigo-800/30 border-t border-white/10 shrink-0 backdrop-blur-md">
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="告诉助手你的定制要求..."
                      className="w-full bg-indigo-950/40 border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-xs font-bold text-white placeholder:text-indigo-300/50 outline-none focus:ring-4 focus:ring-white/5 transition-all"
                    />
                    <button type="submit" className="absolute right-1.5 top-1.5 w-10 h-10 bg-white text-indigo-600 rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </button>
                  </div>
                </form>
                </>)}
             </div>

             <div className="bg-ink-900 p-4 rounded-eng-xl border border-ink-800 shrink-0">
                <div className="text-meta font-semibold text-ink-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> 外设模块 ({peripherals.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {peripherals.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-ink-800 rounded-eng border border-ink-700 group hover:bg-ink-700 transition-colors">
                      <img src={p.thumb} className="w-4 h-4 object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
                      <span className="text-meta font-medium text-ink-300 group-hover:text-ink-100">{p.name.split(' ').pop()}</span>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Zoom Modal - Optimized for Scroll and Close */}
      {zoomedMessage && (
        <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-3xl flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300">
          {/* Background overlay click to close */}
          <div className="absolute inset-0" onClick={() => setZoomedMessage(null)} />
          
          <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-white rounded-[32px] md:rounded-[60px] shadow-[0_40px_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in zoom-in duration-300 ring-1 ring-white/10">
            {/* Modal Header - Fixed */}
            <div className="px-8 md:px-12 py-6 md:py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur shrink-0">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">🤖</div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">AI 固件助手报告</h3>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Full Semantic Analysis View</p>
                  </div>
               </div>
               <button 
                onClick={() => setZoomedMessage(null)}
                className="w-10 h-10 md:w-12 md:h-12 bg-slate-900 text-white rounded-full flex items-center justify-center hover:bg-black transition-all hover:scale-110 active:scale-90 shadow-xl z-20"
                aria-label="关闭详情"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            </div>
            
            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin scrollbar-thumb-slate-200 bg-white">
               <div className="markdown-body text-slate-800 text-sm md:text-base leading-loose max-w-4xl mx-auto pb-10">
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {zoomedMessage}
                 </ReactMarkdown>
               </div>
            </div>

            {/* Modal Footer - Fixed */}
            <div className="px-8 md:px-12 py-6 md:py-8 bg-slate-900 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
               <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest italic">Genesis Engine / Optimized</span>
               </div>
               <button 
                onClick={() => setZoomedMessage(null)}
                className="w-full md:w-auto px-10 py-4 bg-green-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-2xl active:scale-95"
               >
                 返回代码编辑器
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirmwareView;
