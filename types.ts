
export interface Shot {
  id: string;
  name: string;
  script: string;
  enhancedScript: string;
  aiPromptEn: string;
  aiPromptCn: string;
  aspectRatio: AspectRatioEnum;
  imageUrl?: string; 
  versions: string[]; 
  referenceImages: string[]; 
  isGenerating: boolean;
  cameraParams: CameraParams;
  seed: number; // 用于锁定画面内容
  isGrid?: boolean; // 新增：标记是否为9宫格方案图
  model: string; // 新增：使用的模型版本
  
  // UX State Flags (Visual hints only, non-blocking)
  isScriptDirty?: boolean; // 脚本已修改，建议重新润色
  isEnhancedScriptDirty?: boolean; // 润色结果已修改，建议重新生成Prompt
}

export interface CameraParams {
  azimuth: number;    // 0-360
  elevation: number;  // -30 to 90
  distance: number;   // 0.5 to 2.0
}

export enum AspectRatioEnum {
  RATIO_16_9 = '16:9',
  RATIO_9_16 = '9:16',
  RATIO_1_1 = '1:1',
  RATIO_3_4 = '3:4',
  RATIO_4_3 = '4:3',
}

export interface AspectRatioConfig {
  label: string;
  value: AspectRatioEnum;
  widthClass: string;
  heightClass: string;
}

export interface BrushSettings {
  color: string;
  size: number;
  isEnabled: boolean;
}

export interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}
