import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionState, ServerMessage } from '../types';

interface UseWebSocketOptions {
  url: string;
  onJson: (message: ServerMessage) => void;
  /** Binary frames are always PCM16 audio for playback. */
  onBinary: (data: ArrayBuffer) => void;
  onOpen?: () => void;
}

interface UseWebSocketResult {
  connectionState: ConnectionState;
  sendJson: (payload: object) => void;
  sendBinary: (data: ArrayBuffer) => void;
}

/**
 * Resilient WebSocket wrapper with automatic exponential-backoff reconnect so
 * the agent survives network jitter without losing the UI session.
 */
export function useWebSocket({ url, onJson, onBinary, onOpen }: UseWebSocketOptions): UseWebSocketResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUser = useRef(false);

  // Keep the latest callbacks without forcing reconnects on every render.
  const handlers = useRef({ onJson, onBinary, onOpen });
  handlers.current = { onJson, onBinary, onOpen };

  const connect = useCallback(() => {
    setConnectionState('connecting');
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectRef.current = 0;
      setConnectionState('connected');
      handlers.current.onOpen?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          handlers.current.onJson(JSON.parse(event.data) as ServerMessage);
        } catch {
          /* ignore malformed frames */
        }
      } else if (event.data instanceof ArrayBuffer) {
        handlers.current.onBinary(event.data);
      }
    };

    ws.onclose = () => {
      setConnectionState('disconnected');
      if (closedByUser.current) return;
      // Exponential backoff capped at 5s.
      const delay = Math.min(500 * 2 ** reconnectRef.current, 5000);
      reconnectRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, [url]);

  useEffect(() => {
    closedByUser.current = false;
    connect();
    return () => {
      closedByUser.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendJson = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }, []);

  return { connectionState, sendJson, sendBinary };
}
