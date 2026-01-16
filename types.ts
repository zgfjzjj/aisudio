
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
