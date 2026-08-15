"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { ChatConversation } from "@/components/chat/chat-conversation";
import { fetchChatMessages, sendChatMessage } from "@/server/chat/actions";
import { chatMessagesQueryKey, chatSessionsQueryKey } from "@/server/chat/query-key";
import type { ChatMessage } from "@/server/chat/types";

type ChatPageViewProps = {
  /** `null` on `/chat` — no session exists yet, one is created on first send. */
  sessionId: string | null;
  canWrite: boolean;
};

/**
 * The conversation pane — composer plus transcript. Session navigation lives
 * in the sidebar's Recent Chats list (`RecentChatsNav`), not here; this
 * component only ever renders the chat that route already identified.
 */
export function ChatPageView({ sessionId, canWrite }: ChatPageViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Shown immediately on send, before the round trip (rate limit + retrieval + model
  // call) resolves — otherwise the user's own message doesn't appear until the reply
  // does. Local state rather than an optimistic cache write because a brand-new chat
  // (`sessionId === null`) has no query key to write into yet.
  const [pendingMessage, setPendingMessage] = React.useState<string | null>(null);

  const messagesQuery = useQuery<ChatMessage[]>({
    queryKey: chatMessagesQueryKey(sessionId ?? ""),
    queryFn: () => fetchChatMessages(sessionId as string),
    enabled: sessionId !== null,
  });

  const sendMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (result) => {
      setPendingMessage(null);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const { sessionId: resolvedId, userMessage, assistantMessage } = result.data;
      queryClient.setQueryData<ChatMessage[]>(chatMessagesQueryKey(resolvedId), (previous) => [
        ...(previous ?? []),
        userMessage,
        assistantMessage,
      ]);
      void queryClient.invalidateQueries({ queryKey: chatSessionsQueryKey() });

      // A message sent from the "New Chat" screen just created a session —
      // move to its dedicated URL so a reload (or the sidebar) lands here.
      if (sessionId === null) router.push(`/chat/${resolvedId}`);
    },
    onError: () => {
      setPendingMessage(null);
      toast.error("Something went wrong. Please try again.");
    },
  });

  function handleSend(content: string) {
    setPendingMessage(content);
    sendMutation.mutate({ sessionId, content });
  }

  const baseMessages = sessionId === null ? [] : (messagesQuery.data ?? []);
  const messages =
    pendingMessage === null
      ? baseMessages
      : [...baseMessages, { id: "pending", role: "user" as const, content: pendingMessage, createdAt: new Date() }];

  return (
    <div className="bg-card h-[calc(100svh-8rem)] min-h-128 overflow-hidden rounded-xl border">
      <ChatConversation
        messages={messages}
        isLoadingMessages={sessionId !== null && messagesQuery.isPending}
        isSending={sendMutation.isPending}
        canWrite={canWrite}
        onSend={handleSend}
      />
    </div>
  );
}
