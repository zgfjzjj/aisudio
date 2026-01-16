
import React, { useEffect, useRef, useState } from 'react';
import { Shot, UsageMetadata } from '../types';
import { BRUSH_COLORS } from '../constants';
import { Brush, Loader2, Download, RefreshCw, Palette, X, Undo2, Sparkles, Video, Grid3X3, MousePointerClick } from 'lucide-react';
import CameraGizmo from './CameraGizmo';
import QuotaMonitor from './QuotaMonitor';

const getCameraDesc = (params: any) => {
    const { azimuth, elevation, distance } = params;
    let view = "", angle = "", shot = "";
    
    // Azimuth (方位角)
    const az = ((azimuth % 360) + 360) % 360;
    if (az >= 337.5 || az < 22.5) view = "正视图 (Front)";
    else if (az >= 22.5 && az < 67.5) view = "右前侧视 (Front-Right)";
    else if (az >= 67.5 && az < 112.5) view = "右侧视 (Right)";
    else if (az >= 112.5 && az < 157.5) view = "右后侧视 (Rear-Right)";
    else if (az >= 157.5 && az < 202.5) view = "背视图 (Back)";
    else if (az >= 202.5 && az < 247.5) view = "左后侧视 (Rear-Left)";
    else if (az >= 247.5 && az < 292.5) view = "左侧视 (Left)";
    else view = "左前侧视 (Front-Left)";

    // Elevation (俯仰角)
    if (elevation > 80) angle = "垂直俯瞰 (顶视)";
    else if (elevation > 60) angle = "鸟瞰 (高角度)";
    else if (elevation > 20) angle = "俯视";
    else if (elevation >= -10 && elevation <= 20) angle = "平视 (人眼视角)";
    else angle = "仰视 (低角度)";

    // Distance (距离/景别)
    if (distance < 0.6) shot = "特写 (Close-up)";
    else if (distance < 0.9) shot = "近景 (Portrait)";
    else if (distance < 1.3) shot = "中景 (Medium)";
    else if (distance < 1.7) shot = "全景 (Long Shot)";
    else shot = "大远景 (Extreme Wide)";

    return `${view} · ${angle} · ${shot}`;
};

interface CanvasEditorProps {
  shot: Shot;
  isGenerating: boolean;
  onGenerate: (refreshSeed?: boolean) => void;
  onGenerateGrid: () => void;
  onExtractGridImage: (index: number) => void;
  onEdit: (base64Image: string, editPrompt: string) => void;
  onSelectVersion: (index: number) => void;
  onDeleteVersion: (index: number) => void;
  onUpdateCamera: (params: any) => void;
  requestTimestamps: number[];
  lastUsage: UsageMetadata | null;
}

