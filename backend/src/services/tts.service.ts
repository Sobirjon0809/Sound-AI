import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

/**
 * Uzbek Text-to-Speech engine backed by Gemini's native TTS models.
 *
 * Gemini returns raw 16-bit little-endian PCM at 24 kHz (mono). We expose it as
 * a Buffer so the WebSocket layer can forward it to the browser as a binary
 * frame and the client can queue it for gapless playback.
 */
class TtsService {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!config.hasGeminiKey) {
      throw new Error('GEMINI_API_KEY sozlanmagan.');
    }
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
    return this.client;
  }

  /**
   * Synthesises a single text chunk into PCM audio. A light instruction nudges
   * the model towards clear, natural Uzbek pronunciation of the characters that
   * are frequently mispronounced (sh, ch, oʻ, gʻ).
   */
  async synthesize(text: string, voice = config.ttsVoice): Promise<Buffer> {
    const client = this.getClient();
    const prompt = `Quyidagi matnni tabiiy, aniq va ravon O'zbekcha talaffuz bilan o'qib ber. O'zbek tovushlarini (sh, ch, oʻ, gʻ) to'g'ri talaffuz qil: ${text}`;

    const response = await client.models.generateContent({
      model: config.ttsModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) {
      throw new Error('TTS modelidan audio olinmadi.');
    }
    return Buffer.from(base64, 'base64');
  }
}

export const ttsService = new TtsService();
