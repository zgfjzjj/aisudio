
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ControlPanel from './components/ControlPanel';
import CanvasEditor from './components/CanvasEditor';
import QuotaMonitor from './components/QuotaMonitor';
import GalleryModal from './components/GalleryModal';
import { Shot, AspectRatioEnum, CameraParams, UsageMetadata } from './types';
import { polishScriptStream, generatePromptsStream, generateImage, editImage, extractGridPanel, translateTextStream } from './services/geminiService';
import { saveShotsToDB, loadShotsFromDB, migrateFromLocalStorage, base64ToBlob, blobToBase64 } from './services/db'; 
import JSZip from 'jszip';
import { AI_MODELS } from './constants';
import { Loader2, AlertCircle, X } from 'lucide-react';

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
  model: AI_MODELS[0].value,
  isScriptDirty: false,
  isEnhancedScriptDirty: false
};

// Moved helper to handle Camera Description logic
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

export function App() {
  const [shots, setShots] = useState<Shot[]>([INITIAL_SHOT]);
  const [isDbLoaded, setIsDbLoaded] = useState(false); 
  const [showGallery, setShowGallery] = useState(false); 
  const [globalError, setGlobalError] = useState<{title: string, message?: string, items?: string[]} | null>(null);

  // Load from DB on Mount
  useEffect(() => {
    const initData = async () => {
      try {
        await migrateFromLocalStorage();
        const dbData = await loadShotsFromDB();
        if (dbData && dbData.length > 0) {
          setShots(dbData);
        }
      } catch (error) {
        console.error("Failed to initialize database:", error);
      } finally {
        setIsDbLoaded(true);
      }
    };
    initData();
  }, []);

  const [currentShotId, setCurrentShotId] = useState<string>(() => {
     try {
       const saved = localStorage.getItem('ai-storyboard-current-id');
       return saved || 'shot-1';
     } catch {
       return 'shot-1';
     }
  });

  const [isProcessing, setIsProcessing] = useState(false);
  
  // Quota Monitoring
  const [requestTimestamps, setRequestTimestamps] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('ai-storyboard-quota');
      if (!saved) return [];
      const timestamps = JSON.parse(saved);
      const now = Date.now();
      return timestamps.filter((t: number) => t > now - 60 * 1000);
    } catch {
      return [];
    }
  });
  const [lastUsage, setLastUsage] = useState<UsageMetadata | null>(null);

  // DB Persistence Effect (Debounced)
  useEffect(() => {
    if (!isDbLoaded) return; 

    const timer = setTimeout(() => {
        saveShotsToDB(shots).catch(err => console.error("Auto-save failed:", err));
    }, 1000); 

    return () => clearTimeout(timer);
  }, [shots, isDbLoaded]);

  // Minor metadata persistence in LS (Safe)
  useEffect(() => {
    localStorage.setItem('ai-storyboard-current-id', currentShotId);
  }, [currentShotId]);

  useEffect(() => {
    localStorage.setItem('ai-storyboard-quota', JSON.stringify(requestTimestamps));
  }, [requestTimestamps]);

  // Helper: Revoke Object URLs for a shot to prevent memory leaks
  const revokeShotResources = (shot: Shot) => {
      if (shot.imageUrl && shot.imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(shot.imageUrl);
      }
      shot.versions.forEach(v => {
          if (v.startsWith('blob:')) URL.revokeObjectURL(v);
      });
      shot.referenceImages.forEach(r => {
          if (r.startsWith('blob:')) URL.revokeObjectURL(r);
      });
  };

  const recordUsage = (usage: UsageMetadata) => {
    const now = Date.now();
    setRequestTimestamps(prev => {
        const oneMinuteAgo = now - 60 * 1000;
        const validTimestamps = prev.filter(t => t > oneMinuteAgo);
        return [...validTimestamps, now];
    });
    setLastUsage(usage);
  };

  const currentShot = shots.find(s => s.id === currentShotId) || shots[0];

  const updateCurrentShot = (updates: Partial<Shot>) => {
    setShots(prev => prev.map(s => {
      if (s.id !== currentShotId) return s;
      
      const newShot = { ...s, ...updates };
      
      // Automatic Dirty Flag Management (Visual Hints Only)
      // This does NOT block workflows, just updates UI indicators
      
      // If script changed, mark script dirty
      if (updates.script !== undefined && updates.script !== s.script) {
          newShot.isScriptDirty = true;
      }
      // If enhancedScript changed (manually), mark enhancedScript dirty
      if (updates.enhancedScript !== undefined && updates.enhancedScript !== s.enhancedScript) {
          newShot.isEnhancedScriptDirty = true;
      }

      return newShot;
    }));
  };

  const handleAddShot = () => {
    const newId = uuid();
    let maxNum = 0;
    shots.forEach(s => {
        const match = s.name.match(/^Shot (\d+)/); // Relaxed regex
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
    if (shots.length === 1) {
        setGlobalError({ title: "操作无法完成", message: "至少保留一个镜头。" });
        return;
    }
    
    const shotToDelete = shots.find(s => s.id === id);
    if (shotToDelete) {
        revokeShotResources(shotToDelete);
    }

    const newShots = shots.filter(s => s.id !== id);
    setShots(newShots);
    if (currentShotId === id) setCurrentShotId(newShots[0].id);
  };

  const handleError = (e: any, actionName: string) => {
    console.error(actionName, e);
    let errorMessage = e.message || "";
    const eJson = JSON.stringify(e);
    if (e.error && e.error.message) errorMessage = e.error.message;
    if (!errorMessage && typeof e === 'string') errorMessage = e;

    const isRateLimit = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");

    if (isRateLimit) {
      setGlobalError({
          title: "API 限流警告 (429)",
          message: "系统已尝试多次重试但仍失败。您的账户可能已达到当前的 API 调用配额。",
          items: [
              "稍等几分钟再试",
              "切换到 'Flash' 模型 (消耗更低)",
              "检查您的 Google AI Studio 配额设置"
          ]
      });
    } else {
      setGlobalError({
          title: `${actionName}失败`,
          message: errorMessage || "未知错误，请检查控制台日志。"
      });
    }
  };

  const processBase64ToStateUrl = (base64: string): string => {
      const blob = base64ToBlob(base64);
      return URL.createObjectURL(blob);
  };

  const prepareImagesForApi = async (urls: string[]): Promise<string[]> => {
      return Promise.all(urls.map(url => blobToBase64(url)));
  };

  const handleGenerateImage = async (refreshSeed: boolean = false, isGrid: boolean = false) => {
    // Note: We do NOT check isDirty flags here. User can generate whenever they want.
    if (!currentShot.aiPromptEn) return;
    
    const activeSeed = refreshSeed ? randomSeed() : currentShot.seed;
    
    const consistencyUrls = [...currentShot.referenceImages];
    if (currentShot.imageUrl && !currentShot.isGrid) {
        if (!refreshSeed || isGrid) {
            consistencyUrls.unshift(currentShot.imageUrl);
        }
    }

    updateCurrentShot({ isGenerating: true, seed: activeSeed, isGrid: isGrid });
    
    // PROMPT OPTIMIZATION: Put Camera Params explicitly at the start with strict format
    // This helps the model adhere to camera angles even if the user prompts vaguely
    const cameraDesc = getCameraDescription(currentShot.cameraParams);
    
    // Using a clear structured format [Parameter] Content
    let finalPrompt = `[Camera Angle: ${cameraDesc}] ${currentShot.aiPromptEn}`;
    
    if (!refreshSeed && currentShot.imageUrl && !isGrid) {
        finalPrompt += ", maintain exact character appearance and environment details from the reference image, only change the camera angle";
    }
    if (isGrid && currentShot.imageUrl && !currentShot.isGrid) {
        finalPrompt += ", generate 9 distinct variations based on the style, composition and subject of the provided reference image";
    }

    try {
      const consistencyBase64s = await prepareImagesForApi(consistencyUrls);

      const { base64, usage } = await generateImage(
          finalPrompt, 
          currentShot.aspectRatio, 
          consistencyBase64s, 
          activeSeed,
          isGrid,
          currentShot.model 
      );
      recordUsage(usage);

      const blobUrl = processBase64ToStateUrl(base64);

      updateCurrentShot({ imageUrl: blobUrl, versions: [...currentShot.versions, blobUrl] });
    } catch (e) {
      handleError(e, "图片生成");
      updateCurrentShot({ isGrid: false });
    } finally {
      updateCurrentShot({ isGenerating: false });
    }
  };

  const handleExtractGridImage = async (index: number) => {
    if (!currentShot.imageUrl) return;
    
    const newId = uuid();
    let maxNum = 0;
    shots.forEach(s => {
        const match = s.name.match(/^Shot (\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });
    const nextNum = maxNum + 1;
    const newName = `Shot ${String(nextNum).padStart(2, '0')} (从Shot${currentShot.name.split(' ')[1] || ''}提取)`;

    const newShot: Shot = {
        ...INITIAL_SHOT,
        id: newId,
        name: newName,
        script: currentShot.script,
        enhancedScript: currentShot.enhancedScript,
        aiPromptEn: currentShot.aiPromptEn,
        aiPromptCn: currentShot.aiPromptCn,
        aspectRatio: currentShot.aspectRatio,
        model: currentShot.model,
        isGenerating: true 
    };

    setShots(prev => [...prev, newShot]);
    setCurrentShotId(newId);

    try {
        const cameraDesc = getCameraDescription(currentShot.cameraParams);
        const fullPrompt = `[Camera Angle: ${cameraDesc}] ${currentShot.aiPromptEn}`;
        
        const gridBase64 = await blobToBase64(currentShot.imageUrl);

        const { base64: newBase64, usage } = await extractGridPanel(
            gridBase64, index, fullPrompt, currentShot.aspectRatio, currentShot.model
        );
        
        recordUsage(usage);
        const blobUrl = processBase64ToStateUrl(newBase64);

        setShots(prev => prev.map(s => s.id === newId ? {
             ...s, 
             imageUrl: blobUrl, 
             versions: [blobUrl], 
             isGenerating: false 
        } : s));

    } catch (e) {
        handleError(e, "提取分镜");
        setShots(prev => prev.filter(s => s.id !== newId));
        setCurrentShotId(currentShotId);
    }
  };

  const handlePolishScript = async () => {
    if (!currentShot.script) return;
    setIsProcessing(true);
    try {
       await polishScriptStream(currentShot.script, (text) => {
          setShots(prev => prev.map(s => s.id === currentShotId ? { 
              ...s, 
              enhancedScript: text,
              isScriptDirty: false, // Polish done, clear dirty flag
              isEnhancedScriptDirty: true // New enhanced script means prompt might need update (visual hint)
          } : s));
       });
    } catch (e) {
       handleError(e, "脚本润色");
    } finally {
       setIsProcessing(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!currentShot.enhancedScript) return;
    setIsProcessing(true);
    // User chose to generate prompt from script, so we assume they want this flow.
    try {
       await generatePromptsStream(currentShot.enhancedScript, (en, cn) => {
          setShots(prev => prev.map(s => s.id === currentShotId ? { 
              ...s, 
              aiPromptEn: en, 
              aiPromptCn: cn,
              isEnhancedScriptDirty: false // Prompt updated, clear dirty flag
          } : s));
       });
    } catch (e) {
       handleError(e, "提示词生成");
    } finally {
       setIsProcessing(false);
    }
  };

  const handleTranslatePrompt = async () => {
    if (!currentShot.aiPromptEn) return;
    setIsProcessing(true);
    try {
       await translateTextStream(currentShot.aiPromptEn, (text) => {
         setShots(prev => prev.map(s => s.id === currentShotId ? { ...s, aiPromptCn: text } : s));
       });
    } catch (e) {
       handleError(e, "翻译");
    } finally {
       setIsProcessing(false);
    }
  };

  const handleEditImage = async (base64Image: string, editPrompt: string) => {
     updateCurrentShot({ isGenerating: true });
     try {
       const { base64: newBase64, usage } = await editImage(base64Image, editPrompt, currentShot.model);
       recordUsage(usage);
       const blobUrl = processBase64ToStateUrl(newBase64);
       updateCurrentShot({ imageUrl: blobUrl, versions: [...currentShot.versions, blobUrl] });
     } catch (e) {
       handleError(e, "局部重绘");
     } finally {
       updateCurrentShot({ isGenerating: false });
     }
  };

  const handleSelectVersion = (index: number) => {
     const url = currentShot.versions[index];
     updateCurrentShot({ imageUrl: url });
  };

  const handleDeleteVersion = (index: number) => {
     const versionToDelete = currentShot.versions[index];
     
     if (versionToDelete.startsWith('blob:')) {
         URL.revokeObjectURL(versionToDelete);
     }

     const newVersions = currentShot.versions.filter((_, i) => i !== index);
     
     let newImageUrl = currentShot.imageUrl;
     if (currentShot.imageUrl === versionToDelete) {
        newImageUrl = newVersions.length > 0 ? newVersions[newVersions.length - 1] : undefined;
     }

     updateCurrentShot({ versions: newVersions, imageUrl: newImageUrl });
  };

  const handleUpdateCamera = (params: CameraParams) => {
      updateCurrentShot({ cameraParams: params });
  };

  const handleDownloadAll = async () => {
     const zip = new JSZip();
     const folder = zip.folder("storyboard");
     
     let count = 0;
     for (const s of shots) {
        if (s.imageUrl) {
            try {
                const response = await fetch(s.imageUrl);
                const blob = await response.blob();
                folder?.file(`${s.name}.png`, blob);
                count++;
            } catch (e) {
                console.error(`Failed to zip ${s.name}`, e);
            }
        }
        const info = `Script: ${s.script}\nPrompt: ${s.aiPromptEn}`;
        folder?.file(`${s.name}.txt`, info);
     }

     if (count === 0) {
        setGlobalError({ title: "无法下载", message: "没有可下载的图片生成记录。" });
        return;
     }

     try {
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = "storyboard_project.zip";
        link.click();
     } catch (e) {
        handleError(e, "打包下载");
     }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        shots={shots}
        currentShotId={currentShotId}
        onSelectShot={setCurrentShotId}
        onAddShot={handleAddShot}
        onDeleteShot={handleDeleteShot}
        onDownloadAll={handleDownloadAll}
        onOpenGallery={() => setShowGallery(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex min-h-0">
          
          {/* Control Panel (Left Pane) */}
          <div className="w-[420px] bg-gray-900 border-r border-gray-700 flex flex-col z-20 shadow-xl">
             <ControlPanel
               shot={currentShot}
               onUpdateShot={updateCurrentShot}
               onPolish={handlePolishScript}
               onGeneratePrompt={handleGeneratePrompt}
               onTranslate={handleTranslatePrompt}
               isProcessing={isProcessing}
               onError={(title, items) => setGlobalError({ title, items })} 
             />
          </div>

          {/* Canvas Editor (Right Pane) */}
          <div className="flex-1 bg-gray-950 relative min-w-0">
             <CanvasEditor
               shot={currentShot}
               isGenerating={currentShot.isGenerating}
               onGenerate={(refreshSeed) => handleGenerateImage(refreshSeed, false)}
               onGenerateGrid={() => handleGenerateImage(true, true)}
               onExtractGridImage={handleExtractGridImage}
               onEdit={handleEditImage}
               onSelectVersion={handleSelectVersion}
               onDeleteVersion={handleDeleteVersion}
               onUpdateCamera={handleUpdateCamera}
               requestTimestamps={requestTimestamps}
               lastUsage={lastUsage}
             />
          </div>
        </div>
      </div>

      {showGallery && (
        <GalleryModal shots={shots} onClose={() => setShowGallery(false)} />
      )}

      {globalError && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-4">
               <div className="p-3 bg-red-500/10 rounded-full shrink-0">
                  <AlertCircle size={24} className="text-red-500" />
               </div>
               <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white mb-1 break-words">{globalError.title}</h3>
                  {globalError.message && (
                     <p className="text-xs text-gray-400 leading-relaxed">{globalError.message}</p>
                  )}
               </div>
            </div>
            
            {globalError.items && globalError.items.length > 0 && (
              <div className="bg-black/50 rounded-lg p-3 max-h-48 overflow-y-auto mb-6 border border-gray-800 scrollbar-thin">
                 <ul className="space-y-2">
                   {globalError.items.map((item, idx) => (
                      <li key={idx} className="text-xs text-red-300 flex items-start gap-2 break-all">
                         <span className="mt-1.5 w-1 h-1 rounded-full bg-red-500 shrink-0"></span>
                         {item}
                      </li>
                   ))}
                 </ul>
              </div>
            )}

            <button 
              onClick={() => setGlobalError(null)}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-colors text-sm border border-gray-700 hover:border-gray-600"
            >
              关闭 / Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
