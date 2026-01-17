
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ScoreData } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * High-speed image compression for minimal latency
   */
  async compressImage(base64: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${base64}`;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
        }
        // 0.6 quality is optimal for fast OCR/Music Analysis without losing notation details
        resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
      };
    });
  }

  async analyzeScore(imageBase64: string): Promise<ScoreData> {
    const smallImage = await this.compressImage(imageBase64);
    
    // Explicitly instructions for high-speed transcription
    const prompt = `Act as a high-speed music transcription engine. Extract score data into JSON.
    JSON structure: {title, tempo(number), timeSignature, keySignature, measures:[{chords:[], melody:[{pitch, duration, lyrics}]}]}.
    Strict rules: 
    - Standard pitch (e.g., C4, Eb3).
    - duration is decimal beats (1.0 = quarter).
    - Be fast and accurate. No extra text.`;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: smallImage,
              },
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 }, // Minimize inference time
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            tempo: { type: Type.NUMBER },
            timeSignature: { type: Type.STRING },
            keySignature: { type: Type.STRING },
            measures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  chords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  melody: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        pitch: { type: Type.STRING },
                        duration: { type: Type.NUMBER },
                        lyrics: { type: Type.STRING },
                      },
                    },
                  },
                },
              },
            },
          },
          required: ["title", "tempo", "measures"],
        },
      },
    });

    try {
      const text = response.text || '{}';
      return JSON.parse(text) as ScoreData;
    } catch (e) {
      console.error("Gemini Parse Error:", e);
      throw new Error("Analysis timed out or output was malformed. Please try again.");
    }
  }

  async generateVocalAudio(text: string, voiceName: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Vocalize: ${text}` }] }],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("TTS Engine unreachable");
    return base64Audio;
  }
}

export const geminiService = new GeminiService();
