import { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';
import type { ChatMessage } from '../types';
import { UZ } from '../config/uzbek';

interface ChatHistoryProps {
  messages: ChatMessage[];
}

/** Scrollable conversation transcript. Auto-scrolls as new content streams in. */
export function ChatHistory({ messages }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center px-6">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-vicolin-accent/15 text-vicolin-accent">
          <Bot className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold text-slate-100">{UZ.emptyState.title}</h2>
        <p className="mt-1 max-w-xs text-sm text-slate-400">{UZ.emptyState.subtitle}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-2">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <div
            key={message.id}
            className={`flex animate-fade-up items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                isUser ? 'bg-cyan-500/20 text-cyan-300' : 'bg-vicolin-accent/20 text-indigo-300'
              }`}
            >
              {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={`max-w-[75%] ${isUser ? 'text-right' : ''}`}>
              <span className="text-xs text-slate-500">
                {isUser ? UZ.labels.you : UZ.labels.assistant}
              </span>
              <div
                className={`mt-1 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-cyan-500/15 text-cyan-50'
                    : 'bg-vicolin-surface text-slate-100 border border-vicolin-border'
                }`}
              >
                {message.text || '…'}
                {message.streaming && (
                  <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-slate-400 align-middle" />
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
