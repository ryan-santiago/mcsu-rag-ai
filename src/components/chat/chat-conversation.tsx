"use client";

import { Loader2, MessageSquare, SendHorizontal } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/server/chat/types";

type ChatConversationProps = {
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  isSending: boolean;
  canWrite: boolean;
  onSend: (content: string) => void;
};

export function ChatConversation({ messages, isLoadingMessages, isSending, canWrite, onSend }: ChatConversationProps) {
  const [draft, setDraft] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, isSending]);

  function submit() {
    const content = draft.trim();
    if (!content || isSending) return;
    onSend(content);
    setDraft("");
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {isLoadingMessages ? (
          <div className="mx-auto max-w-5xl space-y-4">
            <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Start a new chat"
              description="Ask a question below to begin the conversation."
              className="border-0 bg-transparent"
            />
          </div>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isSending ? <TypingBubble /> : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t p-2 sm:p-3">
        <div className="mx-auto flex max-w-5xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            disabled={!canWrite || isSending}
            placeholder={canWrite ? "Message MINAI…" : "You don't have permission to send messages."}
            className="min-h-11"
            rows={1}
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={!canWrite || isSending || draft.trim().length === 0}
            aria-label="Send message"
          >
            {isSending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
          </Button>
        </div>
        <p className="text-muted-foreground mx-auto mt-2 max-w-5xl text-center text-xs">
          Placeholder chat — replies repeat what you send. Press Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={cn("flex flex-col gap-1", isAssistant ? "items-start" : "items-end")}>
      {isAssistant ? (
        <span className="bg-brand-accent/10 text-brand-accent dark:bg-brand-accent/16 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide uppercase">
          AI
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm text-pretty whitespace-pre-wrap",
          isAssistant ? "bg-muted text-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="bg-brand-accent/10 text-brand-accent dark:bg-brand-accent/16 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide uppercase">
        AI
      </span>
      <div className="bg-muted flex items-center gap-1.5 rounded-2xl px-4 py-3">
        <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
        <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
        <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full" />
      </div>
    </div>
  );
}
