
import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY'] });
  }

  async generateAvatar(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `A cute, round, icon-style character sticker of ${prompt}. White background, minimalist, vector art style, vibrant colors.`,
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1',
          outputMimeType: 'image/jpeg'
        }
      });

      const base64Image = response.generatedImages?.[0]?.image?.imageBytes;
      if (base64Image) {
        return `data:image/jpeg;base64,${base64Image}`;
      }
      throw new Error('No image generated');
    } catch (e) {
      console.error('Avatar generation failed', e);
      // Fallback placeholder
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(prompt)}&background=random`;
    }
  }

  async generateCommentary(playerName: string, event: 'move' | 'snake' | 'ladder' | 'win' | 'collision', detail: string): Promise<string> {
    try {
      const model = 'gemini-2.5-flash';
      let prompt = '';
      
      switch (event) {
        case 'snake':
          prompt = `Write a short, funny, 1-sentence tease for ${playerName} who just got swallowed by a snake and fell from square ${detail}.`;
          break;
        case 'ladder':
          prompt = `Write a short, enthusiastic, 1-sentence cheer for ${playerName} who just climbed a ladder to square ${detail}!`;
          break;
        case 'win':
          prompt = `Write a short, epic 1-sentence victory announcement for ${playerName} who won the game!`;
          break;
        case 'collision':
          prompt = `Write a short, chaotic 1-sentence comment about ${playerName} knocking another player back to the start!`;
          break;
        default:
          return '';
      }

      const response = await this.ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            maxOutputTokens: 50,
            thinkingConfig: { thinkingBudget: 0 } // Low latency
        }
      });

      return response.text || '';
    } catch (e) {
      console.error('Commentary generation failed', e);
      return '';
    }
  }
}
