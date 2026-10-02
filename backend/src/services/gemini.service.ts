import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

/**
 * Uzbek-first system persona for the "Vicolin" agent. The instruction forces
 * every response to be in natural, fluent Uzbek (Latin script) regardless of
 * the language the user speaks in.
 */
export const VICOLIN_SYSTEM_INSTRUCTION = `Sening isming "Vicolin". Sen samimiy, aqlli va yordamga tayyor real vaqtli ovozli AI yordamchisan.

QAT'IY QOIDALAR:
- Har doim faqat tabiiy va ravon O'zbek tilida (lotin yozuvida) javob ber. Foydalanuvchi boshqa tilda gapirsa ham, javobing O'zbekcha bo'lsin.
- Javoblaring qisqa, jonli va suhbatdosh ohangda bo'lsin, chunki ular ovozga aylantiriladi. Uzun ro'yxatlar va belgilardan (masalan *, #, kod bloklari) qochib, gaplar bilan javob ber.
- O'zbek tilining tabiiy tovushlari (sh, ch, oʻ, gʻ) va apostroflarni to'g'ri ishlat.
- Foydalanuvchiga hurmat bilan, iliq va ijobiy munosabatda bo'l.
- Agar savolga javobni bilmasang, buni ochiq va halol ayt.`;

export type ChatRole = 'user' | 'model';

export interface ChatTurn {
  role: ChatRole;
  text: string;
}

/**
 * Thin wrapper around the Google GenAI SDK used for text generation and audio
 * understanding. Lazily instantiated so a missing API key never crashes boot.
 */
class GeminiService {
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

  get isReady(): boolean {
    return config.hasGeminiKey;
  }

  /**
   * Streams the agent's answer token-by-token. The caller receives each text
   * delta as soon as Gemini produces it so it can be piped into the TTS engine
   * incrementally.
   */
  async *streamReply(
    history: ChatTurn[],
    userText: string,
  ): AsyncGenerator<string, void, unknown> {
    const client = this.getClient();

    const contents = [
      ...history.map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }],
      })),
      { role: 'user' as const, parts: [{ text: userText }] },
    ];

    const stream = await client.models.generateContentStream({
      model: config.textModel,
      contents,
      config: {
        systemInstruction: VICOLIN_SYSTEM_INSTRUCTION,
        temperature: 0.8,
        maxOutputTokens: 1024,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
    }
  }

  /**
   * Transcribes Uzbek speech from a WAV buffer using Gemini's multimodal audio
   * understanding. Returns the recognised text (or an empty string on silence).
   */
  async transcribe(wav: Buffer): Promise<string> {
    const client = this.getClient();

    const response = await client.models.generateContent({
      model: config.sttModel,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Bu O'zbek tilidagi ovozli yozuv. Undagi nutqni aynan O'zbek tilida (lotin yozuvida) matnga aylantir. Faqat aytilgan matnni qaytar, izoh yoki qo'shimcha so'z qo'shma. Agar ovozda hech qanday nutq bo'lmasa, bo'sh javob qaytar.`,
            },
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: wav.toString('base64'),
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0,
      },
    });

    return (response.text ?? '').trim();
  }
}

export const geminiService = new GeminiService();
