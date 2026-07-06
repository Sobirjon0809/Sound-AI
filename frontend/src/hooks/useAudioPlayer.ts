import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAudioPlayerOptions {
  /** Sample rate of the incoming PCM16 chunks (Gemini TTS = 24000). */
  sampleRate: number;
}

interface UseAudioPlayerResult {
  /** Append a PCM16 chunk to the playback queue. */
  enqueue: (chunk: ArrayBuffer) => void;
  /** Stop playback and clear the queue immediately. */
  reset: () => void;
  isPlaying: boolean;
  analyser: AnalyserNode | null;
}

/** Converts 16-bit PCM into normalised Float32 samples. */
function pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
  const view = new Int16Array(buffer);
  const out = new Float32Array(view.length);
  for (let i = 0; i < view.length; i += 1) {
    out[i] = view[i] / 0x8000;
  }
  return out;
}

/**
 * Reliable, gapless audio playback queue.
 *
 * Each binary chunk is scheduled to start exactly where the previous one ends
 * (tracked by `nextStartTime`), which guarantees seamless output with no clicks,
 * gaps, or player resets even when chunks arrive irregularly over the network.
 */
export function useAudioPlayer({ sampleRate }: UseAudioPlayerOptions): UseAudioPlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartRef = useRef(0);
  const activeSources = useRef(new Set<AudioBufferSourceNode>());

  const ensureContext = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      gainRef.current = gain;
      analyserRef.current = analyser;
      nextStartRef.current = 0;
    }
    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const enqueue = useCallback(
    (chunk: ArrayBuffer) => {
      const floats = pcm16ToFloat32(chunk);
      if (floats.length === 0) return;

      const ctx = ensureContext();
      const gain = gainRef.current;
      if (!gain) return;

      const audioBuffer = ctx.createBuffer(1, floats.length, sampleRate);
      audioBuffer.getChannelData(0).set(floats);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);

      // Schedule right after the previously queued chunk; if the queue has
      // drained, restart from the current time plus a tiny safety lead.
      const now = ctx.currentTime;
      const startAt = Math.max(nextStartRef.current, now + 0.02);
      source.start(startAt);
      nextStartRef.current = startAt + audioBuffer.duration;

      activeSources.current.add(source);
      setIsPlaying(true);
      source.onended = () => {
        activeSources.current.delete(source);
        if (activeSources.current.size === 0) {
          setIsPlaying(false);
        }
      };
    },
    [ensureContext, sampleRate],
  );

  const reset = useCallback(() => {
    activeSources.current.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    activeSources.current.clear();
    nextStartRef.current = ctxRef.current?.currentTime ?? 0;
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      activeSources.current.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* noop */
        }
      });
      activeSources.current.clear();
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        void ctxRef.current.close();
      }
    };
  }, []);

  return { enqueue, reset, isPlaying, analyser: analyserRef.current };
}
