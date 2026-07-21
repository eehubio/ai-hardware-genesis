
import React, { useState, useEffect, useRef } from 'react';
import { composeFirmware } from '../lib/firmware-composer';
import { ProjectState, CanvasComponent } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const FirmwareView: React.FC<{ state: ProjectState; setState: React.Dispatch<React.SetStateAction<ProjectState>> }> = ({ state, setState }) => {
  const [lang, setLang] = useState<'arduino' | 'micropython'>('arduino');
  const [currentCode, setCurrentCode] = useState('');
  const [isEdited, setIsEdited] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [zoomedMessage, setZoomedMessage] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(true);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([
    { role: 'assistant', text: "你好！我是 **Seeed 固件助手**。我已经根据你的硬件布局生成了基础代码，有什么需要我定制修改的吗？\n\n例如：\n- *改变传感器采样频率*\n- *添加 OLED 屏幕显示逻辑*\n- *编写超声波避障算法*" }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const mcu = state.components.find(c => c.type === 'mcu');
  const peripherals = state.components.filter(c => c.type !== 'mcu');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiThinking]);

  // A1:按模块标准片段拼装固件(DB 片段 > 内置参考 > 诚实 TODO)
  const composed = React.useMemo(() => composeFirmware(state.components, lang), [state.components, lang]);

  useEffect(() => {
    if (!isEdited) setCurrentCode(composed.code);
  }, [lang, state.components, isEdited, composed]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiThinking) return;

    const userText = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput('');
    setIsAiThinking(true);

    try {
      const res = await fetch('/api/firmware-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, peripherals: peripherals.map(p => ({ name: p.name, id: p.id, protocols: p.electrical?.protocols })), currentCode, instruction: userText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `status ${res.status}`);
      const fullText = data.text || "抱歉，我无法处理该请求。";
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
             <button onClick={() => {setIsEdited(false); setCurrentCode(composed.code);}} className="px-4 py-2 bg-ink-800 text-ink-300 rounded-eng text-body font-semibold hover:bg-ink-700 border border-ink-700 transition-colors">重新生成</button>
             {(() => {
               const ids = state.components.map(c => c.id).sort().join(',');
               const fc = state.firmwareConfirmed;
               const valid = !!fc && fc.componentIds.slice().sort().join(',') === ids && fc.lang === lang;
               return valid ? (
                 <span className="px-3 py-2 text-body font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-700 rounded-eng">✅ 固件已确认 · 可进行硬件剪裁</span>
               ) : (
                 <button
                   onClick={() => setState(p => ({ ...p, firmwareConfirmed: { at: Date.now(), componentIds: p.components.map(c => c.id), lang } }))}
                   title="确认当前固件功能完整可用 —— 这是进入硬件剪裁的前置条件"
                   className="px-4 py-2 bg-emerald-600 text-white rounded-eng text-body font-semibold hover:bg-emerald-700 transition-colors">
                   ✅ 确认固件
                 </button>
               );
             })()}
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
                    {composed.libs.length === 0
                      ? <span className="text-ink-500 text-meta">仅标准库</span>
                      : composed.libs.map(l => <span key={l} className="text-meta font-mono bg-ink-800 text-brand-300 px-1.5 py-0.5 rounded-eng">{l}</span>)}
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

             {/* AI 助手:悬浮按钮 + 弹出面板 */}
             {!aiCollapsed && (
             <div className="fixed bottom-24 right-6 z-[150] w-80 max-w-[calc(100vw-3rem)] h-[28rem] max-h-[70vh] bg-indigo-600 rounded-eng-xl text-white shadow-2xl overflow-hidden flex flex-col border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-200">
                <div className="w-full p-3 bg-indigo-700/50 flex items-center justify-between border-b border-white/10 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-white/20 rounded-eng flex items-center justify-center text-body">🤖</div>
                    <div className="text-left">
                      <h4 className="text-body font-semibold">AI 固件助手</h4>
                      <div className="text-meta text-indigo-300">让 AI 帮你改代码</div>
                    </div>
                  </div>
                  <button onClick={() => setAiCollapsed(true)} className="text-indigo-200 hover:text-white text-lg px-1" title="收起">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-indigo-400/50">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div 
                        onClick={() => msg.role === 'assistant' && setZoomedMessage(msg.text)}
                        className={`max-w-[88%] px-3 py-2.5 rounded-eng-lg text-body leading-relaxed break-words transition-all relative group/msg ${msg.role === 'assistant' ? 'cursor-zoom-in hover:ring-2 hover:ring-white/20' : ''} ${msg.role === 'user' ? 'bg-white/10 border border-white/10 text-white' : 'bg-white text-indigo-900'}`}
                      >
                        <div className="markdown-body pointer-events-none break-words text-body leading-snug [&_p]:m-0 [&_p]:leading-snug [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:space-y-0 [&_ol]:my-1 [&_ol]:pl-4 [&_li]:my-0 [&_li]:leading-snug [&_h1]:text-strong [&_h1]:my-1 [&_h2]:text-strong [&_h2]:my-1 [&_h3]:my-1 [&_pre]:my-1 [&_pre]:text-meta [&_code]:text-meta [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                        {msg.role === 'assistant' && msg.text.includes('```') && (
                          <div className="mt-2 pt-2 border-t border-indigo-100 flex items-center gap-1.5">
                             <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                             <span className="text-meta text-indigo-400">已应用到编辑器</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isAiThinking && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 p-3 rounded-eng-lg flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="w-1 h-1 bg-indigo-300 rounded-full animate-bounce" />
                          <div className="w-1 h-1 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1 h-1 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        <span className="text-meta text-indigo-200">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleChatSubmit} className="p-3 bg-indigo-800/30 border-t border-white/10 shrink-0">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="让 AI 改代码…"
                      className="w-full bg-indigo-950/40 border border-white/10 rounded-eng-lg py-2.5 pl-3 pr-11 text-body text-white placeholder:text-indigo-300/50 outline-none focus:ring-2 focus:ring-white/10 transition-all"
                    />
                    <button type="submit" className="absolute right-1.5 top-1.5 w-8 h-8 bg-white text-indigo-600 rounded-eng flex items-center justify-center hover:bg-indigo-50 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </button>
                  </div>
                </form>
             </div>
             )}

             {/* 悬浮触发钮 */}
             <button
               onClick={() => setAiCollapsed(v => !v)}
               className="fixed bottom-6 right-6 z-[150] w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all hover:scale-105 active:scale-95"
               title="AI 固件助手"
             >
               {aiCollapsed ? '🤖' : '✕'}
             </button>


             <div className="bg-ink-900 p-4 rounded-eng-xl border border-ink-800 shrink-0">
                <div className="text-meta font-semibold text-ink-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> 外设模块 ({peripherals.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {peripherals.map((p, i) => {
                    const info = composed.modules.find(m => m.id === p.id);
                    const src2 = info?.source || 'todo';
                    const border = src2 === 'db' ? 'border-brand-500' : src2 === 'builtin' ? 'border-ink-500' : 'border-amber-500';
                    const title = src2 === 'db' ? '代码来自模块库标准片段' : src2 === 'builtin' ? '代码来自内置参考片段(待入库)' : '缺少验证片段,代码中为 TODO';
                    return (
                      <div key={i} title={title} className={`flex items-center gap-1.5 px-2 py-1 bg-ink-800 rounded-eng border ${border} group hover:bg-ink-700 transition-colors`}>
                        <img src={p.thumb} className="w-4 h-4 object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
                        <span className="text-meta font-medium text-ink-300 group-hover:text-ink-100">{p.name.split(' ').pop()}</span>
                        {src2 === 'todo' && <span className="text-amber-400 text-meta">⚠</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-[9px] text-ink-500">
                  边框:<span className="text-brand-400">绿=库内片段</span> · 灰=内置参考 · <span className="text-amber-400">黄⚠=缺片段(代码中为 TODO,可让右侧 AI 生成)</span>
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
