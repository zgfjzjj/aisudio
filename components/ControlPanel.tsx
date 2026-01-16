
import React, { useRef, useState } from 'react';
import { Shot, AspectRatioEnum } from '../types';
import { ASPECT_RATIOS, PROMPT_KEYWORDS } from '../constants';
import { Sparkles, Wand2, ImagePlus, X, Languages, Plus, Copy, Check } from 'lucide-react';

interface ControlPanelProps {
  shot: Shot;
  onUpdateShot: (updates: Partial<Shot>) => void;
  onPolish: () => void;
  onGeneratePrompt: () => void;
  isProcessing: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  shot,
  onUpdateShot,
  onPolish,
  onGeneratePrompt,
  isProcessing
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'en' | 'cn'>('en');
  const [copied, setCopied] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          onUpdateShot({
            referenceImages: [...shot.referenceImages, reader.result as string]
          });
        };
        reader.readAsDataURL(file as Blob);
      });
    }
  };

  const removeRefImage = (index: number) => {
    const newImages = [...shot.referenceImages];
    newImages.splice(index, 1);
    onUpdateShot({ referenceImages: newImages });
  };

  const addKeyword = (keyword: string) => {
    const currentPrompt = shot.aiPromptEn || "";
    const separator = currentPrompt && !currentPrompt.endsWith(',') ? ', ' : '';
    onUpdateShot({ aiPromptEn: currentPrompt + separator + keyword });
  };

  const handleCopy = () => {
    const text = activeTab === 'en' ? shot.aiPromptEn : shot.aiPromptCn;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
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
              onClick={() => setActiveTab('cn')}
              className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${
                activeTab === 'cn' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              CN
            </button>
          </div>
        </div>

        <div className="relative group">
          <textarea
            value={activeTab === 'en' ? shot.aiPromptEn : shot.aiPromptCn}
            readOnly={activeTab === 'cn'}
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
        <div className="space-y-3 pt-1">
          {PROMPT_KEYWORDS.map((group) => (
            <div key={group.category}>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2 block">{group.category}</span>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((kw) => (
                  <button
                    key={kw.value}
                    onClick={() => addKeyword(kw.value)}
                    className="px-2 py-1 bg-gray-800 hover:bg-indigo-600/30 border border-gray-700 hover:border-indigo-500 text-gray-400 hover:text-indigo-300 rounded-lg text-[11px] transition-all flex items-center gap-1 group/btn"
                  >
                    <span>{kw.label}</span>
                    <Plus size={10} className="opacity-0 group-hover/btn:opacity-100" />
                  </button>
                ))}
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
              <div key={idx} className="relative aspect-square group rounded-xl overflow-hidden border border-gray-700 ring-2 ring-transparent hover:ring-indigo-500 transition-all">
                <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeRefImage(idx)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square bg-gray-800 border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:text-indigo-400 transition-all hover:bg-indigo-500/5 group"
            >
              <ImagePlus size={24} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] mt-1 font-bold">UPLOAD</span>
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
      </div>
    </div>
  );
};

export default ControlPanel;
