import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { chatMessage, chatSession } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { ChatMessage, ChatSessionSummary } from "./types";

/** Every chat is personal — scoped to the signed-in user, never a cross-user read. */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  const actor = await authorize("chat:read");

  return db
    .select({
      id: chatSession.id,
      title: chatSession.title,
      createdAt: chatSession.createdAt,
      updatedAt: chatSession.updatedAt,
    })
    .from(chatSession)
    .where(eq(chatSession.userId, actor.id))
    .orderBy(desc(chatSession.updatedAt));
}

/**
 * Returns `null` for a session that doesn't exist or isn't owned by the
 * caller — the page turns that into a 404. `cache()`-wrapped since the
 * session page calls it once for `generateMetadata` and once for the page
 * body, both in the same request.
 */
export const getChatSession = cache(async (sessionId: string): Promise<ChatSessionSummary | null> => {
  const actor = await authorize("chat:read");

  const [session] = await db
    .select({
      id: chatSession.id,
      title: chatSession.title,
      createdAt: chatSession.createdAt,
      updatedAt: chatSession.updatedAt,
    })
    .from(chatSession)
    .where(and(eq(chatSession.id, sessionId), eq(chatSession.userId, actor.id)))
    .limit(1);

  return session ?? null;
});

/** Returns `[]` for a session that doesn't exist or isn't owned by the caller, rather than throwing. */
export async function listChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const actor = await authorize("chat:read");

  const [owned] = await db
    .select({ id: chatSession.id })
    .from(chatSession)
    .where(and(eq(chatSession.id, sessionId), eq(chatSession.userId, actor.id)))
    .limit(1);

  if (!owned) return [];

  return db
    .select({
      id: chatMessage.id,
      role: chatMessage.role,
      content: chatMessage.content,
      createdAt: chatMessage.createdAt,
    })
    .from(chatMessage)
    .where(eq(chatMessage.sessionId, sessionId))
    .orderBy(asc(chatMessage.createdAt));
}
