
import { AspectRatioConfig, AspectRatioEnum } from './types';

export const ASPECT_RATIOS: AspectRatioConfig[] = [
  { label: '16:9', value: AspectRatioEnum.RATIO_16_9, widthClass: 'w-full', heightClass: 'aspect-video' },
  { label: '9:16', value: AspectRatioEnum.RATIO_9_16, widthClass: 'h-full', heightClass: 'aspect-[9/16]' },
  { label: '1:1', value: AspectRatioEnum.RATIO_1_1, widthClass: 'w-full', heightClass: 'aspect-square' },
  { label: '4:3', value: AspectRatioEnum.RATIO_4_3, widthClass: 'w-full', heightClass: 'aspect-[4/3]' },
  { label: '3:4', value: AspectRatioEnum.RATIO_3_4, widthClass: 'h-full', heightClass: 'aspect-[3/4]' },
];

export const BRUSH_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308', // Yellow
  '#000000', // Black
  '#ffffff', // White
];

export const PROMPT_KEYWORDS = [
  {
    category: '镜头 (Camera)',
    items: [
      { label: '全景', value: 'Wide shot' },
      { label: '特写', value: 'Close up' },
      { label: '鸟瞰', value: "Bird's eye view" },
      { label: '低角度', value: 'Low angle' },
      { label: '中景', value: 'Medium shot' },
      { label: '主观镜头', value: 'POV' },
    ]
  },
  {
    category: '光影 (Lighting)',
    items: [
      { label: '电影感', value: 'Cinematic lighting' },
      { label: '黄金时刻', value: 'Golden hour' },
      { label: '硬光', value: 'Hard lighting' },
      { label: '霓虹', value: 'Neon lights' },
      { label: '柔光', value: 'Soft diffused light' },
    ]
  },
  {
    category: '风格 (Style)',
    items: [
      { label: '写实', value: 'Photorealistic' },
      { label: '数字艺术', value: 'Digital art' },
      { label: '素描', value: 'Sketch style' },
      { label: '水墨', value: 'Ink wash painting' },
      { label: '赛博朋克', value: 'Cyberpunk' },
      { label: '黑白', value: 'Film noir' },
    ]
  }
];
