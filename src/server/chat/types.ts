import type { ActionResult } from "@/lib/action-result";
import type { ChatMessageRole } from "@/db/schema";

export type { ActionResult };

/** A session row for the chat list — no messages, just enough to render and manage it. */
export type ChatSessionSummary = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
};
