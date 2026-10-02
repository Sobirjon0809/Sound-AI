/**
 * Small, dependency-free audio helpers used by the STT/TTS pipeline.
 */

/**
 * Wraps raw 16-bit little-endian PCM mono samples into a minimal WAV container
 * so Gemini's multimodal endpoint can reliably decode the microphone audio.
 */
export function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Incrementally splits a growing text stream into speakable chunks.
 *
 * Gemini streams text token-by-token; feeding every token to the TTS engine is
 * wasteful and produces choppy audio. Instead we buffer tokens and flush a
 * chunk as soon as a sentence boundary (or a long-enough clause) is seen so the
 * TTS request can start while the language model is still generating.
 */
export class SentenceChunker {
  private buffer = '';
  private readonly minChunkLength: number;

  constructor(minChunkLength = 12) {
    this.minChunkLength = minChunkLength;
  }

  /** Adds new text and returns any complete chunks ready for synthesis. */
  push(token: string): string[] {
    this.buffer += token;
    const chunks: string[] = [];

    // Sentence terminators including the Uzbek/Cyrillic set.
    const boundary = /[.!?…\n]+/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = boundary.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length;
      const candidate = this.buffer.slice(lastIndex, end).trim();
      if (candidate.length >= this.minChunkLength) {
        chunks.push(candidate);
        lastIndex = end;
      }
    }

    if (lastIndex > 0) {
      this.buffer = this.buffer.slice(lastIndex);
    }

    return chunks;
  }

  /** Returns whatever text remains after the stream ends. */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = '';
    return remaining.length > 0 ? remaining : null;
  }
}
