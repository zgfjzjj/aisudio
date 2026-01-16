
import React, { useRef, useState, useEffect } from 'react';
import { CameraParams } from '../types';

interface CameraGizmoProps {
  params: CameraParams;
  onChange: (params: CameraParams) => void;
  previewImage?: string;
  promptDescription?: string; // 传入生成的提示词描述
}

const CameraGizmo: React.FC<CameraGizmoProps> = ({ params, onChange, previewImage, promptDescription }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState<'azimuth' | 'elevation' | 'distance' | null>(null);

  // 坐标常量
  const centerX = 150;
  const centerY = 130;
  const groundY = 130;
  const baseRadius = 80;

  // 3D 投影转换
  const radA = (params.azimuth * Math.PI) / 180;
  const radE = (params.elevation * Math.PI) / 180;
  
  // 距离缩放
  const r = baseRadius * params.distance;

  // 椭圆透视比例
  const ellipseYScale = 0.4; 
  
  // 计算相机的 3D 坐标并投影到 2D SVG
  const cx = centerX + r * Math.cos(radE) * Math.sin(radA);
  const cy = groundY - (r * Math.sin(radE)) + (r * Math.cos(radE) * Math.cos(radA) * ellipseYScale * 0.5);

  // 辅助坐标：方位角把手位置 (在地面环上)
  const ax = centerX + baseRadius * Math.sin(radA);
  const ay = groundY + (baseRadius * Math.cos(radA) * ellipseYScale);

  // 处理拖拽逻辑
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !svgRef.current) return;
      
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const dx = x - centerX;
      const dy = y - groundY;

      if (isDragging === 'azimuth') {
        let angle = 90 - Math.atan2(dy / ellipseYScale, dx) * (180 / Math.PI); 
        if (angle < 0) angle += 360;
        angle = (angle + 90) % 360;
        onChange({ ...params, azimuth: Math.round(angle) });
      } else if (isDragging === 'elevation') {
        const deltaY = groundY - y;
        const maxH = baseRadius * 1.5;
        let el = (deltaY / maxH) * 90;
        onChange({ ...params, elevation: Math.max(-30, Math.min(90, Math.round(el))) });
      } else if (isDragging === 'distance') {
        const distFromCenter = Math.sqrt(dx * dx + (dy / ellipseYScale) * (dy / ellipseYScale));
        const newDist = Math.max(0.5, Math.min(2.0, distFromCenter / baseRadius));
        onChange({ ...params, distance: parseFloat(newDist.toFixed(2)) });
      }
    };

    const handleMouseUp = () => setIsDragging(null);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, params, onChange]);

  // 计算视锥体 (Frustum) 的四个角，用于绘制半透明光束
  // 简单模拟：从相机中心(cx,cy) 射向 主体中心(centerX, groundY) 周围
  // 主体宽度的一半
  const subjectW = 20; 
  // 视锥体颜色
  const frustumColor = "rgba(251, 191, 36, 0.15)"; // 黄色半透明

  return (
    <div className="bg-black/90 border border-gray-700 rounded-xl p-4 flex flex-col gap-4 shadow-2xl backdrop-blur-md w-full">
      <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
        <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]"></div> 水平旋转 (Azimuth)</span>
        <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_5px_rgba(236,72,153,0.8)]"></div> 俯仰角度 (Elevation)</span>
        <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]"></div> 视距 (Zoom)</span>
      </div>

      <div className="relative w-full aspect-square bg-[#0f1115] rounded-lg overflow-hidden border border-gray-800 select-none group">
        <svg ref={svgRef} viewBox="0 0 300 260" className="w-full h-full cursor-crosshair">
          <defs>
            <radialGradient id="groundGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
          </defs>

          {/* 地面网格 */}
          <g transform={`translate(${centerX}, ${groundY}) scale(1, ${ellipseYScale})`}>
            <circle r="120" fill="url(#groundGrad)" />
            <circle r="80" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="-120" y1="0" x2="120" y2="0" stroke="#334155" strokeWidth="1" />
            <line x1="0" y1="-120" x2="0" y2="120" stroke="#334155" strokeWidth="1" />
          </g>

          {/* Azimuth Ring (Cyan) */}
          <ellipse 
            cx={centerX} cy={groundY} rx={baseRadius} ry={baseRadius * ellipseYScale}
            fill="none" stroke="#22d3ee" strokeWidth="3" strokeOpacity="0.3"
          />
          <path 
            d={`M ${centerX} ${groundY} L ${ax} ${ay}`} 
            stroke="#22d3ee" strokeWidth="1" opacity="0.3"
          />

          {/* 视锥体 Frustum (View Cone) - 让相机的朝向更直观 */}
          {/* 使用 polygon 绘制一个从相机到主体的三角形光束 */}
          <polygon 
            points={`${cx},${cy} ${centerX - subjectW},${groundY - 15} ${centerX + subjectW},${groundY - 15}`}
            fill={frustumColor}
            stroke="none"
          />
          <polygon 
             points={`${cx},${cy} ${centerX - subjectW},${groundY + 5} ${centerX + subjectW},${groundY + 5}`}
             fill={frustumColor}
             stroke="none"
             opacity="0.5"
          />

          {/* Elevation Arc (Pink) */}
           <path 
            d={`M ${ax} ${ay} A ${baseRadius} ${baseRadius} 0 0 ${params.elevation > 0 ? 0 : 1} ${cx} ${cy}`}
            fill="none" stroke="#ec4899" strokeWidth="2" strokeDasharray="3 3"
            filter="url(#glow)"
            opacity="0.6"
          />

          {/* 中心主体 (简单的 3D 盒子示意) */}
          <g transform={`translate(${centerX}, ${groundY})`}>
             <ellipse cx="0" cy="0" rx="25" ry="10" fill="black" opacity="0.5" />
             {previewImage ? (
                // 稍微做一点透视变换，让图片看起来是立着的
                <g transform={`scale(${Math.max(0.8, 1 - params.elevation/180)})`}>
                   <image href={previewImage} x="-20" y="-35" width="40" height="30" preserveAspectRatio="xMidYMid slice" opacity="0.9" />
                   <rect x="-20" y="-35" width="40" height="30" fill="none" stroke="white" strokeWidth="0.5" opacity="0.5"/>
                </g>
             ) : (
                <path d="M -15 -10 L 15 -10 L 15 10 L -15 10 Z" fill="#4f46e5" stroke="#818cf8" strokeWidth="2" />
             )}
          </g>

          {/* 交互把手 Handles */}

          {/* 1. Azimuth Handle (Cyan Sphere on Ring) */}
          <circle 
            cx={ax} cy={ay} r="6" 
            fill="#22d3ee" stroke="white" strokeWidth="2"
            className="cursor-pointer hover:r-8 transition-all filter drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
            onMouseDown={(e) => { e.stopPropagation(); setIsDragging('azimuth'); }}
          />

          {/* 2. Camera Object / Elevation Handle (Pink/Yellow) */}
          <g 
            transform={`translate(${cx}, ${cy})`} 
            className="cursor-pointer"
            onMouseDown={(e) => { e.stopPropagation(); setIsDragging('elevation'); }}
          >
             {/* 距离控制圈 (Zoom Ring) */}
             <circle 
               cx="0" cy="0" r="16" 
               fill="transparent" stroke="#fbbf24" strokeWidth="2" strokeDasharray="2 2"
               className="hover:stroke-yellow-200 transition-colors"
               onMouseDown={(e) => { e.stopPropagation(); setIsDragging('distance'); }}
             />
             
             {/* 相机本体 */}
             <rect x="-10" y="-7" width="20" height="14" rx="2" fill="#ec4899" stroke="white" strokeWidth="1.5" className="filter drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
             <circle cx="0" cy="0" r="4" fill="#111" stroke="#333" strokeWidth="0.5" /> {/* 镜头 */}
             <path d="M 10 -4 L 14 -6 L 14 6 L 10 4 Z" fill="#ec4899" />
          </g>

          {/* 实时数据标签 */}
          <g transform={`translate(${cx}, ${cy - 25})`}>
            <rect x="-35" y="-12" width="70" height="18" rx="4" fill="rgba(0,0,0,0.8)" stroke="#333" strokeWidth="1" />
            <text x="0" y="0" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="monospace" dy="3">
              {params.elevation}° / {params.distance}x
            </text>
          </g>
        </svg>

        {/* 底部代码条显示 - 优化版：支持换行，显示完整信息，汉化UI */}
        <div className="absolute bottom-4 left-4 right-4 bg-black/80 rounded-lg border border-gray-700 flex flex-col px-3 py-2 gap-1 shadow-lg backdrop-blur-md transition-all">
             <span className="text-gray-500 font-mono text-[10px] whitespace-nowrap flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                当前镜头状态
             </span>
             <span className="text-green-400 font-mono text-sm font-bold leading-snug break-words">
                {promptDescription || "调整镜头以生成..."}
             </span>
        </div>
      </div>

      {/* 辅助滑块 */}
      <div className="grid grid-cols-3 gap-2 px-1">
        <div className="space-y-1">
            <label className="text-[9px] text-cyan-400 font-bold uppercase">水平旋转</label>
            <input 
                type="range" min="0" max="360" value={params.azimuth} 
                onChange={(e) => onChange({ ...params, azimuth: Number(e.target.value) })}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" 
            />
        </div>
        <div className="space-y-1">
            <label className="text-[9px] text-pink-400 font-bold uppercase">垂直角度</label>
            <input 
                type="range" min="-30" max="90" value={params.elevation} 
                onChange={(e) => onChange({ ...params, elevation: Number(e.target.value) })}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500" 
            />
        </div>
        <div className="space-y-1">
            <label className="text-[9px] text-yellow-400 font-bold uppercase">距离缩放</label>
            <input 
                type="range" min="0.5" max="2.0" step="0.1" value={params.distance} 
                onChange={(e) => onChange({ ...params, distance: Number(e.target.value) })}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400" 
            />
        </div>
      </div>
      
      <p className="text-[9px] text-gray-500 text-center italic">
        * 拖动彩色把手可直观调整 3D 镜头参数
      </p>
    </div>
  );
};

export default CameraGizmo;
