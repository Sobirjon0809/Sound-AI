import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Send, Sparkles, Trash2 } from 'lucide-react';
import { UZ } from './config/uzbek';
import type { AgentState, ChatMessage, ServerMessage } from './types';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { AudioVisualizer } from './components/AudioVisualizer';
import { MicButton } from './components/MicButton';
import { ChatHistory } from './components/ChatHistory';
import { StatusIndicator } from './components/StatusIndicator';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8080/ws`;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [textInput, setTextInput] = useState('');

  const streamingIdRef = useRef<string | null>(null);

  const player = useAudioPlayer({ sampleRate: OUTPUT_SAMPLE_RATE });

  const handleJson = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'ready':
          setHasKey(message.hasKey);
          if (!message.hasKey) setBanner(UZ.errors.noKey);
          break;
        case 'status':
          setAgentState(message.state);
          break;
        case 'user_transcript':
          streamingIdRef.current = null;
          setMessages((prev) => [...prev, { id: makeId(), role: 'user', text: message.text }]);
          break;
        case 'assistant_delta':
          setMessages((prev) => {
            if (streamingIdRef.current) {
              return prev.map((m) =>
                m.id === streamingIdRef.current ? { ...m, text: m.text + message.text } : m,
              );
            }
            const id = makeId();
            streamingIdRef.current = id;
            return [...prev, { id, role: 'assistant', text: message.text, streaming: true }];
          });
          break;
        case 'assistant_done':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingIdRef.current
                ? { ...m, text: message.text || m.text, streaming: false }
                : m,
            ),
          );
          streamingIdRef.current = null;
          break;
        case 'notice':
          setBanner(message.message);
          break;
        case 'error':
          setBanner(message.message);
          break;
        case 'reset_done':
          setMessages([]);
          break;
        case 'audio_end':
        default:
          break;
      }
    },
    [],
  );

  const { connectionState, sendJson, sendBinary } = useWebSocket({
    url: WS_URL,
    onJson: handleJson,
    onBinary: player.enqueue,
  });

  const recorder = useAudioRecorder({
    sampleRate: INPUT_SAMPLE_RATE,
    onChunk: sendBinary,
  });

  const handleToggleMic = useCallback(async () => {
    setBanner(null);
    if (recorder.isRecording) {
      recorder.stop();
      sendJson({ type: 'stop' });
      return;
    }
    player.reset();
    sendJson({ type: 'start' });
    try {
      await recorder.start();
      setAgentState('listening');
    } catch {
      setBanner(recorder.error ? UZ.errors[recorder.error as 'micDenied' | 'micUnavailable'] : UZ.errors.generic);
      sendJson({ type: 'stop' });
    }
  }, [recorder, player, sendJson]);

  const handleSendText = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const clean = textInput.trim();
      if (!clean || agentState !== 'idle') return;
      player.reset();
      sendJson({ type: 'text', text: clean });
      setTextInput('');
    },
    [textInput, agentState, player, sendJson],
  );

  const handleClear = useCallback(() => {
    player.reset();
    sendJson({ type: 'reset' });
    setMessages([]);
    setBanner(null);
  }, [player, sendJson]);

  const activeAnalyser = recorder.isRecording ? recorder.analyser : player.analyser;
  const visualizerActive = recorder.isRecording || player.isPlaying;
  const busy = agentState === 'thinking' || agentState === 'speaking';

  const disabledMic = useMemo(
    () => connectionState !== 'connected' || !hasKey,
    [connectionState, hasKey],
  );

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-vicolin-accent to-vicolin-accent2 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{UZ.appName}</h1>
            <p className="text-xs text-slate-400">{UZ.tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1.5 rounded-lg border border-vicolin-border bg-vicolin-surface px-3 py-1.5 text-xs text-slate-300 transition hover:text-white"
          title={UZ.labels.clear}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {UZ.labels.clear}
        </button>
      </header>

      {banner && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col rounded-2xl border border-vicolin-border bg-vicolin-surface/40 p-4">
        <StatusIndicator state={agentState} connection={connectionState} />
        <div className="my-3 min-h-0 flex-1 overflow-hidden rounded-xl bg-vicolin-bg/50 p-2">
          <ChatHistory messages={messages} />
        </div>
        <div className="flex flex-col items-center gap-4 py-2">
          <AudioVisualizer analyser={activeAnalyser} active={visualizerActive} state={agentState} />
          <MicButton
            state={agentState}
            isRecording={recorder.isRecording}
            disabled={disabledMic}
            onToggle={handleToggleMic}
          />
        </div>
      </main>

      <form onSubmit={handleSendText} className="mt-3 flex items-center gap-2">
        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={UZ.labels.typePlaceholder}
          disabled={disabledMic || busy || recorder.isRecording}
          className="flex-1 rounded-xl border border-vicolin-border bg-vicolin-surface px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-vicolin-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabledMic || busy || recorder.isRecording || !textInput.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-vicolin-accent text-white transition hover:bg-indigo-500 disabled:opacity-40"
          aria-label={UZ.labels.send}
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
