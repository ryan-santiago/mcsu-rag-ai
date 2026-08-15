import "server-only";

import { and, count, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { chatMessage, chatSession } from "@/db/schema";

const WINDOW_MS = 60_000;

export type RateLimitResult = { allowed: true } | { allowed: false };

/**
 * Counts a user's own `chatMessage` rows (`role: "user"`) created in the
 * last 60 seconds, across all their sessions, against
 * `aiSettings.rateLimitPerMinute`. A plain SQL count against existing
 * tables — no new infra, no per-instance in-memory state to worry about
 * across serverless invocations.
 */
export async function checkChatRateLimit(userId: string, limitPerMinute: number): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS);

  const [{ value }] = await db
    .select({ value: count() })
    .from(chatMessage)
    .innerJoin(chatSession, eq(chatMessage.sessionId, chatSession.id))
    .where(and(eq(chatSession.userId, userId), eq(chatMessage.role, "user"), gte(chatMessage.createdAt, since)));

  return value >= limitPerMinute ? { allowed: false } : { allowed: true };
}
