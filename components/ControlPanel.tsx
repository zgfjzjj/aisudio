
import React, { useRef, useState, useEffect } from 'react';
import { Shot, AspectRatioEnum } from '../types';
import { ASPECT_RATIOS, PROMPT_KEYWORDS, AI_MODELS } from '../constants';
import { Sparkles, Wand2, ImagePlus, X, Languages, Plus, Copy, Check, Loader2, Zap, Star, Eye, UploadCloud, Minus } from 'lucide-react';

interface ControlPanelProps {
  shot: Shot;
  onUpdateShot: (updates: Partial<Shot>) => void;
  onPolish: () => void;
  onGeneratePrompt: () => void;
  onTranslate: () => Promise<void>;
  isProcessing: boolean;
}

// Utility to safely escape strings for RegExp
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  shot,
  onUpdateShot,
  onPolish,
  onGeneratePrompt,
  onTranslate,
  isProcessing
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'en' | 'cn'>('en');
  const [copied, setCopied] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  
  const lastTranslatedSource = useRef<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ loading: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (uploadStatus && !uploadStatus.loading) {
        const timer = setTimeout(() => setUploadStatus(null), 3000);
        return () => clearTimeout(timer);
    }
  }, [uploadStatus]);

  // MEMORY FIX: Compress and return Blob URL instead of huge Base64 string
  const processImageToBlobUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 2048; 
          const MAX_HEIGHT = 2048;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
          }
          
          // Convert to Blob, then Create Object URL
          canvas.toBlob((blob) => {
             if (blob) {
                const url = URL.createObjectURL(blob);
                resolve(url);
             } else {
                reject(new Error("Canvas to Blob failed"));
             }
          }, 'image/jpeg', 0.90);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setUploadStatus({ loading: true, msg: `正在处理 ${files.length} 张图片...` });
      
      const processedImages: string[] = [];
      const MAX_FILE_SIZE = 10 * 1024 * 1024; 

      let hasLargeFiles = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.size > MAX_FILE_SIZE) {
           alert(`图片 "${file.name}" 体积过大 (超过10MB)。`);
           continue; 
        }

        if (file.size > 1 * 1024 * 1024) { 
            hasLargeFiles = true;
            setUploadStatus({ loading: true, msg: `正在优化: ${file.name}...` });
        }

        try {
            // Returns a "blob:..." URL now
            const blobUrl = await processImageToBlobUrl(file);
            processedImages.push(blobUrl);
        } catch (err) {
            console.error("Failed to process image", err);
            setUploadStatus({ loading: false, msg: `处理失败: ${file.name}` });
            return;
        }
      }
      
      if (processedImages.length > 0) {
        onUpdateShot({
            referenceImages: [...shot.referenceImages, ...processedImages]
        });
        const msg = hasLargeFiles ? "图片已优化并添加" : "图片添加成功";
        setUploadStatus({ loading: false, msg: msg });
      } else {
        setUploadStatus(null);
      }
      if (e.target) e.target.value = '';
    }
  };

  const removeRefImage = (index: number) => {
    const newImages = [...shot.referenceImages];
    // If it's a blob URL, we should ideally revoke it to prevent leaks, 
    // but React Lifecycle makes strict revocation hard without a custom hook. 
    // Since we are moving to DB storage, it's less critical than Base64 string leaks.
    newImages.splice(index, 1);
    onUpdateShot({ referenceImages: newImages });
  };

  const isKeywordActive = (kw: { label: string, value: string }): boolean => {
    const prompt = (shot.aiPromptEn || "").toLowerCase();
    if (!prompt) return false;

    const value = kw.value.toLowerCase();
    const label = kw.label.toLowerCase(); 

    if (prompt.includes(label)) return true;
    
    const regex = new RegExp(`\\b${escapeRegExp(value)}\\b`, 'g');
    const totalMatches = (prompt.match(regex) || []).length;
    if (totalMatches === 0) return false;

    const parents = PROMPT_KEYWORDS.flatMap(g => g.items)
        .filter(parent => 
            parent.value.toLowerCase() !== value && 
            parent.value.toLowerCase().includes(value)
        );

    let parentMatches = 0;
    for (const parent of parents) {
        const parentRegex = new RegExp(`\\b${escapeRegExp(parent.value.toLowerCase())}\\b`, 'g');
        parentMatches += (prompt.match(parentRegex) || []).length;
    }
    return totalMatches > parentMatches;
  };

  const toggleKeyword = (kw: { label: string, value: string }) => {
    const currentPrompt = shot.aiPromptEn || "";
    const isActive = isKeywordActive(kw);

    if (isActive) {
        let newPrompt = currentPrompt;
        const regexEn = new RegExp(`\\b${escapeRegExp(kw.value)}\\b`, 'gi');
        newPrompt = newPrompt.replace(regexEn, '');
        while (newPrompt.includes(kw.label)) {
            newPrompt = newPrompt.replace(kw.label, '');
        }
        newPrompt = newPrompt.replace(/\s*,\s*,+/g, ','); 
        newPrompt = newPrompt.replace(/^,/, '').replace(/,$/, ''); 
        newPrompt = newPrompt.replace(/\s\s+/g, ' '); 
        newPrompt = newPrompt.trim();
        newPrompt = newPrompt.replace(/,\s*,/g, ',');
        if (newPrompt.startsWith(', ')) newPrompt = newPrompt.substring(2);
        if (newPrompt.endsWith(', ')) newPrompt = newPrompt.slice(0, -2);
        onUpdateShot({ aiPromptEn: newPrompt });
    } else {
        const separator = currentPrompt.trim() === "" ? "" : (currentPrompt.trim().endsWith(',') ? ' ' : ', ');
        onUpdateShot({ aiPromptEn: currentPrompt + separator + kw.value });
    }
  };

  const handleCopy = () => {
    const text = activeTab === 'en' ? shot.aiPromptEn : shot.aiPromptCn;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwitchToCn = async () => {
    setActiveTab('cn');
    
    const sourceText = (shot.aiPromptEn || "").trim();

    // RULE 1: Empty Guard
    if (!sourceText) return;

    // LOGIC FIX: Meaningful Content Guard
    // Only translate if there are letters or Chinese characters. 
    // Skips pure numbers "123" or symbols "..."
    const hasMeaningfulContent = /[a-zA-Z\u4e00-\u9fa5]/.test(sourceText);
    if (!hasMeaningfulContent) return;

    // RULE 2: Pure Chinese Guard
    const hasChinese = /[\u4e00-\u9fa5]/.test(sourceText);
    const hasEnglish = /[a-zA-Z]/.test(sourceText);
    
    if (hasChinese && !hasEnglish) {
        if (shot.aiPromptCn !== sourceText) {
            onUpdateShot({ aiPromptCn: sourceText });
        }
        return;
    }

    // RULE 3: Cache Guard
    if (sourceText === lastTranslatedSource.current && shot.aiPromptCn) {
        return;
    }

    if (!isTranslating) {
        setIsTranslating(true);
        try {
            await onTranslate();
            lastTranslatedSource.current = sourceText;
        } catch (e) {
            console.error("Translation logic error", e);
        } finally {
            setIsTranslating(false);
        }
    }
  };

  return (
    <>
      <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 relative z-10">
        {/* Script Section */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">1. 分镜脚本</label>
          <textarea
            value={shot.script}
            onChange={(e) => onUpdateShot({ script: e.target.value })}
            placeholder="输入简略的分镜头描述..."
            className="w-full h-24 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
          />
          <button
            onClick={onPolish}
            disabled={!shot.script || isProcessing}
            className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 font-medium"
          >
            <Sparkles size={14} />
            <span>智能润色 (Gemini)</span>
          </button>
        </div>

        {/* Enhanced Script */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">2. 润色结果</label>
          <textarea
            value={shot.enhancedScript}
            onChange={(e) => onUpdateShot({ enhancedScript: e.target.value })}
            placeholder="AI润色后的详细描述将显示在这里..."
            className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
          />
          <button
            onClick={onGeneratePrompt}
            disabled={!shot.enhancedScript || isProcessing}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:shadow-none"
          >
            <Wand2 size={16} />
            <span>生成 AI 绘画提示词</span>
          </button>
        </div>

        {/* Prompt Editor Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">3. 视觉提示词 (Prompt)</label>
            <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
              <button
                onClick={() => setActiveTab('en')}
                className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${
                  activeTab === 'en' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                EN
              </button>
              <button
                onClick={handleSwitchToCn}
                className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all flex items-center gap-1 ${
                  activeTab === 'cn' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                CN
                {isTranslating && <Loader2 size={10} className="animate-spin" />}
              </button>
            </div>
          </div>

          <div className="relative group">
            <textarea
              value={isTranslating ? "正在翻译..." : (activeTab === 'en' ? shot.aiPromptEn : shot.aiPromptCn)}
              readOnly={activeTab === 'cn' || isTranslating}
              onChange={(e) => activeTab === 'en' && onUpdateShot({ aiPromptEn: e.target.value })}
              placeholder={activeTab === 'en' ? "English Prompt..." : "中文释义将在此显示..."}
              className={`w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all ${
                activeTab === 'cn' ? 'text-gray-400 italic bg-gray-800/50' : 'text-indigo-300 font-mono'
              }`}
            />
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 bg-gray-900/80 rounded-lg text-gray-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 border border-gray-700"
              title="复制"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>

          {/* Keyword Suggestions */}
          <div className="border border-indigo-500/30 bg-indigo-500/5 rounded-xl p-4 space-y-5">
            {PROMPT_KEYWORDS.map((group) => (
              <div key={group.category}>
                <span className="text-[10px] text-indigo-300/80 font-bold uppercase tracking-wider mb-2 block">{group.category}</span>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((kw) => {
                    const isActive = isKeywordActive(kw);
                    return (
                      <button
                        key={kw.value}
                        onClick={() => toggleKeyword(kw)}
                        className={`px-2.5 py-1 rounded-md text-[11px] transition-all flex items-center gap-1 group/btn shadow-sm border ${
                          isActive 
                            ? 'bg-indigo-600 border-indigo-500 text-white' 
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'
                        }`}
                      >
                        <span>{kw.label}</span>
                        {isActive ? (
                            <Minus size={10} className="opacity-60 group-hover/btn:opacity-100" />
                        ) : (
                            <Plus size={10} className="opacity-0 group-hover/btn:opacity-100 -ml-1 group-hover/btn:ml-0 transition-all" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings Section */}
        <div className="space-y-4 border-t border-gray-800 pt-6">
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-3">4. 参考图 (Reference)</label>
            <div className="grid grid-cols-3 gap-2">
              {shot.referenceImages.map((img, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setViewingImage(img)}
                  className="relative aspect-square group rounded-xl overflow-hidden border border-gray-700 ring-2 ring-transparent hover:ring-indigo-500 transition-all cursor-zoom-in"
                  title="点击查看大图"
                >
                  <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRefImage(idx);
                    }}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-red-500/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md z-10"
                  >
                    <X size={12} />
                  </button>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center">
                    <Eye size={20} className="text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
                  </div>
                </div>
              ))}
              <button
                onClick={() => !uploadStatus?.loading && fileInputRef.current?.click()}
                disabled={uploadStatus?.loading}
                className={`aspect-square bg-gray-800 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-500 transition-all group ${uploadStatus?.loading ? 'opacity-50 cursor-wait' : 'hover:border-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/5'}`}
              >
                {uploadStatus?.loading ? (
                    <Loader2 size={24} className="animate-spin text-indigo-500" />
                ) : (
                    <>
                        <ImagePlus size={24} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] mt-1 font-bold">UPLOAD</span>
                    </>
                )}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-2">* 支持上传本地图片 (自动优化至2K分辨率)</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 block mb-3">5. 画幅比例 (Aspect Ratio)</label>
            <div className="grid grid-cols-5 gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.value}
                  onClick={() => onUpdateShot({ aspectRatio: ratio.value })}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                    shot.aspectRatio === ratio.value
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.15)]'
                      : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-750'
                  }`}
                >
                  <div className={`border border-current rounded-[2px] mb-1.5 transition-all ${
                      ratio.value === AspectRatioEnum.RATIO_16_9 ? 'w-6 h-3.5' :
                      ratio.value === AspectRatioEnum.RATIO_9_16 ? 'w-3.5 h-6' :
                      ratio.value === AspectRatioEnum.RATIO_4_3 ? 'w-6 h-4.5' :
                      ratio.value === AspectRatioEnum.RATIO_3_4 ? 'w-4.5 h-6' :
                      'w-5 h-5'
                  } ${shot.aspectRatio === ratio.value ? 'bg-indigo-500/30' : ''}`}></div>
                  <span className="text-[9px] font-bold">{ratio.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
             <label className="text-sm font-medium text-gray-300 block mb-3">6. AI模型 (Model)</label>
             <div className="grid grid-cols-2 gap-3">
                {AI_MODELS.map(model => (
                  <button
                    key={model.value}
                    onClick={() => onUpdateShot({ model: model.value })}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      shot.model === model.value || (!shot.model && model.id === 'flash')
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-100 shadow-[0_0_15px_rgba(79,70,229,0.1)]'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                    }`}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg ${shot.model === model.value || (!shot.model && model.id === 'flash') ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-500'}`}>
                      {model.id === 'flash' ? <Zap size={14} fill="currentColor" /> : <Star size={14} fill="currentColor" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold flex items-center gap-1.5">
                          {model.label} 
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${shot.model === model.value || (!shot.model && model.id === 'flash') ? 'bg-indigo-500/30 text-indigo-300' : 'bg-gray-700 text-gray-500'}`}>
                             {model.sub}
                          </span>
                      </div>
                      <div className="text-[10px] opacity-70 mt-1 leading-tight">{model.desc}</div>
                    </div>
                  </button>
                ))}
             </div>
          </div>
        </div>
      </div>

      {uploadStatus && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 whitespace-nowrap">
           {uploadStatus.loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
           {uploadStatus.msg}
        </div>
      )}

      {viewingImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200" 
          onClick={() => setViewingImage(null)}
        >
           <div 
             className="relative max-w-full max-h-full flex flex-col items-center" 
             onClick={(e) => e.stopPropagation()} 
           >
              <img 
                src={viewingImage} 
                alt="Full View" 
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-gray-800" 
              />
              <p className="text-gray-400 text-xs mt-4 font-mono bg-black/50 px-3 py-1 rounded-full border border-gray-700">
                点击背景关闭
              </p>
           </div>
           
           <button 
             className="absolute top-6 right-6 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full p-3 transition-all border border-gray-700 shadow-lg group"
             onClick={() => setViewingImage(null)}
           >
              <X size={24} className="group-hover:scale-110 transition-transform" />
           </button>
        </div>
      )}
    </>
  );
};

export default ControlPanel;