const CanvasEditor: React.FC<CanvasEditorProps> = ({
  shot,
  isGenerating,
  onGenerate,
  onGenerateGrid,
  onExtractGridImage,
  onEdit,
  onSelectVersion,
  onDeleteVersion,
  onUpdateCamera,
  requestTimestamps,
  lastUsage
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState(BRUSH_COLORS[0]);
  const [brushSize, setBrushSize] = useState(20);
  const [isBrushMode, setIsBrushMode] = useState(false);
  const [showCameraControl, setShowCameraControl] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [brushHistory, setBrushHistory] = useState<ImageData[]>([]);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shot.imageUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Reset history and ratio when image changes
    setBrushHistory([]);
    setImageAspectRatio(null); 

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = shot.imageUrl;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      setImageAspectRatio(img.width / img.height);
      ctx.drawImage(img, 0, 0);
    };
  }, [shot.imageUrl]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isBrushMode || !shot.imageUrl || shot.isGrid) return; // Grid模式禁用画笔
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
       const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
       setBrushHistory(prev => [...prev, imageData]);
    }
    setIsDrawing(true);
    const pos = getCoordinates(e);
    if (pos) setLastPos(pos);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isBrushMode || !lastPos || !canvasRef.current) return;
    const pos = getCoordinates(e);
    if (!pos) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.stroke();
    setLastPos(pos);
  };

  const stopDrawing = () => { setIsDrawing(false); setLastPos(null); };

  const handleUndoBrush = () => {
    if (brushHistory.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
       ctx.putImageData(brushHistory[brushHistory.length - 1], 0, 0);
       setBrushHistory(prev => prev.slice(0, -1));
    }
  };

  const handleEditClick = () => {
      if (canvasRef.current && editPrompt.trim()) {
          onEdit(canvasRef.current.toDataURL('image/png'), editPrompt);
      }
  }

  const cameraDesc = getCameraDesc(shot.cameraParams);

  // 计算当前应该使用的长宽比
  const activeRatio = shot.imageUrl && imageAspectRatio 
    ? imageAspectRatio 
    : (() => {
        const [w, h] = shot.aspectRatio.split(':').map(Number);
        return w / h;
      })();

  return (
    <div className="flex flex-col h-full bg-gray-900 relative">
      {/* 镜头控制器 悬浮面板 */}
      {showCameraControl && (
        <div className="absolute top-16 right-6 z-50 w-80 animate-in fade-in zoom-in duration-200">
           <div className="flex items-center justify-between mb-2 bg-gray-800 p-2 rounded-t-xl border-x border-t border-gray-700 shadow-lg">
              <span className="text-xs font-bold text-indigo-400 flex items-center gap-1"><Video size={14}/> 3D 镜头参数</span>
              <button onClick={() => setShowCameraControl(false)} className="text-gray-500 hover:text-white"><X size={14}/></button>
           </div>
           <CameraGizmo 
              params={shot.cameraParams} 
              onChange={onUpdateCamera} 
              previewImage={shot.imageUrl}
              promptDescription={cameraDesc}
           />
        </div>
      )}

      {/* Toolbar */}
      <div className="h-14 border-b border-gray-700 bg-gray-800 flex items-center justify-between px-4 z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setIsBrushMode(!isBrushMode)}
              disabled={!shot.imageUrl || shot.isGrid}
              className={`p-2 rounded-md transition-colors ${isBrushMode ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'} disabled:opacity-30`}
              title="局部重绘画笔"
            >
              <Brush size={18} />
            </button>
            {isBrushMode && (
               <>
                 <div className="w-px h-6 bg-gray-600 mx-1"></div>
                 <div className="flex gap-1">
                    {BRUSH_COLORS.map(c => (
                        <button key={c} onClick={() => setBrushColor(c)} className={`w-5 h-5 rounded-full border-2 ${brushColor === c ? 'border-white' : 'border-transparent'}`} style={{backgroundColor: c}} />
                    ))}
                 </div>
                 <button onClick={handleUndoBrush} disabled={brushHistory.length === 0} className="ml-2 p-1.5 rounded hover:bg-gray-600 text-gray-300 hover:text-white disabled:opacity-30 transition-colors">
                    <Undo2 size={18} />
                 </button>
               </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
           {/* Integrated Quota Monitor */}
           <div className="hidden lg:block mr-2 opacity-90 scale-95 origin-right">
              <QuotaMonitor requestTimestamps={requestTimestamps} lastUsage={lastUsage} />
           </div>
           <div className="hidden lg:block w-px h-6 bg-gray-700 mx-1"></div>

           <button 
             onClick={() => setShowCameraControl(!showCameraControl)}
             className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold border transition-all ${showCameraControl ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}
           >
             <Video size={16} />
             镜头控制
           </button>
           {shot.imageUrl && !shot.isGrid && (
             <button onClick={() => {
                const link = document.createElement('a');
                link.href = shot.imageUrl!;
                link.download = `${shot.name}.png`;
                link.click();
             }} className="p-2 text-gray-400 hover:text-white">
               <Download size={20} />
             </button>
           )}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-hidden relative flex items-center justify-center p-8 bg-gray-950">
        <div 
          ref={containerRef}
          className={`relative shadow-2xl transition-all duration-300 flex items-center justify-center group
            ${!shot.imageUrl ? 'bg-gray-900 border border-gray-800' : ''}
            w-auto h-auto max-w-full max-h-full
          `}
          style={{ aspectRatio: activeRatio }}
        >
            {!shot.imageUrl && !isGenerating && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                    <Palette size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium">配置参数后点击生成第一张分镜</p>
                 </div>
            )}

            {isGenerating && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-lg">
                    <div className="relative">
                      <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
                      <Sparkles size={20} className="absolute -top-1 -right-1 text-yellow-400 animate-pulse" />
                    </div>
                    <p className="text-white text-sm font-bold tracking-widest animate-pulse">GENERATING STORYBOARD...</p>
                </div>
            )}
            
            <canvas
              ref={canvasRef}
              className={`block w-full h-full object-contain shadow-lg ${!shot.imageUrl ? 'hidden' : ''} cursor-${isBrushMode ? 'crosshair' : 'default'}`}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />

            {/* 9宫格交互层 Overlay */}
            {shot.isGrid && shot.imageUrl && !isGenerating && (
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 z-20 pointer-events-auto">
                    {Array.from({ length: 9 }).map((_, idx) => (
                        <div 
                            key={idx}
                            onClick={(e) => {
                                e.stopPropagation();
                                onExtractGridImage(idx + 1);
                            }}
                            className="relative border border-white/10 hover:border-indigo-400 hover:bg-indigo-500/10 cursor-pointer transition-all group/cell"
                        >
                            <div className="absolute top-1 left-1 w-6 h-6 bg-black/60 backdrop-blur text-white text-xs font-bold flex items-center justify-center rounded-md border border-white/20 group-hover/cell:bg-indigo-600 group-hover/cell:border-indigo-400">
                                {idx + 1}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <span className="bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-full shadow-lg font-bold flex items-center gap-1">
                                    <MousePointerClick size={12}/> 提取
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>

      {/* Footer Area */}
      <div className="flex flex-col border-t border-gray-700 bg-gray-800 shrink-0">
          {shot.versions.length > 0 && (
             <div className="h-24 border-b border-gray-700 bg-gray-900/50 flex items-center gap-4 px-4 overflow-x-auto">
                <div className="flex items-center gap-2 h-full py-2">
                   {shot.versions.map((v, i) => (
                       <div key={i} className="relative group/item flex-shrink-0">
                           <button
                             onClick={() => onSelectVersion(i)}
                             className={`flex flex-col items-center gap-1 rounded-lg p-1 transition-all ${shot.imageUrl === v ? 'bg-gray-700 ring-2 ring-indigo-500' : 'hover:bg-gray-800'}`}
                           >
                               <div className="h-14 w-20 bg-black rounded overflow-hidden border border-gray-700">
                                   <img src={v} className="w-full h-full object-cover" alt={`V${i + 1}`} />
                               </div>
                               <span className={`text-[10px] font-mono ${shot.imageUrl === v ? 'text-indigo-400 font-bold' : 'text-gray-500'}`}>V{i + 1}</span>
                           </button>
                           <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteVersion(i);
                                }}
                                className="absolute top-0 right-0 p-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full opacity-0 group-hover/item:opacity-100 transition-all translate-x-1/3 -translate-y-1/3 shadow-sm z-10 scale-90"
                                title="删除此版本"
                           >
                                <X size={10} />
                           </button>
                       </div>
                   ))}
                </div>
             </div>
          )}

          <div className="h-20 p-4 flex items-center justify-center gap-4 relative">
            {!shot.imageUrl ? (
                <button
                    onClick={() => onGenerate(true)} // Default to new seed for first gen
                    disabled={isGenerating || !shot.aiPromptEn}
                    className="w-full max-w-md py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-600/40 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                    <Sparkles size={20} />
                    开始绘制分镜
                </button>
            ) : isBrushMode ? (
                <div className="flex items-center gap-3 w-full max-w-3xl animate-in fade-in slide-in-from-bottom-2">
                    <input 
                      type="text" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="涂抹区域并输入修改指令..."
                      className="flex-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    />
                    <button onClick={handleEditClick} disabled={isGenerating || !editPrompt.trim()} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white rounded-xl font-bold flex items-center gap-2 transition-all">
                        <Sparkles size={18} /> 生成修改
                    </button>
                    <button onClick={() => setIsBrushMode(false)} className="p-3 text-gray-400 hover:text-white bg-gray-700 rounded-xl"><X size={18} /></button>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onGenerate(true)} // True = New Seed
                        disabled={isGenerating}
                        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2 text-sm"
                        title="生成新的随机种子，完全重绘"
                    >
                        <RefreshCw size={16} /> 重绘
                    </button>
                    
                    {/* New Grid Button */}
                    <button
                        onClick={onGenerateGrid}
                        disabled={isGenerating}
                        className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 text-sm shadow-lg ${shot.isGrid ? 'bg-indigo-600 text-white ring-2 ring-indigo-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                        title="生成3x3网格方案供选择"
                    >
                        <Grid3X3 size={16} /> 生成9张方案
                    </button>

                    <button
                        onClick={() => {
                          setShowCameraControl(true);
                          onGenerate(false); // False = Keep Seed
                        }}
                        disabled={isGenerating}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 active:scale-95 text-sm"
                        title="保持当前画面内容，只改变镜头角度"
                    >
                        <Video size={16} /> 按当前镜头重绘
                    </button>
                </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default CanvasEditor;
