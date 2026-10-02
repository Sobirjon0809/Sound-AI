import { useEffect, useRef } from 'react';
import type { AgentState } from '../types';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  active: boolean;
  state: AgentState;
}

const STATE_COLOR: Record<AgentState, string> = {
  idle: '#475569',
  listening: '#22d3ee',
  thinking: '#a855f7',
  speaking: '#6366f1',
};

/**
 * Canvas frequency-bar visualiser. Renders live bars from the supplied
 * AnalyserNode, or a gentle idle waveform when nothing is playing.
 */
export function AudioVisualizer({ analyser, active, state }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const barCount = 32;

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const color = STATE_COLOR[state];
      const barWidth = width / barCount;

      for (let i = 0; i < barCount; i += 1) {
        let amplitude: number;
        if (analyser && data && active) {
          analyser.getByteFrequencyData(data);
          const idx = Math.floor((i / barCount) * data.length);
          amplitude = data[idx] / 255;
        } else {
          // Calm idle shimmer.
          amplitude = 0.08 + 0.05 * Math.sin(Date.now() / 400 + i * 0.5);
        }
        const barHeight = Math.max(3, amplitude * height * 0.9);
        const x = i * barWidth;
        const y = (height - barHeight) / 2;
        ctx.fillStyle = color;
        ctx.globalAlpha = active ? 0.9 : 0.35;
        const radius = Math.min(barWidth / 2 - 1, barHeight / 2);
        roundRect(ctx, x + 1, y, barWidth - 2, barHeight, radius);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, active, state]);

  return <canvas ref={canvasRef} width={480} height={120} className="w-full max-w-md h-24" />;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
