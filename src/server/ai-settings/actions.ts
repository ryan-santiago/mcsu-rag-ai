"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/secrets";
import { listOllamaModels } from "@/lib/embeddings";
import { authorize, AuthorizationError } from "@/lib/session";

import { getAiSettings } from "./queries";
import type { ActionResult, SaveChatSettingsInput, SaveEmbeddingSettingsInput } from "./types";

/** Same shape as every other module's `run()` — unhandled failures become a rendered message, not a crash. */
async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[ai-settings] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Server-action entry point for the form's TanStack Query `queryFn`. */
export async function fetchAiSettings() {
  return getAiSettings();
}

/* -------------------------------------------------------------------------- */
/*  Embedding                                                                 */
/* -------------------------------------------------------------------------- */

const saveEmbeddingSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("ollama"),
    ollamaBaseUrl: z.url("Enter a valid URL"),
    ollamaModel: z.string().trim().min(1, "Choose a model"),
  }),
  z.object({
    provider: z.literal("api"),
    apiProvider: z.literal("openai"),
    apiModel: z.string().trim().min(1, "Choose a model"),
    apiKey: z.string().trim().min(1).optional(),
  }),
]);

/**
 * Upserts the singleton settings row's embedding half. Switching provider
 * clears the other provider's fields (no stale API key left behind after
 * moving to Ollama) but never touches the chat/retrieval columns. Saving
 * does **not** re-embed existing documents — see the embedding milestone's
 * plan on why that's a real, separately-flagged gap.
 */
export async function saveEmbeddingSettings(input: SaveEmbeddingSettingsInput): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("ai_settings:edit");
    const parsed = saveEmbeddingSchema.parse(input);
    const before = await getAiSettings();

    const [existing] = await db.select().from(aiSettings).where(eq(aiSettings.id, "default")).limit(1);

    const payload =
      parsed.provider === "ollama"
        ? {
            id: "default" as const,
            provider: "ollama" as const,
            ollamaBaseUrl: parsed.ollamaBaseUrl,
            ollamaModel: parsed.ollamaModel,
            apiProvider: null,
            apiModel: null,
            apiKeyCiphertext: null,
            apiKeyIv: null,
            apiKeyAuthTag: null,
            updatedBy: actor.id,
          }
        : await (async () => {
            if (!parsed.apiKey && !existing?.apiKeyCiphertext) {
              throw new AuthorizationError("Enter an API key.");
            }
            const encrypted = parsed.apiKey ? encryptSecret(parsed.apiKey) : null;

            return {
              id: "default" as const,
              provider: "api" as const,
              apiProvider: parsed.apiProvider,
              apiModel: parsed.apiModel,
              apiKeyCiphertext: encrypted?.ciphertext ?? existing?.apiKeyCiphertext ?? null,
              apiKeyIv: encrypted?.iv ?? existing?.apiKeyIv ?? null,
              apiKeyAuthTag: encrypted?.authTag ?? existing?.apiKeyAuthTag ?? null,
              updatedBy: actor.id,
            };
          })();

    await db.insert(aiSettings).values(payload).onConflictDoUpdate({
      target: aiSettings.id,
      set: payload,
    });

    const after = await getAiSettings();

    await recordAudit({
      module: "ai_settings",
      action: "updated",
      entityId: "default",
      entityLabel: "Embedding settings",
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(before, after, {
        provider: "Provider",
        ollamaBaseUrl: "Ollama base URL",
        ollamaModel: "Ollama model",
        apiProvider: "API provider",
        apiModel: "API model",
        apiKeyConfigured: "API key configured",
      }),
    });

    revalidatePath("/admin/ai-settings");

    return {
      ok: true,
      data: undefined,
      message:
        "Embedding settings saved. Already-embedded documents keep their existing embeddings — re-embed them from Documentation if you want the new provider applied.",
    };
  });
}

