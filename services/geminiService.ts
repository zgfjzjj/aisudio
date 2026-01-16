
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { UsageMetadata } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing from the environment.");
  }
  return new GoogleGenAI({ apiKey });
};

// Retry helper (Simpler version for streams to avoid complexity)
const retryStreamConnection = async <T>(
  operation: () => Promise<T>, 
  maxRetries = 3
): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (i < maxRetries - 1) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
};

// Retry helper for non-streaming operations
const retryOperation = async <T>(
  operation: () => Promise<T>, 
  maxRetries = 5, 
  initialDelay = 3000
): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const errBody = error?.error || error; 
      const code = errBody?.code || error?.status;
      const message = errBody?.message || error?.message || "";
      const isRateLimit = code === 429 || (message && message.includes('429'));
      
      if (isRateLimit && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

const emptyUsage: UsageMetadata = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };

const handleImageResponse = (response: any): { base64: string, usage: UsageMetadata } => {
  const candidates = response.candidates;
  const usage = response.usageMetadata || emptyUsage;

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
        return {
          base64: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          usage
        };
      }
      if (part.text) {
          textContent += part.text;
      }
    }
    if (textContent) {
        throw new Error(`AI refused to generate image: ${textContent.slice(0, 50)}...`);
    }
  }
  
  throw new Error("No image data found in response");
};

// STREAMING: Polish Script
export const polishScriptStream = async (
    script: string, 
    onUpdate: (text: string) => void
): Promise<UsageMetadata> => {
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
    const response = await retryStreamConnection(() => ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));

    let fullText = "";
    let finalUsage = emptyUsage;

    for await (const chunk of (response as any)) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onUpdate(fullText); // Push accumulated text
      }
      if (chunk.usageMetadata) {
          finalUsage = chunk.usageMetadata;
      }
    }
    return finalUsage;
  } catch (error) {
    console.error("Error polishing script:", error);
    throw error;
  }
};

// STREAMING: Generate Prompts (Updated for Speed)
// We now use a custom separator '|||' to stream both English and Chinese parts in one go.
export const generatePromptsStream = async (
    enhancedScript: string,
    onUpdate: (en: string, cn: string) => void
): Promise<UsageMetadata> => {
  const ai = getAiClient();
  const prompt = `
    Based on the following storyboard description, generate a high-quality AI image generation prompt (Stable Diffusion/Midjourney style) in English, and provide a direct Simplified Chinese translation of the prompt.

    Description: ${enhancedScript}

    FORMAT REQUIREMENTS:
    1. Output the English Prompt first.
    2. Then output the separator string: "|||"
    3. Then output the Chinese Translation.
    4. Do not output any other text or JSON.

    Example Output:
    Cinematic shot of a hero standing in rain... ||| 电影感镜头，英雄伫立在雨中...
  `;

  try {
    const response = await retryStreamConnection(() => ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));

    let fullText = "";
    let finalUsage = emptyUsage;

    for await (const chunk of (response as any)) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        
        // Simple stream parsing
        const parts = fullText.split('|||');
        const en = parts[0].trim();
        const cn = parts.length > 1 ? parts[1].trim() : "";
        
        onUpdate(en, cn);
      }
      if (chunk.usageMetadata) {
          finalUsage = chunk.usageMetadata;
      }
    }
    return finalUsage;
  } catch (error) {
    console.error("Error generating prompts stream:", error);
    throw error;
  }
};

// STREAMING: Translate
export const translateTextStream = async (
    text: string,
    onUpdate: (text: string) => void
): Promise<UsageMetadata> => {
  const ai = getAiClient();
  const prompt = `Translate the following English AI image prompt into Simplified Chinese. Just provide the direct translation.
  
  English: ${text}
  Chinese:`;

  try {
    const response = await retryStreamConnection(() => ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));

    let fullText = "";
    let finalUsage = emptyUsage;

    for await (const chunk of (response as any)) {
        const t = chunk.text;
        if (t) {
            fullText += t;
            onUpdate(fullText);
        }
        if (chunk.usageMetadata) finalUsage = chunk.usageMetadata;
    }
    return finalUsage;
  } catch (error) {
    console.error("Error translating text:", error);
    throw error;
  }
};

export const generateImage = async (
  prompt: string,
  aspectRatio: string,
  referenceImages: string[],
  seed?: number,
  isGrid: boolean = false,
  model: string = 'gemini-2.5-flash-image'
): Promise<{ base64: string, usage: UsageMetadata }> => {
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
    console.log(`Generating image using model: ${model}`);
    const response = await retryOperation(() => ai.models.generateContent({
      model: model, 
      contents: { parts },
      config: {
        seed: seed,
        imageConfig: {
          aspectRatio: aspectRatio as any
        }
      }
    }));

    return handleImageResponse(response);
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

// ... keep existing cropImage and extractGridPanel helpers ...
const cropImage = (base64: string, index: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const cols = 3;
          const rows = 3;
          const cellWidth = img.width / cols;
          const cellHeight = img.height / rows;
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
          
          ctx.drawImage(
            img, 
            col * cellWidth, row * cellHeight, cellWidth, cellHeight, 
            0, 0, cellWidth, cellHeight 
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
  
export const extractGridPanel = async (
  gridImageBase64: string,
  panelIndex: number,
  originalPrompt: string,
  aspectRatio: string,
  model: string = 'gemini-2.5-flash-image'
): Promise<{ base64: string, usage: UsageMetadata }> => {
  const ai = getAiClient();
  
  try {
    const croppedBase64 = await cropImage(gridImageBase64, panelIndex);
    const parts: any[] = [];
    const data = croppedBase64.split(',')[1] || croppedBase64;
    
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: data
      }
    });

    const fullPrompt = `The provided image is a low-resolution storyboard draft.
    Your task is to RE-GENERATE this exact scene in high-resolution (8k, photorealistic).
    
    Scene Description: ${originalPrompt}.
    
    Requirements:
    1. Output strictly ONE SINGLE full-screen image.
    2. Maintain the exact composition, pose, and content of the reference image provided.
    3. Enhance details, lighting, and texture.
    4. Do NOT output a grid or multiple frames.`;

    parts.push({ text: fullPrompt });

    const response = await retryOperation(() => ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any
        }
      }
    }));

    return handleImageResponse(response);
  } catch (error) {
    console.error("Error extracting grid panel:", error);
    throw error;
  }
};

export const editImage = async (
  baseImage: string,
  prompt: string,
  model: string = 'gemini-2.5-flash-image'
): Promise<{ base64: string, usage: UsageMetadata }> => {
  const ai = getAiClient();
  const parts: any[] = [];
  const data = baseImage.split(',')[1] || baseImage;
  
  parts.push({
    inlineData: {
      mimeType: 'image/png',
      data: data
    }
  });

  // LOGIC FIX: Explicitly instruct AI to use the red strokes as a mask/guide
  parts.push({ 
    text: `The red strokes in the image mark the specific area to edit/inpainting. 
    INSTRUCTION: Replace the content covered by or contained within the red marked area with: "${prompt}".
    CRITICAL: 
    1. The rest of the image (outside the red marks) must remain UNCHANGED.
    2. Remove the red strokes in the final output.
    3. Maintain lighting and style continuity.` 
  });

  try {
    const response = await retryOperation(() => ai.models.generateContent({
      model: model,
      contents: { parts },
    }));

    return handleImageResponse(response);
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};
