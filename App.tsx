
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ControlPanel from './components/ControlPanel';
import CanvasEditor from './components/CanvasEditor';
import QuotaMonitor from './components/QuotaMonitor';
import { Shot, AspectRatioEnum, CameraParams, UsageMetadata } from './types';
import { polishScript, generatePrompts, generateImage, editImage, extractGridPanel, translateText } from './services/geminiService';
import JSZip from 'jszip';
import { AI_MODELS } from './constants';

const uuid = () => Math.random().toString(36).substr(2, 9);
const randomSeed = () => Math.floor(Math.random() * 1000000000);

const INITIAL_SHOT: Shot = {
  id: 'shot-1',
  name: 'Shot 01',
  script: '',
  enhancedScript: '',
  aiPromptEn: '',
  aiPromptCn: '',
  aspectRatio: AspectRatioEnum.RATIO_16_9,
  referenceImages: [],
  versions: [],
  isGenerating: false,
  cameraParams: {
    azimuth: 0,
    elevation: 0,
    distance: 1.0,
  },
  seed: randomSeed(),
  isGrid: false,
  model: AI_MODELS[0].value // Default to Flash
};

const getCameraDescription = (params: CameraParams): string => {
  const { azimuth, elevation, distance } = params;
  let view = "";
  let angle = "";
  let shotSize = "";

  const normAz = ((azimuth % 360) + 360) % 360;
  if (normAz >= 337.5 || normAz < 22.5) view = "Front view";
  else if (normAz >= 22.5 && normAz < 67.5) view = "Front-right 3/4 view";
  else if (normAz >= 67.5 && normAz < 112.5) view = "Right side profile view";
  else if (normAz >= 112.5 && normAz < 157.5) view = "Rear-right view";
  else if (normAz >= 157.5 && normAz < 202.5) view = "Back view";
  else if (normAz >= 202.5 && normAz < 247.5) view = "Rear-left view";
  else if (normAz >= 247.5 && normAz < 292.5) view = "Left side profile view";
  else view = "Front-left 3/4 view";

  if (elevation > 80) angle = "Directly overhead top-down view, flat lay perspective"; 
  else if (elevation > 60) angle = "High angle bird's-eye view, from above";
  else if (elevation > 20) angle = "High angle shot";
  else if (elevation >= -10 && elevation <= 20) angle = "Eye-level shot, straight on";
  else angle = "Low angle worm's-eye view, looking up";

  if (distance < 0.6) shotSize = "Extreme close-up macro shot";
  else if (distance < 0.9) shotSize = "Close-up portrait shot";
  else if (distance < 1.3) shotSize = "Medium shot, waist-up";
  else if (distance < 1.7) shotSize = "Long shot, full body";
  else shotSize = "Extreme wide shot, panoramic";

  return `${view}, ${angle}, ${shotSize}`;
}

