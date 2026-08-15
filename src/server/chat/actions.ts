"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { chatMessage, chatSession } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { getAiSettingsRow } from "@/lib/ai-settings/store";
import { getActiveChatProvider, type ChatCompletionMessage } from "@/lib/chat-completion";
import {
  buildSystemPrompt,
  moderateOutput,
  stripSourcesWhenUnanswered,
  MODERATION_REFUSAL_MESSAGE,
} from "@/lib/guardrails";
import { checkChatRateLimit } from "@/lib/rate-limit";
import { retrieveRelevantChunks } from "@/lib/retrieval";
import { authorize, AuthorizationError, type CurrentUser } from "@/lib/session";

import { listChatMessages, listChatSessions } from "./queries";
import type { ActionResult, ChatMessage, ChatSessionSummary } from "./types";

const idSchema = z.string().min(1, "A chat must be selected");
const titleSchema = z.string().trim().min(1, "Name is required").max(80, "That name is too long");
const contentSchema = z.string().trim().min(1, "Type a message first").max(4000, "That message is too long");

const DEFAULT_TITLE = "New chat";
const DEFAULT_RETRIEVAL_TOP_K = 5;
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 10;
/** How many prior messages (both roles) to include as conversation context, oldest first. */
const HISTORY_LIMIT = 20;

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[chat] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refreshChatViews() {
  revalidatePath("/chat");
}

/** Loads a session and confirms the actor owns it — every mutation below goes through here. */
async function loadOwnedSession(actor: CurrentUser, sessionId: string) {
  const [target] = await db
    .select()
    .from(chatSession)
    .where(and(eq(chatSession.id, sessionId), eq(chatSession.userId, actor.id)))
    .limit(1);

  if (!target) throw new AuthorizationError("That chat no longer exists.");
  return target;
}

/** First line of the message, trimmed to a title-length snippet — used to auto-title a chat's first message. */
function titleFromContent(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= 60) return firstLine || DEFAULT_TITLE;
  return `${firstLine.slice(0, 60).trimEnd()}…`;
}

/** The last `HISTORY_LIMIT` messages in a session, oldest first, shaped for the chat provider. */
async function loadRecentHistory(sessionId: string): Promise<ChatCompletionMessage[]> {
  const rows = await db
    .select({ role: chatMessage.role, content: chatMessage.content })
    .from(chatMessage)
    .where(eq(chatMessage.sessionId, sessionId))
    .orderBy(desc(chatMessage.createdAt))
    .limit(HISTORY_LIMIT);

  return rows.reverse();
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

/** Server-action entry points for TanStack Query `queryFn`s — `queries.ts` is server-only. */
export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  return listChatSessions();
}

export async function fetchChatMessages(sessionId: string): Promise<ChatMessage[]> {
  return listChatMessages(sessionId);
}

/* -------------------------------------------------------------------------- */
/*  Write                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Sends a message and generates a real, retrieval-augmented reply.
 *
 * `sessionId: null` starts a new chat — created here rather than as a
 * separate step, so clicking "New Chat" never writes an empty, title-less
 * row if the user navigates away without typing anything.
 *
 * Rate-limited before anything is written (see `checkChatRateLimit()`), so a
 * throttled request doesn't leave a dangling user message with no reply. A
 * provider failure (Ollama unreachable, API error) still produces an
 * assistant message — a clear in-thread error rather than a lost toast —
 * so the conversation stays coherent and the user's own message isn't
 * orphaned.
 */
