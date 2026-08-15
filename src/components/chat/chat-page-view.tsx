"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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

  const messagesQuery = useQuery<ChatMessage[]>({
    queryKey: chatMessagesQueryKey(sessionId ?? ""),
    queryFn: () => fetchChatMessages(sessionId as string),
    enabled: sessionId !== null,
  });

  const sendMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (result) => {
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
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const messages = sessionId === null ? [] : (messagesQuery.data ?? []);

  return (
    <div className="bg-card h-[calc(100svh-8rem)] min-h-128 overflow-hidden rounded-xl border">
      <ChatConversation
        messages={messages}
        isLoadingMessages={sessionId !== null && messagesQuery.isPending}
        isSending={sendMutation.isPending}
        canWrite={canWrite}
        onSend={(content) => sendMutation.mutate({ sessionId, content })}
      />
    </div>
  );
}
