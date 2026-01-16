
import React, { useState } from 'react';
import { Shot } from '../types';
import { X, Download, Image as ImageIcon } from 'lucide-react';

interface GalleryModalProps {
  shots: Shot[];
  onClose: () => void;
}

const GalleryModal: React.FC<GalleryModalProps> = ({ shots, onClose }) => {
  // Flatten all images from all shots into a single array
  const allImages = shots.flatMap(shot => 
    shot.versions.map((imgUrl, index) => ({
      shotName: shot.name,
      shotId: shot.id,
      url: imgUrl,
      versionIndex: index + 1,
      isCurrent: shot.imageUrl === imgUrl
    }))
  ).reverse(); // Show newest first

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `Gallery_${name}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/50">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
                <ImageIcon size={20} className="text-white" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-white">本地图库 (Local Gallery)</h2>
                <p className="text-xs text-gray-400">已保存 {allImages.length} 张历史创作</p>
            </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full transition-all"
        >
          <X size={24} />
        </button>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {allImages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <ImageIcon size={48} className="mb-4 opacity-20" />
                <p>暂无图片记录</p>
            </div>
        ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {allImages.map((img, idx) => (
                    <div 
                        key={idx} 
                        className="group relative aspect-square bg-gray-800 rounded-xl overflow-hidden border border-gray-800 hover:border-indigo-500 transition-all cursor-pointer"
                        onClick={() => setPreviewImage(img.url)}
                    >
                        <img 
                            src={img.url} 
                            alt={`${img.shotName} V${img.versionIndex}`} 
                            className="w-full h-full object-cover" 
                            loading="lazy"
                        />
                        
                        {/* Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                            <span className="text-xs font-bold text-white truncate">{img.shotName}</span>
                            <span className="text-[10px] text-gray-400">Ver {img.versionIndex}</span>
                        </div>

                        {/* Current Indicator */}
                        {img.isCurrent && (
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-indigo-600/90 text-[9px] font-bold text-white rounded shadow-sm">
                                当前使用
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* Full Screen Preview */}
      {previewImage && (
        <div 
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-8 animate-in zoom-in-95 duration-200"
            onClick={() => setPreviewImage(null)}
        >
            <img 
                src={previewImage} 
                className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl" 
                onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-8 flex gap-4">
                 <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(previewImage, "preview");
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold shadow-lg transition-transform hover:scale-105"
                 >
                    <Download size={18} /> 下载原图
                 </button>
                 <button 
                    onClick={() => setPreviewImage(null)}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full font-bold shadow-lg"
                 >
                    <X size={18} /> 关闭
                 </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default GalleryModal;
