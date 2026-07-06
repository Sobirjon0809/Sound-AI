export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** True while the assistant reply is still streaming in. */
  streaming?: boolean;
}

/** Messages the backend can push over the WebSocket (JSON frames). */
export type ServerMessage =
  | { type: 'ready'; hasKey: boolean; inputSampleRate: number; outputSampleRate: number }
  | { type: 'status'; state: AgentState }
  | { type: 'user_transcript'; text: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_done'; text: string }
  | { type: 'audio_end' }
  | { type: 'notice'; message: string }
  | { type: 'reset_done' }
  | { type: 'error'; message: string };
