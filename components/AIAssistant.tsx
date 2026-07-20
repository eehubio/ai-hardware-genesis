
import React, { useState, useRef, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import { AIAgentMessage } from '../types';

const FILE_TEMPLATES = [
  {
    name: "智能农业监测系统设计书.pdf",
    size: "1.2 MB",
    type: "application/pdf",
    content: "系统要求：选用能提供高精度温控的气候感知网元。控制器选用 XIAO ESP32-S3，通过 I2C 接口接入 BME280 三合一传感器(温度、湿度、气压)以及 Soil Moisture 土壤湿度传感器。系统配备 OLED 显示组件以在本地显示数据，并在湿度低时由 GPIO 输出拉高，驱动 Relay 继电器开关工作。"
  },
  {
    name: "运动姿态识别辅助手环规范.docx",
    size: "820 KB",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: "系统要求：一款穿戴式计步与翻页挥动手部感应方案。主控板采用集成了 LIS3DHTR 三轴加速度计的超低功耗 XIAO nRF52840 Sense 芯片。当产生特定加速度变化时，板载超小体积 Buzzer 发出按键声音，并能通过蓝牙传递控制信号。电源选用3.7V微型锂电池提供持续电源。"
  },
  {
    name: "环境健康高精监测站规格.png",
    size: "3.7 MB",
    type: "image/png",
    content: "系统要求：室内 VOC 与气溶胶危害快速检测站。核心板搭载精小的 XIAO RP2040 元件，配备高灵敏 SGP40 气体传感器及高响应的 RGB 背光 LCD 屏组件（lcd_rgb_backlight）。数据触发异常阈值时产生声光警报。"
  }
];

const URL_TEMPLATES = [
  {
    url: "https://wiki.seeedstudio.com/XIAO-ESP32S3-Sense-Voice-Detection",
    text: "Seeed 开源 Wiki 描述：XIAO-ESP32S3-Sense 配备高性能图像与音频外设，结合人脸识别与语音指令系统。本方案要求结合 Vision AI v2 摄像头传感器，在板载逻辑触发时触发超紧凑 Buzzer 进行音频声调通知。"
  },
  {
    url: "https://www.eetree.cn/project/gesture-joystick-controller",
    text: "EETree 智造社区创意案：采用 nRF52840 搭载陀螺仪实现全姿态空鼠控制器。配合 Rotary Encoder 旋钮编码器实现二级菜单选项调节，并能在 OLED 屏幕清晰显示手势频率。"
  },
  {
    url: "https://github.com/seeed/lora-e5-water-pump-node",
    text: "Github 仓储项目参考：LoRaWAN 远程泵站智能控制终端。通过连接 Soil Moisture 土壤传感器检测土壤水分，并通过 LoRa-E5 原生无线模块，每隔 15 分钟上报数据并等待远程物联网指令拉低 Relay 继电器关闭大功率水阀。"
  }
];

interface AIAssistantProps {
  history: AIAgentMessage[];
  onSend: (text: string) => void;
  onApplySolution: (ids: string[]) => void;
  isProcessing: boolean;
  inline?: boolean;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ history, onSend, onApplySolution, isProcessing, inline = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // States for doc/pdf/image uploads and URL inputs
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    size: string;
    type: string;
    simulatedContent: string;
    base64?: string;
  } | null>(null);

  const [attachedUrl, setAttachedUrl] = useState<{
    url: string;
    extractedText: string;
  } | null>(null);

  const [showFileUploader, setShowFileUploader] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUrlParsing, setIsUrlParsing] = useState(false);
  const [inputUrl, setInputUrl] = useState('');

  const handleCustomFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setTimeout(() => {
      let content = "该上传文件中包含如下物联网需求描述：选用高低功耗双模蓝牙开发板，配备空气微粒计以及大功率电磁泵驱动，保障户外气象信息连续采集。";
      const name = file.name.toLowerCase();
      if (name.includes('air') || name.includes('空气') || name.includes('sgp40')) {
        content = "该空气质量需求案提出：配置 XIAO ESP32-S3 与 SGP40 VOC 物资检测传感器以及 SHT40 开发套件。配合 OLED 对检测污染指数进行实时读秒。";
      } else if (name.includes('water') || name.includes('水') || name.includes('irrigation') || name.includes('soil')) {
        content = "智能水分自动化控制设备指标：使用 XIAO RP2040 以及 Soil Moisture 水分测量模块。结合 Relay 驱动水泵定时开启灌溉。";
      } else if (name.includes('gesture') || name.includes('wrist') || name.includes('加速度') || name.includes('motion')) {
        content = "低功耗姿态轨迹仪：需要用到集成了 LIS3DHTR 加速度计的超小型高能效 XIAO nRF52840 Sense 核心，配合一个大音量 Buzzer 做响应警报和 OLED 显示手势角度。";
      }

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedFile({
            name: file.name,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: file.type,
            simulatedContent: content,
            base64: reader.result as string
          });
          setIsUploading(false);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachedFile({
          name: file.name,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          type: file.type,
          simulatedContent: content
        });
        setIsUploading(false);
      }
    }, 850);
  };

  const handleCustomUrlParse = (urlToParse: string) => {
    if (!urlToParse.trim()) return;
    setIsUrlParsing(true);
    setTimeout(() => {
      let content = `已抓取目标网页并深度精炼：这是来自 ${urlToParse} 的参考设计，要求使用超低功耗蓝牙主控板 XIAO nRF52840 Sense（包含 LIS3DHTR）作为芯片运动感应，配合外接 Buzzer 设备，采用锂电池供电。`;
      if (urlToParse.toLowerCase().includes('esp32')) {
        content = `已抓取目标网页并深度精炼：这是来自 ${urlToParse} 的参考设计，利用多核主控 XIAO ESP32-S3 配合高阶 Vision AI v2 摄像头作图像捕获，再用 Buzzer 做状态播报反馈。`;
      } else if (urlToParse.toLowerCase().includes('water') || urlToParse.toLowerCase().includes('moisture')) {
        content = `已抓取目标网页并深度精炼：这是来自 ${urlToParse} 的参考设计，配合 Soil Moisture 土壤环境采集指标以及 Relay 控制阀设备接口，构建大田遥测节水微控制器系统。`;
      }
      setAttachedUrl({
        url: urlToParse,
        extractedText: content
      });
      setIsUrlParsing(false);
      setInputUrl('');
    }, 850);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    if (!input.trim() && !attachedFile && !attachedUrl) return;

    let finalPrompt = input;
    if (attachedFile) {
      finalPrompt = `[用户通过文档或图片导入了设计要求]
已上传文件：${attachedFile.name} (${attachedFile.size})
文档解析出核心指标：${attachedFile.simulatedContent}

用户的留言说明：${input.trim() || '请根据此上传规格书的最佳指示，推荐对应的 XIAO 微控制器以及 Grove 元器件模块。'}`;
    } else if (attachedUrl) {
      finalPrompt = `[用户通过网页抽取了设计要求]
来源网址：${attachedUrl.url}
抓取解析页面概要：${attachedUrl.extractedText}

用户的留言说明：${input.trim() || '请根据此网页内容的指示，推荐对应的 XIAO 控制板与传感器/执行器子模块组合。'}`;
    }

    onSend(finalPrompt);
    setInput('');
    setAttachedFile(null);
    setAttachedUrl(null);
    setShowFileUploader(false);
    setShowUrlInput(false);
  };

  if (inline) {
    return (
      <div className="flex flex-col h-full bg-white relative">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-600 to-green-400 flex items-center justify-center text-white shadow-md shadow-green-100/50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-xs leading-tight">EETree 智造 AI 设计助手</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Seeed Genesis AI Engine</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 bg-slate-50 border-b border-slate-200/50">
          {/* Attached items indicators */}
          {attachedFile && (
            <div className="mb-2.5 p-2 bg-green-50/90 border border-green-200/60 rounded-xl relative flex items-center justify-between text-slate-700">
              <div className="flex items-center gap-2 min-w-0">
                {attachedFile.base64 ? (
                  <img src={attachedFile.base64} alt="Thumb" className="w-8 h-8 rounded-lg object-cover border border-green-200 flex-shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-sm">📄</span>
                )}
                <div className="min-w-0">
                  <span className="block text-[9px] font-black text-green-900 truncate">{attachedFile.name} ({attachedFile.size})</span>
                  <span className="block text-[8px] text-slate-500 truncate italic">智能提取: {attachedFile.simulatedContent.substring(0, 30)}...</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {attachedUrl && (
            <div className="mb-2.5 p-2 bg-blue-50/90 border border-blue-200/60 rounded-xl relative flex items-center justify-between text-slate-700">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm">🌐</span>
                <div className="min-w-0">
                  <span className="block text-[9px] font-black text-blue-900 truncate">{attachedUrl.url}</span>
                  <span className="block text-[8px] text-slate-500 truncate italic">页面提取: {attachedUrl.extractedText.substring(0, 30)}...</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedUrl(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Option Buttons */}
          <div className="flex gap-2 mb-2.5">
            <button
              type="button"
              onClick={() => {
                setShowFileUploader(!showFileUploader);
                setShowUrlInput(false);
              }}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border text-[9px] font-bold transition-all cursor-pointer ${
                showFileUploader || attachedFile
                  ? 'bg-green-50 text-green-700 border-green-200 shadow-sm font-black'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>📁 文档/图片上传</span>
              {attachedFile && <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUrlInput(!showUrlInput);
                setShowFileUploader(false);
              }}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border text-[9px] font-bold transition-all cursor-pointer ${
                showUrlInput || attachedUrl
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm font-black'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>🌐 网页链接输入</span>
              {attachedUrl && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
            </button>
          </div>

          {/* Collapsible File Uploader Panel */}
          {showFileUploader && (
            <div className="mb-3 p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <span className="block text-[9px] font-black text-slate-700">上传或选择硬件需求文档：</span>
              
              <label className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-green-400 transition-all">
                <input type="file" accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.txt" onChange={handleCustomFile} className="hidden" />
                <span className="text-sm">📁</span>
                <span className="text-[9px] text-slate-500 font-bold mt-1 text-center">选择本地 PDF/DOC/图片需求文件</span>
                {isUploading && <span className="block text-[8px] text-green-600 mt-1 animate-pulse font-black">正在解析需求要素...</span>}
              </label>

              <div className="space-y-1">
                <span className="block text-[8.5px] font-black text-slate-400">精品示例文件试用：</span>
                <div className="grid grid-cols-1 gap-1">
                  {FILE_TEMPLATES.map((item, id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setIsUploading(true);
                        setTimeout(() => {
                          setAttachedFile({
                            name: item.name,
                            size: item.size,
                            type: item.type,
                            simulatedContent: item.content
                          });
                          setIsUploading(false);
                          setShowFileUploader(false);
                        }, 500);
                      }}
                      className="text-left bg-slate-50 hover:bg-green-50 p-1.5 rounded-lg border border-slate-100 text-[8px] truncate transition-all cursor-pointer font-medium text-slate-700 hover:text-green-800"
                    >
                      📄 <strong className="font-bold text-slate-800">{item.name}</strong> ({item.size})
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Collapsible URL Input Panel */}
          {showUrlInput && (
            <div className="mb-3 p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <span className="block text-[9px] font-black text-slate-700">输入需要解析提取需求的 URL 网页：</span>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  placeholder="例如: https://wiki.seeedstudio.com/..."
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => handleCustomUrlParse(inputUrl)}
                  disabled={isUrlParsing || !inputUrl.trim()}
                  className="px-2 bg-blue-600 text-white rounded-lg text-[9px] font-bold hover:bg-blue-700 hover:cursor-pointer disabled:opacity-50"
                >
                  {isUrlParsing ? '提取中...' : '解析'}
                </button>
              </div>

              <div className="space-y-1">
                <span className="block text-[8.5px] font-black text-slate-400">推荐 Wiki 页面链接：</span>
                <div className="grid grid-cols-1 gap-1">
                  {URL_TEMPLATES.map((tmpl, id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setIsUrlParsing(true);
                        setTimeout(() => {
                          setAttachedUrl({
                            url: tmpl.url,
                            extractedText: tmpl.text
                          });
                          setIsUrlParsing(false);
                          setShowUrlInput(false);
                        }, 500);
                      }}
                      className="text-left bg-slate-50 hover:bg-blue-50 p-1.5 rounded-lg border border-slate-100 text-[8px] truncate transition-all cursor-pointer font-medium text-slate-700 hover:text-blue-800"
                    >
                      🔗 <strong className="font-bold text-slate-800">{tmpl.url.split('/').pop()}</strong> - {tmpl.text.substring(0, 25)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as any)?.requestSubmit(); } }}
              rows={Math.min(6, Math.max(1, input.split('\n').length + (input.length > 40 ? 1 : 0)))}
              placeholder={(attachedFile || attachedUrl) ? "输入补充词或直接点击发送设计！" : "例如：设计一个空气质量检测仪(Shift+Enter 换行)"}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-3 pr-9 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-green-500/15 focus:border-green-500 transition-all shadow-sm outline-none resize-none"
            />
            <button 
              type="submit"
              disabled={isProcessing}
              className="absolute right-1 top-1 w-8 h-8 bg-green-600 hover:bg-green-750 text-white rounded-lg flex items-center justify-center active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-center gap-3 mt-2">
             <span className="text-[8px] text-slate-400 font-bold flex items-center gap-0.5">
               <span className="w-1 h-1 rounded-full bg-green-500" /> 实时设计分析
             </span>
             <span className="text-[8px] text-slate-400 font-bold flex items-center gap-0.5">
               <span className="w-1 h-1 rounded-full bg-blue-500" /> Circuit Engine
             </span>
          </div>
        </form>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-220px)] bg-slate-50/30">
          {history.map((msg) => {
            const solutionCards = (msg.cards || []).filter(c => c.solutionComponents && c.solutionComponents.length > 0);
            const allSuggestedIds = solutionCards.length === 1 ? [...new Set(solutionCards[0].solutionComponents!)] : [];
            // F-02:只有"最新一条带方案的助手消息"上的按钮有效;更早的方案已过期
            const latestSolutionMsgId = [...history].reverse().find(m => m.role === 'assistant' && (m.cards || []).some(c => c.solutionComponents?.length))?.id;
            const isStale = msg.id !== latestSolutionMsgId;

            return (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-2xl rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-2xl rounded-tl-none shadow-sm'} p-3.5 relative`}>
                  {msg.role === 'user' ? (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div className="markdown-body text-xs leading-normal text-slate-800">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  )}

                  {msg.role === 'assistant' && msg.options && msg.options.length > 0 && (() => {
                    const selectedForThisMsg = selectedOptions[msg.id] || [];
                    return (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-2 animate-fade-in">
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold">
                          <span>💡 提示：多选特性</span>
                          {selectedForThisMsg.length > 0 && (
                            <span className="text-green-600">已选 {selectedForThisMsg.length} 项</span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-1">
                          {msg.options.map((option, idx) => {
                            const isSelected = selectedForThisMsg.includes(option);
                            return (
                              <button
                                key={idx}
                                disabled={isProcessing}
                                onClick={() => {
                                  if (!isProcessing) {
                                    setSelectedOptions(prev => {
                                      const current = prev[msg.id] || [];
                                      const updated = current.includes(option)
                                        ? current.filter(o => o !== option)
                                        : [...current, option];
                                      return { ...prev, [msg.id]: updated };
                                    });
                                  }
                                }}
                                className={`px-2 py-1 text-[10px] font-semibold rounded-full border transition-all duration-200 cursor-pointer flex items-center gap-1 ${
                                  isSelected
                                    ? 'bg-green-600 text-white border-green-600 shadow-sm shadow-green-100 hover:bg-green-700'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {isSelected && (
                                  <svg className="w-2.5 h-2.5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"></path>
                                  </svg>
                                )}
                                {option}
                              </button>
                            );
                          })}
                        </div>

                        {selectedForThisMsg.length > 0 && (
                          <button
                            disabled={isProcessing}
                            onClick={() => {
                              if (!isProcessing) {
                                onSend(selectedForThisMsg.join(' + '));
                                setSelectedOptions(prev => {
                                  const next = { ...prev };
                                  delete next[msg.id];
                                  return next;
                                });
                              }
                            }}
                            className="w-full mt-1 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-[10px] shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span>发送选择 ({selectedForThisMsg.length})</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  
                  {msg.role === 'assistant' && allSuggestedIds.length > 0 && (
                    <button
                      onClick={() => !isStale && onApplySolution(allSuggestedIds)}
                      disabled={isStale}
                      className={`w-full mt-3 mb-1 py-2 rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-2 border ${isStale ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-900 text-white border-slate-700 hover:bg-black shadow-md'}`}
                    >
                      <span>{isStale ? '⛔ 方案已过期(对话已更新)' : '🚀 应用推荐系统方案'}</span>
                    </button>
                  )}
                  {msg.role === 'assistant' && solutionCards.length > 1 && !isStale && (
                    <div className="mt-2 text-[9px] text-slate-400 text-center">检测到 {solutionCards.length} 个备选方案,请在上方选择其一应用(不会合并)</div>
                  )}

                  {msg.cards && (
                    <div className="mt-3 space-y-2">
                      {msg.cards.map((card, i) => (
                        <div key={i} className={`p-3 rounded-lg border transition-all ${card.type === 'warn' ? 'bg-amber-50 border-amber-100' : card.type === 'success' ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="w-4 h-4 flex items-center justify-center rounded bg-white shadow-sm text-[10px]">
                              {card.type === 'warn' ? '⚠️' : card.type === 'success' ? '✅' : 'ℹ️'}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-tight text-slate-600 truncate">{card.title}</span>
                          </div>
                          <div className="markdown-body text-[10px] text-slate-500 mb-2 leading-relaxed">
                            <Markdown>{card.description}</Markdown>
                          </div>
                          
                          {card.solutionComponents && card.solutionComponents.length > 0 && (
                            <button 
                              onClick={() => !isStale && onApplySolution(card.solutionComponents!)} disabled={isStale}
                              className="w-full mt-1.5 py-1.5 bg-green-600 text-white rounded-md text-[9px] font-bold hover:bg-green-700 transition-all shadow-sm flex items-center justify-center gap-1"
                            >
                              <span>⚡ 应用此子方案</span>
                            </button>
                          )}

                          {card.action && !card.solutionComponents && (
                            <button className="flex items-center gap-1 text-[9px] font-bold text-green-600 hover:text-green-700 transition-colors">
                              <span>应用: {card.action}</span>
                              <svg className="w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-100 p-2.5 rounded-2xl rounded-tl-none flex items-center gap-2 shadow-sm">
                <div className="flex gap-1 animate-pulse">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span className="text-[9px] text-slate-400 font-bold italic tracking-tight">AI 正在生成设计方案...</span>
              </div>
            </div>
          )}
        </div>

        
      </div>
    );
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-8 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.12)] rounded-full px-6 py-4 border border-green-50 flex items-center gap-4 hover:scale-105 active:scale-95 transition-all z-50 group"
      >
        <span className="relative flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]"></span>
        </span>
        <span className="text-sm font-bold text-slate-700 tracking-tight">智造 AI 设计助手</span>
        <span className={`text-slate-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7"></path></svg>
        </span>
      </button>

      <div className={`fixed bottom-24 right-8 w-[440px] h-[82vh] max-h-[850px] bg-white border border-slate-200 rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] z-40 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) transform ${isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95 pointer-events-none'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-[32px]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-600 to-green-400 flex items-center justify-center text-white shadow-lg shadow-green-100">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base leading-tight"> EETree Orchestrator</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Powered by Seeed Genesis Engine</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shadow-sm">✕</button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 bg-slate-50 border-b border-slate-200/50">
            {/* Attached items indicators */}
            {attachedFile && (
              <div className="mb-3.5 p-3 bg-green-50/95 border border-green-200/60 rounded-xl relative flex items-center justify-between text-slate-700">
                <div className="flex items-center gap-2.5 min-w-0">
                  {attachedFile.base64 ? (
                    <img src={attachedFile.base64} alt="Thumb" className="w-10 h-10 rounded-lg object-cover border border-green-200 flex-shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-base">📄</span>
                  )}
                  <div className="min-w-0">
                    <span className="block text-xs font-black text-green-900 truncate">{attachedFile.name} ({attachedFile.size})</span>
                    <span className="block text-[10px] text-slate-500 truncate italic">智能提取: {attachedFile.simulatedContent.substring(0, 35)}...</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {attachedUrl && (
              <div className="mb-3.5 p-3 bg-blue-50/90 border border-blue-200/60 rounded-xl relative flex items-center justify-between text-slate-700">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base">🌐</span>
                  <div className="min-w-0">
                    <span className="block text-xs font-black text-blue-900 truncate">{attachedUrl.url}</span>
                    <span className="block text-[10px] text-slate-500 truncate italic">页面提取: {attachedUrl.extractedText.substring(0, 35)}...</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedUrl(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Quick Option Buttons */}
            <div className="flex gap-3 mb-3.5">
              <button
                type="button"
                onClick={() => {
                  setShowFileUploader(!showFileUploader);
                  setShowUrlInput(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  showFileUploader || attachedFile
                    ? 'bg-green-50 text-green-700 border-green-200 shadow-sm font-black'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>📁 需求文档/图片上传</span>
                {attachedFile && <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUrlInput(!showUrlInput);
                  setShowFileUploader(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  showUrlInput || attachedUrl
                    ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm font-black'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>🌐 输入需求链接</span>
                {attachedUrl && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
              </button>
            </div>

            {/* Collapsible File Uploader Panel */}
            {showFileUploader && (
              <div className="mb-4 p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm">
                <span className="block text-xs font-black text-slate-700">上传或选择本地硬件需求文件：</span>
                
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-green-400 transition-all">
                  <input type="file" accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.txt" onChange={handleCustomFile} className="hidden" />
                  <span className="text-2xl">📁</span>
                  <span className="text-xs text-slate-500 font-bold mt-1 text-center">选择本地 PDF/DOC/图片/TXT 需求规格文件</span>
                  {isUploading && <span className="block text-[10.5px] text-green-600 mt-1 animate-pulse font-black">正在解析需求要素...</span>}
                </label>

                <div className="space-y-1.5">
                  <span className="block text-[10px] font-black text-slate-400">精品项目文件速试：</span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {FILE_TEMPLATES.map((item, id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setIsUploading(true);
                          setTimeout(() => {
                            setAttachedFile({
                              name: item.name,
                              size: item.size,
                              type: item.type,
                              simulatedContent: item.content
                            });
                            setIsUploading(false);
                            setShowFileUploader(false);
                          }, 500);
                        }}
                        className="text-left bg-slate-55 hover:bg-green-50 p-2 rounded-xl border border-slate-200 text-xs truncate transition-all cursor-pointer font-medium text-slate-750 hover:text-green-800"
                      >
                        📄 <strong className="font-bold text-slate-800">{item.name}</strong> ({item.size})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Collapsible URL Input Panel */}
            {showUrlInput && (
              <div className="mb-4 p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm">
                <span className="block text-xs font-black text-slate-700">输入需要智能解析提取需求的 URL 页面：</span>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="请输入 URL，例如: https://wiki.seeedstudio.com/..."
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleCustomUrlParse(inputUrl)}
                    disabled={isUrlParsing || !inputUrl.trim()}
                    className="px-3 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 hover:cursor-pointer disabled:opacity-50"
                  >
                    {isUrlParsing ? '提取中...' : '提取页面'}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-[10px] font-black text-slate-400">热门 Wiki 项目设计：</span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {URL_TEMPLATES.map((tmpl, id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setIsUrlParsing(true);
                          setTimeout(() => {
                            setAttachedUrl({
                              url: tmpl.url,
                              extractedText: tmpl.text
                            });
                            setIsUrlParsing(false);
                            setShowUrlInput(false);
                          }, 500);
                        }}
                        className="text-left bg-slate-55 hover:bg-blue-50 p-2 rounded-xl border border-slate-150 text-xs truncate transition-all cursor-pointer font-medium text-slate-750 hover:text-blue-800"
                      >
                        🔗 <strong className="font-bold text-slate-800">{tmpl.url.split('/').pop()}</strong> - {tmpl.text.substring(0, 30)}...
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="relative group">
              <textarea 
                 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={(attachedFile || attachedUrl) ? "输入补充词或直接点击发送设计！" : "尝试输入：设计一个空气质量检测仪"}
                className="w-full bg-white border border-slate-200 rounded-[18px] py-3 pl-5 pr-12 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-green-500/10 focus:border-green-500 transition-all shadow-sm outline-none resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as any)?.requestSubmit(); } }}
                rows={Math.min(6, Math.max(1, input.split('\n').length + (input.length > 60 ? 1 : 0)))} />
              <button 
                type="submit"
                disabled={isProcessing}
                className="absolute right-1.5 top-1.5 w-9 h-9 bg-green-600 text-white rounded-xl flex items-center justify-center hover:bg-green-700 active:scale-90 transition-all disabled:opacity-50 shadow-lg shadow-green-100 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </button>
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
               <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 实时需求提取
               </span>
               <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Web Crawler Active
               </span>
            </div>
          </form>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
            {history.map((msg) => {
              // Aggregate all solution components from this message's cards
            const solutionCards = (msg.cards || []).filter(c => c.solutionComponents && c.solutionComponents.length > 0);
              const allSuggestedIds = solutionCards.length === 1 ? [...new Set(solutionCards[0].solutionComponents!)] : [];
              // F-02:只有"最新一条带方案的助手消息"上的按钮有效;更早的方案已过期
              const latestSolutionMsgId = [...history].reverse().find(m => m.role === 'assistant' && (m.cards || []).some(c => c.solutionComponents?.length))?.id;
              const isStale = msg.id !== latestSolutionMsgId;

              return (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-2xl rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-2xl rounded-tl-none shadow-sm'} p-4 relative`}>
                    {msg.role === 'user' ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div className="markdown-body text-sm leading-relaxed text-slate-800">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    )}

                    {msg.role === 'assistant' && msg.options && msg.options.length > 0 && (() => {
                      const selectedForThisMsg = selectedOptions[msg.id] || [];
                      return (
                        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-3 animate-fade-in">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold">
                            <span>💡 温馨提示：可多选您需要的硬件特性</span>
                            {selectedForThisMsg.length > 0 && (
                              <span className="text-green-600">已选 {selectedForThisMsg.length} 项</span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {msg.options.map((option, idx) => {
                              const isSelected = selectedForThisMsg.includes(option);
                              return (
                                <button
                                  key={idx}
                                  disabled={isProcessing}
                                  onClick={() => {
                                    if (!isProcessing) {
                                      setSelectedOptions(prev => {
                                        const current = prev[msg.id] || [];
                                        const updated = current.includes(option)
                                          ? current.filter(o => o !== option)
                                          : [...current, option];
                                        return { ...prev, [msg.id]: updated };
                                      });
                                    }
                                  }}
                                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                    isSelected
                                      ? 'bg-green-600 text-white border-green-600 shadow-sm shadow-green-100 hover:bg-green-700'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"></path>
                                    </svg>
                                  )}
                                  {option}
                                </button>
                              );
                            })}
                          </div>

                          {selectedForThisMsg.length > 0 && (
                            <button
                              disabled={isProcessing}
                              onClick={() => {
                                if (!isProcessing) {
                                  onSend(selectedForThisMsg.join(' + '));
                                  // Clear selection for this msg after sending to prevent accidental double-submits
                                  setSelectedOptions(prev => {
                                    const next = { ...prev };
                                    delete next[msg.id];
                                    return next;
                                  });
                                }
                              }}
                              className="w-full mt-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs shadow-md shadow-green-100 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <span>确定并发送选择 ({selectedForThisMsg.length})</span>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    
                    {msg.role === 'assistant' && allSuggestedIds.length > 0 && (
                      <button
                        onClick={() => !isStale && onApplySolution(allSuggestedIds)}
                        disabled={isStale}
                        className={`w-full mt-4 mb-2 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-3 border ${isStale ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-900 text-white border-slate-700 hover:bg-black shadow-xl'}`}
                      >
                        <span className="text-lg">{isStale ? '⛔' : '🚀'}</span>
                        <span>{isStale ? '方案已过期(对话已更新)' : `应用完整系统方案 (${allSuggestedIds.length} 个组件)`}</span>
                      </button>
                    )}
                    {msg.role === 'assistant' && solutionCards.length > 1 && !isStale && (
                      <div className="mt-2 text-[10px] text-slate-400 text-center">检测到 {solutionCards.length} 个备选方案,请选择其一应用(不会合并)</div>
                    )}

                    {msg.cards && (
                      <div className="mt-4 space-y-3">
                        {msg.cards.map((card, i) => (
                          <div key={i} className={`p-4 rounded-xl border transition-all hover:scale-[1.02] ${card.type === 'warn' ? 'bg-amber-50 border-amber-100' : card.type === 'success' ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-5 h-5 flex items-center justify-center rounded-lg bg-white shadow-sm text-xs">
                                {card.type === 'warn' ? '⚠️' : card.type === 'success' ? '✅' : 'ℹ️'}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-tight text-slate-600">{card.title}</span>
                            </div>
                            <div className="markdown-body text-[11px] text-slate-500 mb-3 leading-normal">
                              <Markdown>{card.description}</Markdown>
                            </div>
                            
                            {card.solutionComponents && card.solutionComponents.length > 0 && (
                              <button 
                                onClick={() => !isStale && onApplySolution(card.solutionComponents!)} disabled={isStale}
                                className="w-full mt-2 py-2 bg-green-600 text-white rounded-lg text-[10px] font-bold hover:bg-green-700 transition-all shadow-md shadow-green-100 flex items-center justify-center gap-2"
                              >
                                <span>⚡ 应用此子方案</span>
                              </button>
                            )}

                            {card.action && !card.solutionComponents && (
                              <button className="flex items-center gap-1.5 text-[10px] font-bold text-green-600 hover:text-green-700 transition-colors">
                                <span>立即应用方案: {card.action}</span>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none flex items-center gap-3 shadow-sm">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold italic tracking-tight">AI 正在生成设计方案...</span>
                </div>
              </div>
            )}
          </div>

          
        </div>
      </div>
    </>
  );
};

export default AIAssistant;
