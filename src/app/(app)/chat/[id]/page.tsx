import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChatPageView } from "@/components/chat/chat-page-view";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getChatSession, listChatMessages } from "@/server/chat/queries";
import { chatMessagesQueryKey } from "@/server/chat/query-key";

export async function generateMetadata({ params }: PageProps<"/chat/[id]">): Promise<Metadata> {
  const { id } = await params;
  const session = await getChatSession(id);
  return { title: session?.title ?? "Chat" };
}

/**
 * A specific conversation. Session navigation lives in the sidebar's Recent
 * Chats list — this page just server-renders the one the URL identifies.
 */
export default async function ChatSessionPage({ params }: PageProps<"/chat/[id]">) {
  const actor = await requirePermission("chat:read");
  const { id } = await params;

  const session = await getChatSession(id);
  if (!session) notFound();

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: chatMessagesQueryKey(id),
    queryFn: () => listChatMessages(id),
  });

  return (
    <div className="mx-auto w-full max-w-7xl">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ChatPageView sessionId={id} canWrite={can(actor, "chat:write")} />
      </HydrationBoundary>
    </div>
  );
}