export async function sendChatMessage(input: {
  sessionId: string | null;
  content: string;
}): Promise<ActionResult<{ sessionId: string; userMessage: ChatMessage; assistantMessage: ChatMessage }>> {
  return run(async () => {
    const actor = await authorize("chat:write");
    const content = contentSchema.parse(input.content);

    const settings = await getAiSettingsRow();
    const rateLimit = await checkChatRateLimit(
      actor.id,
      settings?.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    );
    if (!rateLimit.allowed) {
      return { ok: false, error: "You're sending messages too quickly — wait a moment and try again." };
    }

    let sessionId = input.sessionId;

    if (sessionId) {
      await loadOwnedSession(actor, sessionId);
    } else {
      const id = crypto.randomUUID();
      await db.insert(chatSession).values({ id, userId: actor.id, title: titleFromContent(content) });

      await recordAudit({
        module: "chat",
        action: "created",
        entityId: id,
        entityLabel: titleFromContent(content),
        actorId: actor.id,
        actorEmail: actor.email,
      });

      sessionId = id;
    }

    const [userMessage] = await db
      .insert(chatMessage)
      .values({ id: crypto.randomUUID(), sessionId, role: "user", content })
      .returning();

    const replyContent = await generateReply({
      sessionId,
      settings: {
        retrievalTopK: settings?.retrievalTopK ?? DEFAULT_RETRIEVAL_TOP_K,
        temperature: settings?.temperature ?? DEFAULT_TEMPERATURE,
        outputModerationEnabled: settings?.outputModerationEnabled ?? true,
      },
    });

    const [assistantMessage] = await db
      .insert(chatMessage)
      .values({ id: crypto.randomUUID(), sessionId, role: "assistant", content: replyContent })
      .returning();

    await db.update(chatSession).set({ updatedAt: new Date() }).where(eq(chatSession.id, sessionId));

    refreshChatViews();
    return {
      ok: true,
      data: { sessionId, userMessage, assistantMessage },
      message: "Message sent.",
    };
  });
}

/**
 * Retrieval + guardrails + generation — isolated from `sendChatMessage` so a
 * provider failure can be caught here and turned into a plain-text reply
 * (see the function's own callers) rather than aborting the whole action
 * after the user's message has already been saved.
 */
async function generateReply(input: {
  sessionId: string;
  settings: { retrievalTopK: number; temperature: number; outputModerationEnabled: boolean };
}): Promise<string> {
  try {
    const history = await loadRecentHistory(input.sessionId);
    const latestQuestion = history.at(-1)?.content ?? "";

    const chunks = await retrieveRelevantChunks(latestQuestion, input.settings.retrievalTopK);
    const systemPrompt: ChatCompletionMessage = { role: "system", content: buildSystemPrompt(chunks) };

    const { provider } = await getActiveChatProvider();
    const rawReply = await provider.complete([systemPrompt, ...history], { temperature: input.settings.temperature });
    const reply = stripSourcesWhenUnanswered(rawReply);

    if (input.settings.outputModerationEnabled) {
      const moderation = moderateOutput(reply);
      if (!moderation.allowed) return MODERATION_REFUSAL_MESSAGE;
    }

    return reply;
  } catch (error) {
    const message = error instanceof Error ? error.message : "an unknown error";
    console.error("[chat] reply generation failed", error);
    return `Sorry, I couldn't generate a reply: ${message}`;
  }
}

export async function renameChatSession(input: { id: string; title: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("chat:edit");
    const id = idSchema.parse(input.id);
    const title = titleSchema.parse(input.title);

    const target = await loadOwnedSession(actor, id);

    await db.update(chatSession).set({ title }).where(eq(chatSession.id, id));

    await recordAudit({
      module: "chat",
      action: "renamed",
      entityId: id,
      entityLabel: title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ title: target.title }, { title }, { title: "Title" }),
    });

    refreshChatViews();
    return { ok: true, data: undefined, message: "Chat renamed." };
  });
}

export async function deleteChatSession(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("chat:delete");
    const id = idSchema.parse(input.id);

    const target = await loadOwnedSession(actor, id);

    await recordAudit({
      module: "chat",
      action: "deleted",
      entityId: id,
      entityLabel: target.title,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields({ title: target.title }, null, { title: "Title" }),
    });

    await db.delete(chatSession).where(eq(chatSession.id, id));

    refreshChatViews();
    return { ok: true, data: undefined, message: "Chat deleted." };
  });
}
