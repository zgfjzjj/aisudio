
import { GoogleGenAI, Type } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing from the environment.");
  }
  return new GoogleGenAI({ apiKey });
};

// 辅助函数：本地裁剪图片
// 解决 AI 提取分镜时容易受原图网格影响再次生成网格的问题
const cropImage = (base64: string, index: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 处理可能的跨域问题（如果是 dataURL 其实不需要，但以防万一）
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        // 假设是 3x3 网格
        const cols = 3;
        const rows = 3;
        
        // 计算单个单元格的尺寸
        const cellWidth = img.width / cols;
        const cellHeight = img.height / rows;
        
        // 计算目标单元格的坐标 (index 是 1-9)
        const i = index - 1;
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        const canvas = document.createElement('canvas');
        canvas.width = cellWidth;
        canvas.height = cellHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
           reject(new Error("Could not get canvas context"));
           return;
        }
        
        // 裁剪绘制
        ctx.drawImage(
          img, 
          col * cellWidth, row * cellHeight, cellWidth, cellHeight, // 源区域
          0, 0, cellWidth, cellHeight // 目标区域
        );
        
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(new Error("Failed to load image for cropping"));
    img.src = base64;
  });
};

const handleImageResponse = (response: any) => {
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidates in response");
  }
  
  const candidate = candidates[0];
  
  if (candidate.finishReason === "SAFETY") {
      throw new Error("Image generation blocked by safety filters.");
  }

  if (candidate.content && candidate.content.parts) {
    let textContent = "";
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text) {
          textContent += part.text;
      }
    }
    if (textContent) {
        console.warn("AI returned text:", textContent);
        throw new Error(`AI refused to generate image: ${textContent.slice(0, 50)}...`);
    }
  }
  
  throw new Error("No image data found in response");
};

export const polishScript = async (script: string): Promise<string> => {
  const ai = getAiClient();
  const prompt = `
    你是一位专业的电影分镜脚本师。请将以下简略的分镜描述扩写为一段画面感极强、包含环境细节、光影氛围和人物情绪的专业分镜描述。
    
    原始脚本: ${script}
    
    要求：
    1. 使用中文。
    2. 字数控制在100-200字之间。
    3. 侧重视觉描写。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "";
  } catch (error) {
    console.error("Error polishing script:", error);
    throw error;
  }
};

export const generatePrompts = async (enhancedScript: string): Promise<{ en: string; cn: string }> => {
  const ai = getAiClient();
  const prompt = `
    Based on the following storyboard description, generate a high-quality AI image generation prompt (Stable Diffusion/Midjourney style) in English, and provide a direct Simplified Chinese translation of the prompt.

    Description: ${enhancedScript}

    Return JSON format:
    {
      "en_prompt": "string",
      "cn_explanation": "string"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            en_prompt: { type: Type.STRING },
            cn_explanation: { type: Type.STRING },
          },
          required: ["en_prompt", "cn_explanation"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    
    const result = JSON.parse(jsonText);
    return {
      en: result.en_prompt,
      cn: result.cn_explanation,
    };
  } catch (error) {
    console.error("Error generating prompts:", error);
    throw error;
  }
};

export const generateImage = async (
  prompt: string,
  aspectRatio: string,
  referenceImages: string[],
  seed?: number,
  isGrid: boolean = false
): Promise<string> => {
  const ai = getAiClient();
  const parts: any[] = [];
  
  referenceImages.forEach(base64 => {
    const data = base64.split(',')[1] || base64;
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: data
      }
    });
  });

  let fullPrompt = prompt;
  
  if (isGrid) {
    // 修复 Bug 1: 强化 3x3 网格结构描述，防止生成 4 行
    fullPrompt = `Create a strict 3x3 grid storyboard contact sheet.
    Structure: Exactly 3 rows and 3 columns.
    Content: Exactly 9 distinct panels numbered 1 to 9.
    Prompt: ${prompt}. 
    Constraints: 
    - Do NOT create 4 rows. 
    - Do NOT create 12 panels. 
    - Keep consistent style across all panels. 
    - High quality, 8k.`;
  } else {
    fullPrompt = `${prompt}, cinematic composition, 8k resolution, highly detailed`;
  }

  parts.push({ text: fullPrompt });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', 
      contents: { parts },
      config: {
        seed: seed,
        imageConfig: {
          aspectRatio: aspectRatio as any
        }
      }
    });

    return handleImageResponse(response);
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

export const extractGridPanel = async (
  gridImageBase64: string,
  panelIndex: number,
  originalPrompt: string,
  aspectRatio: string
): Promise<string> => {
  const ai = getAiClient();
  
  try {
    // 修复 Bug 2: 核心修改 - 在本地先裁剪出单张小图，再发给 AI
    // 这样 AI 只能看到单张图，就不可能再画出网格了
    const croppedBase64 = await cropImage(gridImageBase64, panelIndex);
    
    const parts: any[] = [];
    const data = croppedBase64.split(',')[1] || croppedBase64;
    
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: data
      }
    });

    // 提示词改为“高清重绘”，而不是“提取”
    const fullPrompt = `The provided image is a low-resolution storyboard draft.
    Your task is to RE-GENERATE this exact scene in high-resolution (8k, photorealistic).
    
    Scene Description: ${originalPrompt}.
    
    Requirements:
    1. Output strictly ONE SINGLE full-screen image.
    2. Maintain the exact composition, pose, and content of the reference image provided.
    3. Enhance details, lighting, and texture.
    4. Do NOT output a grid or multiple frames.`;

    parts.push({ text: fullPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any
        }
      }
    });

    return handleImageResponse(response);
  } catch (error) {
    console.error("Error extracting grid panel:", error);
    throw error;
  }
};

export const editImage = async (
  baseImage: string,
  prompt: string
): Promise<string> => {
  const ai = getAiClient();
  const parts: any[] = [];
  const data = baseImage.split(',')[1] || baseImage;
  
  parts.push({
    inlineData: {
      mimeType: 'image/png',
      data: data
    }
  });

  parts.push({ text: `Modify this image: ${prompt}. Maintain continuity.` });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
    });

    return handleImageResponse(response);
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};
