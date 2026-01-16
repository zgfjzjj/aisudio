
import React from 'react';
import { Shot } from '../types';
import { Plus, Trash2, Image as ImageIcon, Download, LayoutGrid } from 'lucide-react';

interface SidebarProps {
  shots: Shot[];
  currentShotId: string;
  onSelectShot: (id: string) => void;
  onAddShot: () => void;
  onDeleteShot: (id: string) => void;
  onDownloadAll: () => void;
  onOpenGallery: () => void; // New prop
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
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
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
        {shots.map((shot) => (
          <div
            key={shot.id}
            onClick={() => onSelectShot(shot.id)}
            className={`group relative flex items-center p-2 rounded-lg cursor-pointer transition-all ${
              shot.id === currentShotId ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <div className="w-12 h-12 bg-gray-900 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center mr-3 border border-gray-600">
              {shot.imageUrl ? (
                <img src={shot.imageUrl} alt={shot.name} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={20} className="text-gray-500" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-white truncate">{shot.name}</h3>
              <p className="text-xs text-gray-400 truncate">
                {shot.script || "暂无脚本..."}
              </p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteShot(shot.id);
              }}
              className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={onAddShot}
          className="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-md flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={16} />
          <span>新建镜头</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
