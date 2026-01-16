
import { AspectRatioConfig, AspectRatioEnum } from './types';

export const ASPECT_RATIOS: AspectRatioConfig[] = [
  { label: '16:9', value: AspectRatioEnum.RATIO_16_9, widthClass: 'w-full', heightClass: 'aspect-video' },
  { label: '9:16', value: AspectRatioEnum.RATIO_9_16, widthClass: 'h-full', heightClass: 'aspect-[9/16]' },
  { label: '1:1', value: AspectRatioEnum.RATIO_1_1, widthClass: 'w-full', heightClass: 'aspect-square' },
  { label: '4:3', value: AspectRatioEnum.RATIO_4_3, widthClass: 'w-full', heightClass: 'aspect-[4/3]' },
  { label: '3:4', value: AspectRatioEnum.RATIO_3_4, widthClass: 'h-full', heightClass: 'aspect-[3/4]' },
];

export const AI_MODELS = [
  { 
    id: 'flash',
    label: 'Flash 2.5', 
    sub: '快速/省流',
    value: 'gemini-2.5-flash-image', 
    desc: '速度快，Token消耗低，适合快速迭代' 
  },
  { 
    id: 'pro',
    label: 'Pro 3.0', 
    sub: '高清/增强',
    value: 'gemini-3-pro-image-preview', 
    desc: '画质更精细，光影逻辑更强，消耗较高' 
  },
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
    category: '景别 (Shot Size)',
    items: [
      { label: '大远景', value: 'Extreme Long Shot' },
      { label: '全景', value: 'Long Shot' },
      { label: '中景', value: 'Medium Shot' },
      { label: '近景', value: 'Medium Close-up' },
      { label: '特写', value: 'Close-up' },
      { label: '大特写', value: 'Extreme Close-up' },
    ]
  },
  {
    category: '角度 (Angle)',
    items: [
      { label: '平视', value: 'Eye-Level' },
      { label: '低角度', value: 'Low Angle' },
      { label: '高角度', value: 'High Angle' },
      { label: '鸟瞰', value: "Bird's Eye View" },
      { label: '仰视', value: "Worm's Eye View" },
      { label: '主观视角', value: 'POV' },
      { label: '荷兰倾斜', value: 'Dutch Angle' },
    ]
  },
  {
    category: '光影 (Lighting)',
    items: [
      { label: '自然光', value: 'Natural Lighting' },
      { label: '电影感', value: 'Cinematic Lighting' },
      { label: '黄金时刻', value: 'Golden Hour' },
      { label: '伦勃朗光', value: 'Rembrandt Lighting' },
      { label: '侧光', value: 'Side Lighting' },
      { label: '逆光', value: 'Backlighting' },
      { label: '体积光', value: 'Volumetric Lighting' },
      { label: '霓虹', value: 'Neon Lights' },
    ]
  },
  {
    category: '风格 (Style)',
    items: [
      { label: '写实', value: 'Photorealistic' },
      { label: '电影', value: 'Cinematic' },
      { label: '动漫', value: 'Anime Style' },
      { label: '黑白', value: 'Film Noir, Black and White' },
      { label: '赛博朋克', value: 'Cyberpunk' },
      { label: '油画', value: 'Oil Painting' },
      { label: '水墨', value: 'Ink Wash Painting' },
      { label: '极简', value: 'Minimalist' },
    ]
  },
  {
    category: '常用预设 (Presets)',
    items: [
      { label: '大师杰作', value: 'Masterpiece, Best Quality, 8k, Ultra Detailed' },
      { label: '广角宏大', value: 'Wide Angle, Epic Composition, Highly Detailed Environment' },
      { label: '人像写真', value: '85mm lens, f/1.8, bokeh, professional portrait' },
      { label: '虚幻引擎', value: 'Unreal Engine 5 Render' },
    ]
  }
];
