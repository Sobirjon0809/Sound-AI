import { useCallback, useRef, useState } from 'react';

/** Inline AudioWorklet that forwards raw mono PCM frames to the main thread. */
const WORKLET_SOURCE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      // Clone because the underlying buffer is reused by the audio engine.
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

interface UseAudioRecorderOptions {
  sampleRate: number;
  /** Called with each 16-bit little-endian PCM chunk while recording. */
  onChunk: (chunk: ArrayBuffer) => void;
}

interface UseAudioRecorderResult {
  isRecording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** AnalyserNode of the live mic signal, for visualisation. */
  analyser: AnalyserNode | null;
}

/** Converts Float32 [-1,1] samples into 16-bit PCM. */
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

/**
 * Captures microphone audio via the Web Audio API and streams raw 16-bit PCM
 * chunks (mono, at the requested sample rate) through the onChunk callback.
 */
export function useAudioRecorder({ sampleRate, onChunk }: UseAudioRecorderOptions): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const cleanup = useCallback(() => {
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      void ctxRef.current.close();
    }
    nodeRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate });
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const node = new AudioWorkletNode(ctx, 'pcm-processor');
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        onChunkRef.current(floatTo16BitPCM(event.data));
      };
      nodeRef.current = node;

      source.connect(analyser);
      source.connect(node);
      // Worklet must be connected to the graph to run; destination output is silent.
      node.connect(ctx.destination);

      setIsRecording(true);
    } catch (err) {
      cleanup();
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('micDenied');
      } else {
        setError('micUnavailable');
      }
      throw err;
    }
  }, [sampleRate, cleanup]);

  const stop = useCallback(() => {
    setIsRecording(false);
    cleanup();
  }, [cleanup]);

  return { isRecording, error, start, stop, analyser: analyserRef.current };
}
