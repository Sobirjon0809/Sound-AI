import { Loader2, Mic, Square, Volume2 } from 'lucide-react';
import type { AgentState } from '../types';
import { UZ } from '../config/uzbek';

interface MicButtonProps {
  state: AgentState;
  isRecording: boolean;
  disabled: boolean;
  onToggle: () => void;
}

/** The central press-to-talk control. Its look reflects the agent state. */
export function MicButton({ state, isRecording, disabled, onToggle }: MicButtonProps) {
  const busy = state === 'thinking' || state === 'speaking';

  const ring =
    isRecording
      ? 'bg-cyan-500 shadow-[0_0_40px_rgba(34,211,238,0.5)]'
      : busy
        ? 'bg-vicolin-accent shadow-[0_0_40px_rgba(99,102,241,0.45)]'
        : 'bg-vicolin-accent hover:bg-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.35)]';

  const label = isRecording ? UZ.mic.stop : busy ? UZ.status[state] : UZ.mic.start;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        {isRecording && (
          <span className="absolute h-24 w-24 rounded-full bg-cyan-500/40 animate-pulse-ring" />
        )}
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled || busy}
          aria-label={label}
          className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${ring}`}
        >
          {state === 'thinking' ? (
            <Loader2 className="h-9 w-9 animate-spin" />
          ) : state === 'speaking' ? (
            <Volume2 className="h-9 w-9" />
          ) : isRecording ? (
            <Square className="h-8 w-8 fill-current" />
          ) : (
            <Mic className="h-10 w-10" />
          )}
        </button>
      </div>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  );
}