const App: React.FC = () => {
  const [shots, setShots] = useState<Shot[]>([INITIAL_SHOT]);
  const [currentShotId, setCurrentShotId] = useState<string>('shot-1');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Quota Monitoring State
  const [requestTimestamps, setRequestTimestamps] = useState<number[]>([]);
  const [lastUsage, setLastUsage] = useState<UsageMetadata | null>(null);

  const recordUsage = (usage: UsageMetadata) => {
    const now = Date.now();
    setRequestTimestamps(prev => {
        // Filter out timestamps older than 60 seconds
        const oneMinuteAgo = now - 60 * 1000;
        const validTimestamps = prev.filter(t => t > oneMinuteAgo);
        return [...validTimestamps, now];
    });
    setLastUsage(usage);
  };

  const currentShot = shots.find(s => s.id === currentShotId) || shots[0];

  const updateCurrentShot = (updates: Partial<Shot>) => {
    setShots(prev => prev.map(s => s.id === currentShotId ? { ...s, ...updates } : s));
  };

  const handleAddShot = () => {
    const newId = uuid();
    let maxNum = 0;
    shots.forEach(s => {
        const match = s.name.match(/^Shot (\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });
    const nextNum = maxNum + 1;
    setShots([...shots, { ...INITIAL_SHOT, id: newId, name: `Shot ${String(nextNum).padStart(2, '0')}`, versions: [], referenceImages: [], seed: randomSeed(), isGrid: false, model: AI_MODELS[0].value }]);
    setCurrentShotId(newId);
  };

  const handleDeleteShot = (id: string) => {
    if (shots.length === 1) return;
    const newShots = shots.filter(s => s.id !== id);
    setShots(newShots);
    if (currentShotId === id) setCurrentShotId(newShots[0].id);
  };

  const handleError = (e: any, actionName: string) => {
    console.error(actionName, e);
    
    // Extract error message from various possible error structures
    let errorMessage = e.message || "";
    const eJson = JSON.stringify(e);
    
    // Handle specific JSON error structure if present (though service should now normalize this)
    if (e.error && e.error.message) {
        errorMessage = e.error.message;
    }

    if (!errorMessage && typeof e === 'string') {
        errorMessage = e;
    }

    const isRateLimit = 
      errorMessage.includes("429") || 
      errorMessage.includes("RESOURCE_EXHAUSTED") ||
      errorMessage.includes("quota") ||
      eJson.includes("429") || 
      eJson.includes("RESOURCE_EXHAUSTED");

    if (isRateLimit) {
      alert(`⚠️ API 限流警告 (429)\n\n系统已尝试多次重试但仍失败。您的账户可能已达到当前的 API 调用配额。\n\n建议：\n1. 稍等几分钟再试。\n2. 切换到 'Flash' 模型 (消耗更低)。\n3. 检查您的 Google AI Studio 配额设置。`);
    } else {
      alert(`${actionName}失败: ${errorMessage || "未知错误"}`);
    }
  };

  const handleGenerateImage = async (refreshSeed: boolean = false, isGrid: boolean = false) => {
    if (!currentShot.aiPromptEn) return;
    
    const activeSeed = refreshSeed ? randomSeed() : currentShot.seed;
    
    const consistencyImages = [...currentShot.referenceImages];
    
    // 修改核心逻辑：
    // 允许在生成网格(isGrid)时，将当前图片作为垫图(参考图)
    // 这样生成的9张方案就会基于当前选中的这张图进行变体生成
    if (currentShot.imageUrl && !currentShot.isGrid) {
        // 条件：
        // 1. 不刷新种子 (保持当前图微调)
        // 2. 或者 是生成网格 (希望基于当前图生成变体)
        if (!refreshSeed || isGrid) {
            consistencyImages.unshift(currentShot.imageUrl);
        }
    }
    
    updateCurrentShot({ isGenerating: true, seed: activeSeed, isGrid: isGrid });
    
    const cameraDesc = getCameraDescription(currentShot.cameraParams);
    let finalPrompt = `(${cameraDesc}), ${currentShot.aiPromptEn}`;

    // 如果是单图重绘且有参考图，强调保持一致性
    if (!refreshSeed && currentShot.imageUrl && !isGrid) {
        finalPrompt += ", maintain exact character appearance and environment details from the reference image, only change the camera angle";
    }
    
    // 如果是基于原图生成网格，添加变体描述，引导 AI 基于此图发散
    if (isGrid && currentShot.imageUrl && !currentShot.isGrid) {
        finalPrompt += ", generate 9 distinct variations based on the style, composition and subject of the provided reference image";
    }

    console.log(`Generating [Refresh=${refreshSeed}, Grid=${isGrid}, Model=${currentShot.model}]:`, finalPrompt, "Seed:", activeSeed);

    try {
      const { base64, usage } = await generateImage(
          finalPrompt, 
          currentShot.aspectRatio, 
          consistencyImages, 
          activeSeed,
          isGrid,
          currentShot.model // Pass current model
      );
      recordUsage(usage);
      updateCurrentShot({ imageUrl: base64, versions: [...currentShot.versions, base64] });
    } catch (e) {
      handleError(e, "图片生成");
      updateCurrentShot({ isGrid: false }); // Reset grid if failed
    } finally {
      updateCurrentShot({ isGenerating: false });
    }
  };

  const handleExtractGridImage = async (index: number) => {
    // index: 1-9
    if (!currentShot.imageUrl) return;

    // 不再使用Canvas裁剪，而是调用AI重绘
    updateCurrentShot({ isGenerating: true });

    try {
        const cameraDesc = getCameraDescription(currentShot.cameraParams);
        const fullPrompt = `(${cameraDesc}), ${currentShot.aiPromptEn}`;

        const { base64: newBase64, usage } = await extractGridPanel(
            currentShot.imageUrl,
            index,
            fullPrompt,
            currentShot.aspectRatio,
            currentShot.model // Pass current model
        );
        recordUsage(usage);

        updateCurrentShot({ 
           imageUrl: newBase64, 
           isGrid: false, 
           versions: [...currentShot.versions, newBase64] 
        });
    } catch (e) {
        handleError(e, "高清提取");
    } finally {
        updateCurrentShot({ isGenerating: false });
    }
  };

  const handleEditImage = async (base64ImageFromCanvas: string, editPrompt: string) => {
      updateCurrentShot({ isGenerating: true });
      try {
          const { base64: newImage, usage } = await editImage(base64ImageFromCanvas, editPrompt || currentShot.aiPromptEn, currentShot.model);
          recordUsage(usage);
          updateCurrentShot({ imageUrl: newImage, versions: [...currentShot.versions, newImage] });
      } catch (e) {
          handleError(e, "局部编辑");
      } finally {
        updateCurrentShot({ isGenerating: false });
      }
  };

  const handleDeleteVersion = (index: number) => {
    const newVersions = [...currentShot.versions];
    const deletedImage = newVersions[index];
    newVersions.splice(index, 1);

    // 如果删除的是当前显示的图片，切换到列表中的最后一张，如果列表为空则置空
    let nextImageUrl = currentShot.imageUrl;
    if (currentShot.imageUrl === deletedImage) {
        nextImageUrl = newVersions.length > 0 ? newVersions[newVersions.length - 1] : undefined;
    }

    updateCurrentShot({
        versions: newVersions,
        imageUrl: nextImageUrl
    });
  };

  const handleTranslatePrompt = async () => {
    if (!currentShot.aiPromptEn) return;
    try {
        const { text: cn, usage } = await translateText(currentShot.aiPromptEn);
        recordUsage(usage);
        updateCurrentShot({ aiPromptCn: cn });
    } catch (e) {
        console.error("Translation failed", e);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-gray-100 overflow-hidden font-sans">
      <Sidebar shots={shots} currentShotId={currentShotId} onSelectShot={setCurrentShotId} onAddShot={handleAddShot} onDeleteShot={handleDeleteShot} onDownloadAll={() => {}} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-gray-700 bg-gray-800 flex items-center px-6 justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold">AI</div>
             <h2 className="text-lg font-bold tracking-wide">分镜头绘画师 <span className="text-xs font-normal text-gray-400 ml-2">v1.4 • 9宫格方案版</span></h2>
           </div>
           
           {/* Monitor in Header */}
           <div className="flex items-center gap-4">
              <QuotaMonitor requestTimestamps={requestTimestamps} lastUsage={lastUsage} />
              <div className="h-6 w-px bg-gray-700"></div>
              <div className="text-sm text-gray-400">当前编辑: <span className="text-white font-medium">{currentShot.name}</span></div>
           </div>
        </header>
        <main className="flex-1 flex overflow-hidden">
          <div className="w-[400px] border-r border-gray-700 bg-gray-900 flex flex-col">
            <ControlPanel 
                shot={currentShot} 
                onUpdateShot={updateCurrentShot} 
                onPolish={async () => {
                    setIsProcessing(true);
                    try { 
                        const { text: polished, usage } = await polishScript(currentShot.script); 
                        recordUsage(usage);
                        updateCurrentShot({ enhancedScript: polished }); 
                    }
                    catch(e) { handleError(e, "脚本润色"); }
                    finally { setIsProcessing(false); }
                }} 
                onGeneratePrompt={async () => {
                    setIsProcessing(true);
                    try { 
                        const { en, cn, usage } = await generatePrompts(currentShot.enhancedScript); 
                        recordUsage(usage);
                        updateCurrentShot({ aiPromptEn: en, aiPromptCn: cn }); 
                    }
                    catch(e) { handleError(e, "提示词生成"); }
                    finally { setIsProcessing(false); }
                }} 
                onTranslate={handleTranslatePrompt}
                isProcessing={isProcessing} 
            />
          </div>
          <div className="flex-1 min-w-0 bg-black relative">
             <CanvasEditor 
                shot={currentShot} isGenerating={currentShot.isGenerating} 
                onGenerate={handleGenerateImage}
                onGenerateGrid={() => handleGenerateImage(true, true)}
                onExtractGridImage={handleExtractGridImage}
                onEdit={handleEditImage}
                onSelectVersion={(i) => updateCurrentShot({ imageUrl: currentShot.versions[i], isGrid: false })}
                onDeleteVersion={handleDeleteVersion}
                onUpdateCamera={(cameraParams) => updateCurrentShot({ cameraParams })}
             />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
