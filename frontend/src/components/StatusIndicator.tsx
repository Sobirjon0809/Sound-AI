import type { AgentState, ConnectionState } from '../types';
import { UZ } from '../config/uzbek';

interface StatusIndicatorProps {
  state: AgentState;
  connection: ConnectionState;
}

const DOT: Record<AgentState, string> = {
  idle: 'bg-slate-500',
  listening: 'bg-cyan-400 animate-pulse',
  thinking: 'bg-purple-400 animate-pulse',
  speaking: 'bg-indigo-400 animate-pulse',
};

const CONN_COLOR: Record<ConnectionState, string> = {
  connecting: 'text-amber-400',
  connected: 'text-emerald-400',
  disconnected: 'text-rose-400',
};

/** Shows the live agent state and the WebSocket connection health. */
export function StatusIndicator({ state, connection }: StatusIndicatorProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[state]}`} />
        <span className="text-sm font-medium text-slate-200">{UZ.status[state]}</span>
      </div>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${CONN_COLOR[connection]}`}>
        <span className="h-2 w-2 rounded-full bg-current" />
        {UZ.connection[connection]}
      </div>
    </div>
  );
}
