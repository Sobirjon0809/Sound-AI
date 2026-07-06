import type { Server } from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { config } from '../config/env.js';
import { geminiService, type ChatTurn } from '../services/gemini.service.js';
import { ttsService } from '../services/tts.service.js';
import { pcm16ToWav, SentenceChunker } from '../services/audio.util.js';

/** Control messages the browser can send over the socket. */
type ClientMessage =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'text'; text: string };

type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

const MAX_HISTORY_TURNS = 16;
const MAX_AUDIO_BYTES = 16000 * 2 * 60; // ~60s of 16kHz mono PCM safety cap

/** Per-connection conversation + streaming state. */
class VoiceSession {
  private history: ChatTurn[] = [];
  private audioChunks: Buffer[] = [];
  private audioBytes = 0;
  private processing = false;

  constructor(private readonly ws: WebSocket) {}

  private send(payload: object): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private sendAudio(pcm: Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcm, { binary: true });
    }
  }

  private setState(state: AgentState): void {
    this.send({ type: 'status', state });
  }

  private sendError(message: string): void {
    this.send({ type: 'error', message });
    this.setState('idle');
  }

  greet(): void {
    this.send({
      type: 'ready',
      hasKey: geminiService.isReady,
      inputSampleRate: config.inputSampleRate,
      outputSampleRate: config.outputSampleRate,
    });
    this.setState('idle');
  }

  handleBinary(data: Buffer): void {
    if (this.processing) return;
    if (this.audioBytes + data.length > MAX_AUDIO_BYTES) return;
    this.audioChunks.push(data);
    this.audioBytes += data.length;
  }

  async handleMessage(raw: string): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'start':
        this.audioChunks = [];
        this.audioBytes = 0;
        this.setState('listening');
        break;
      case 'stop':
        await this.processSpeech();
        break;
      case 'text':
        await this.processText(message.text);
        break;
      case 'reset':
        this.history = [];
        this.audioChunks = [];
        this.audioBytes = 0;
        this.setState('idle');
        this.send({ type: 'reset_done' });
        break;
      default:
        break;
    }
  }

  /** Transcribe buffered microphone audio, then generate + speak a reply. */
  private async processSpeech(): Promise<void> {
    if (this.processing) return;
    const pcm = Buffer.concat(this.audioChunks);
    this.audioChunks = [];
    this.audioBytes = 0;

    if (pcm.length < config.inputSampleRate) {
      // Less than ~0.5s of audio — treat as an accidental tap.
      this.setState('idle');
      return;
    }

    if (!geminiService.isReady) {
      this.sendError('GEMINI_API_KEY serverda sozlanmagan. Iltimos .env faylini to‘ldiring.');
      return;
    }

    this.processing = true;
    try {
      this.setState('thinking');
      const wav = pcm16ToWav(pcm, config.inputSampleRate);
      const transcript = await geminiService.transcribe(wav);

      if (!transcript) {
        this.send({ type: 'notice', message: 'Kechirasiz, sizni eshitolmadim. Iltimos qaytadan urinib ko‘ring.' });
        this.setState('idle');
        return;
      }

      this.send({ type: 'user_transcript', text: transcript });
      await this.generateAndSpeak(transcript);
    } catch (error) {
      this.sendError(this.describeError(error));
    } finally {
      this.processing = false;
    }
  }

  /** Handle a typed (text) message instead of speech. */
  private async processText(text: string): Promise<void> {
    if (this.processing) return;
    const clean = (text ?? '').trim();
    if (!clean) return;

    if (!geminiService.isReady) {
      this.sendError('GEMINI_API_KEY serverda sozlanmagan. Iltimos .env faylini to‘ldiring.');
      return;
    }

    this.processing = true;
    try {
      this.send({ type: 'user_transcript', text: clean });
      await this.generateAndSpeak(clean);
    } catch (error) {
      this.sendError(this.describeError(error));
    } finally {
      this.processing = false;
    }
  }

  /**
   * Core orchestration: stream Gemini text token-by-token, chunk it into
   * sentences, synthesise each chunk and forward the raw audio immediately so
   * the client starts playing before the full answer is generated.
   */
  private async generateAndSpeak(userText: string): Promise<void> {
    this.setState('thinking');

    const chunker = new SentenceChunker();
    let fullReply = '';
    let spokeSomething = false;

    for await (const token of geminiService.streamReply(this.history, userText)) {
      fullReply += token;
      this.send({ type: 'assistant_delta', text: token });

      for (const sentence of chunker.push(token)) {
        await this.speakChunk(sentence);
        spokeSomething = true;
      }
    }

    const tail = chunker.flush();
    if (tail) {
      await this.speakChunk(tail);
      spokeSomething = true;
    }

    this.send({ type: 'assistant_done', text: fullReply.trim() });

    // Persist the turn and trim history to keep prompts small.
    this.history.push({ role: 'user', text: userText });
    this.history.push({ role: 'model', text: fullReply.trim() });
    if (this.history.length > MAX_HISTORY_TURNS) {
      this.history = this.history.slice(-MAX_HISTORY_TURNS);
    }

    this.send({ type: 'audio_end' });
    this.setState('idle');

    if (!spokeSomething) {
      this.send({ type: 'notice', message: 'Javob ovozga aylantirilmadi.' });
    }
  }

  private async speakChunk(text: string): Promise<void> {
    try {
      this.setState('speaking');
      const pcm = await ttsService.synthesize(text);
      this.sendAudio(pcm);
    } catch (error) {
      // A single failed chunk should not abort the whole turn.
      console.error('TTS chunk error:', error);
    }
  }

  private describeError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    if (/api key|api_key|permission|unauthenticated|401|403/i.test(raw)) {
      return 'Gemini API kaliti noto‘g‘ri yoki ruxsat yo‘q. Iltimos kalitni tekshiring.';
    }
    if (/quota|rate|429|resource has been exhausted/i.test(raw)) {
      return 'Gemini API limiti tugadi. Iltimos birozdan so‘ng qayta urinib ko‘ring.';
    }
    return 'Server bilan aloqada xatolik yuz berdi. Iltimos qayta urinib ko‘ring.';
  }
}

/** Attaches the voice WebSocket server to the shared HTTP server. */
export function attachVoiceSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const session = new VoiceSession(ws);
    session.greet();

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        session.handleBinary(toBuffer(data));
        return;
      }
      void session.handleMessage(toBuffer(data).toString('utf-8'));
    });

    ws.on('error', (err) => console.error('WebSocket error:', err));
  });

  // Drop dead connections so we do not leak sessions.
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}
