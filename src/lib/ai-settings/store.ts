import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { aiSettings, type AiSettings } from "@/db/schema";

/**
 * The one low-level place that reads the `aiSettings` singleton row —
 * `src/lib/embeddings/index.ts` and `src/lib/chat-completion/index.ts` both
 * go through this rather than querying `aiSettings` directly, and so does
 * the chat pipeline for its retrieval/guardrail knobs
 * (`src/server/chat/actions.ts`).
 *
 * Deliberately not `authorize()`-gated: this is called from already-authorized
 * pipeline code (an upload's embed trigger, a chat message being sent), not
 * exposed as a queryable action itself. `src/server/ai-settings/queries.ts`
 * is the gated, client-safe view for the admin settings page.
 */
export async function getAiSettingsRow(): Promise<AiSettings | null> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.id, "default")).limit(1);
  return row ?? null;
}
