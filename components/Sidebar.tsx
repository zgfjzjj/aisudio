
import React from 'react';
import { Shot } from '../types';
import { Plus, Trash2, Image as ImageIcon, Download, LayoutGrid, Camera, CheckCircle2, Clock } from 'lucide-react';

interface SidebarProps {
  shots: Shot[];
  currentShotId: string;
  onSelectShot: (id: string) => void;
  onAddShot: () => void;
  onDeleteShot: (id: string) => void;
  onDownloadAll: () => void;
  onOpenGallery: () => void; 
}

// Logic to extract a meaningful tag from camera params for the list view
const getShotTag = (shot: Shot) => {
    const { distance, elevation } = shot.cameraParams;
    // Combine distance and angle for a compact tag
    if (distance < 0.6) return "特写";
    if (distance > 1.7) return "大远景";
    if (elevation > 60) return "俯视";
    if (elevation < -10) return "仰视";
    return "标准";
}

const Sidebar: React.FC<SidebarProps> = ({
  shots,
  currentShotId,
  onSelectShot,
  onAddShot,
  onDeleteShot,
  onDownloadAll,
  onOpenGallery
}) => {
  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col h-full">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
        <h1 className="font-bold text-lg text-white">镜头列表</h1>
        <div className="flex gap-1">
             <button 
              onClick={onOpenGallery}
              title="打开本地图库 (所有历史图片)"
              className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-600 rounded-md transition-all"
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={onDownloadAll}
              title="打包下载所有镜头"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-all"
            >
              <Download size={18} />
            </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {shots.map((shot) => {
          const tag = getShotTag(shot);
          return (
            <div
                key={shot.id}
                onClick={() => onSelectShot(shot.id)}
                className={`group relative flex items-center p-2 rounded-lg cursor-pointer transition-all border ${
                shot.id === currentShotId 
                    ? 'bg-indigo-900/40 border-indigo-500/50' 
                    : 'bg-gray-700/50 border-transparent hover:bg-gray-700 hover:border-gray-600'
                }`}
            >
                {/* Thumbnail Area */}
                <div className="w-14 h-14 bg-gray-900 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center mr-3 border border-gray-600 relative">
                    {shot.imageUrl ? (
                        <img src={shot.imageUrl} alt={shot.name} className="w-full h-full object-cover" />
                    ) : (
                        <ImageIcon size={20} className="text-gray-600" />
                    )}
                    {/* Corner Tag (Visual hint of shot type) */}
                    <div className="absolute bottom-0 right-0 bg-black/70 text-[8px] text-white px-1 rounded-tl-md backdrop-blur-sm">
                        {tag}
                    </div>
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col justify-center h-full">
                    <div className="flex items-center justify-between">
                        <h3 className={`text-sm font-bold truncate ${shot.id === currentShotId ? 'text-indigo-300' : 'text-gray-300'}`}>
                            {shot.name}
                        </h3>
                        {/* Status Icons */}
                        {shot.isGenerating ? (
                            <Clock size={12} className="text-yellow-500 animate-spin" />
                        ) : shot.imageUrl ? (
                            <CheckCircle2 size={12} className="text-green-500/50" />
                        ) : null}
                    </div>
                    
                    <p className="text-[10px] text-gray-500 truncate mt-1">
                        {shot.script || "暂无脚本..."}
                    </p>
                    
                    {/* Meta Tags Row */}
                    <div className="flex gap-1 mt-1.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono border border-gray-700">
                             {shot.aspectRatio}
                        </span>
                        {/* Visual Dirty Indicator in List */}
                        {shot.isScriptDirty && (
                             <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/30">
                                待润色
                             </span>
                        )}
                    </div>
                </div>

                <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDeleteShot(shot.id);
                }}
                className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 p-1.5 bg-red-500 text-white rounded-full shadow-lg transform scale-75 hover:scale-100 transition-all z-10"
                title="删除镜头"
                >
                <Trash2 size={14} />
                </button>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-gray-700 bg-gray-800/50">
        <button
          onClick={onAddShot}
          className="w-full py-3 px-4 bg-gradient-to-r from-gray-700 to-gray-600 hover:from-indigo-600 hover:to-indigo-500 text-white rounded-xl flex items-center justify-center gap-2 transition-all font-bold shadow-lg"
        >
          <Plus size={18} />
          <span>新建镜头</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