/** Populates the model picker for the "Local (Ollama)" branch of either form. */
export async function fetchOllamaModels(baseUrl: string): Promise<ActionResult<string[]>> {
  return run(async () => {
    await authorize("ai_settings:read");
    try {
      const models = await listOllamaModels(baseUrl);
      return { ok: true, data: models, message: "" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not list models." };
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Chat & retrieval                                                          */
/* -------------------------------------------------------------------------- */

const saveChatSchema = z
  .object({
    chatProvider: z.enum(["ollama", "api"]),
    ollamaChatModel: z.string().trim(),
    chatApiProvider: z.enum(["openai", "anthropic"]),
    chatApiModel: z.string().trim(),
    chatApiKey: z.string().trim().optional(),
    retrievalTopK: z.number().int().min(1, "At least 1").max(20, "20 at most"),
    temperature: z.number().min(0, "At least 0").max(1, "1 at most"),
    rateLimitPerMinute: z.number().int().min(1, "At least 1").max(120, "120 at most"),
    outputModerationEnabled: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.chatProvider === "ollama" && !values.ollamaChatModel) {
      ctx.addIssue({ code: "custom", path: ["ollamaChatModel"], message: "Choose a model" });
    }
    if (values.chatProvider === "api" && !values.chatApiModel) {
      ctx.addIssue({ code: "custom", path: ["chatApiModel"], message: "Choose a model" });
    }
  });

/**
 * Upserts the singleton settings row's chat/retrieval/guardrail half — never
 * touches the embedding columns, same partial-upsert shape as
 * `saveEmbeddingSettings`.
 */
export async function saveChatSettings(input: SaveChatSettingsInput): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("ai_settings:edit");
    const parsed = saveChatSchema.parse(input);
    const before = await getAiSettings();

    const [existing] = await db.select().from(aiSettings).where(eq(aiSettings.id, "default")).limit(1);

    let chatApiKeyCiphertext = existing?.chatApiKeyCiphertext ?? null;
    let chatApiKeyIv = existing?.chatApiKeyIv ?? null;
    let chatApiKeyAuthTag = existing?.chatApiKeyAuthTag ?? null;

    if (parsed.chatProvider === "api") {
      if (!parsed.chatApiKey && !existing?.chatApiKeyCiphertext) {
        throw new AuthorizationError("Enter an API key.");
      }
      if (parsed.chatApiKey) {
        const encrypted = encryptSecret(parsed.chatApiKey);
        chatApiKeyCiphertext = encrypted.ciphertext;
        chatApiKeyIv = encrypted.iv;
        chatApiKeyAuthTag = encrypted.authTag;
      }
    } else {
      chatApiKeyCiphertext = null;
      chatApiKeyIv = null;
      chatApiKeyAuthTag = null;
    }

    const payload = {
      id: "default" as const,
      chatProvider: parsed.chatProvider,
      ollamaChatModel: parsed.ollamaChatModel,
      chatApiProvider: parsed.chatProvider === "api" ? parsed.chatApiProvider : null,
      chatApiModel: parsed.chatProvider === "api" ? parsed.chatApiModel : null,
      chatApiKeyCiphertext,
      chatApiKeyIv,
      chatApiKeyAuthTag,
      retrievalTopK: parsed.retrievalTopK,
      temperature: parsed.temperature,
      rateLimitPerMinute: parsed.rateLimitPerMinute,
      outputModerationEnabled: parsed.outputModerationEnabled,
      updatedBy: actor.id,
    };

    await db.insert(aiSettings).values(payload).onConflictDoUpdate({
      target: aiSettings.id,
      set: payload,
    });

    const after = await getAiSettings();

    await recordAudit({
      module: "ai_settings",
      action: "updated",
      entityId: "default",
      entityLabel: "Chat & retrieval settings",
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(before, after, {
        chatProvider: "Chat provider",
        ollamaChatModel: "Ollama chat model",
        chatApiProvider: "Chat API provider",
        chatApiModel: "Chat API model",
        chatApiKeyConfigured: "Chat API key configured",
        retrievalTopK: "Retrieval top-K",
        temperature: "Temperature",
        rateLimitPerMinute: "Rate limit / minute",
        outputModerationEnabled: "Output moderation",
      }),
    });

    revalidatePath("/admin/ai-settings");

    return { ok: true, data: undefined, message: "Chat & retrieval settings saved." };
  });
}
