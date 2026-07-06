import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralised, type-safe access to environment configuration.
 * The GEMINI_API_KEY is intentionally optional at boot time so the server can
 * start and report a graceful Uzbek error to clients when it is missing.
 */
export interface AppConfig {
  port: number;
  corsOrigins: string[];
  geminiApiKey: string;
  hasGeminiKey: boolean;
  textModel: string;
  ttsModel: string;
  sttModel: string;
  ttsVoice: string;
  /** Sample rate (Hz) the client captures microphone audio at. */
  inputSampleRate: number;
  /** Sample rate (Hz) Gemini TTS returns PCM audio at. */
  outputSampleRate: number;
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '' || raw.trim() === '*') {
    return ['*'];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 8080),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? '',
  get hasGeminiKey(): boolean {
    return this.geminiApiKey.length > 0;
  },
  textModel: process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-2.5-flash',
  ttsModel: process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-2.5-flash-preview-tts',
  sttModel: process.env.GEMINI_STT_MODEL?.trim() || 'gemini-2.5-flash',
  ttsVoice: process.env.GEMINI_TTS_VOICE?.trim() || 'Kore',
  inputSampleRate: 16000,
  outputSampleRate: 24000,
};
