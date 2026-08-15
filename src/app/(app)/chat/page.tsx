import type { Metadata } from "next";

import { ChatPageView } from "@/components/chat/chat-page-view";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "New Chat",
};

/** The blank composer — sending a first message here creates a session and moves to `/chat/[id]`. */
export default async function NewChatPage() {
  const actor = await requirePermission("chat:read");

  return (
    <div className="mx-auto w-full max-w-7xl">
      <ChatPageView sessionId={null} canWrite={can(actor, "chat:write")} />
    </div>
  );
}
