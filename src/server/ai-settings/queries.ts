import "server-only";

import { getAiSettingsRow } from "@/lib/ai-settings/store";
import { authorize } from "@/lib/session";

import type { AiSettingsView } from "./types";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "nomic-embed-text";
const DEFAULT_OLLAMA_CHAT_MODEL = "llama3.2:1b";
const DEFAULT_RETRIEVAL_TOP_K = 5;
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 10;

/** There is no row until an admin saves once — the view falls back to the same defaults the pipeline itself uses. */
export async function getAiSettings(): Promise<AiSettingsView> {
  await authorize("ai_settings:read");

  const row = await getAiSettingsRow();

  return {
    provider: row?.provider ?? "ollama",
    ollamaBaseUrl: row?.ollamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL,
    ollamaModel: row?.ollamaModel ?? DEFAULT_OLLAMA_MODEL,
    apiProvider: row?.apiProvider ?? null,
    apiModel: row?.apiModel ?? null,
    apiKeyConfigured: Boolean(row?.apiKeyCiphertext),

    chatProvider: row?.chatProvider ?? "ollama",
    ollamaChatModel: row?.ollamaChatModel ?? DEFAULT_OLLAMA_CHAT_MODEL,
    chatApiProvider: row?.chatApiProvider ?? null,
    chatApiModel: row?.chatApiModel ?? null,
    chatApiKeyConfigured: Boolean(row?.chatApiKeyCiphertext),

    retrievalTopK: row?.retrievalTopK ?? DEFAULT_RETRIEVAL_TOP_K,
    temperature: row?.temperature ?? DEFAULT_TEMPERATURE,
    rateLimitPerMinute: row?.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    outputModerationEnabled: row?.outputModerationEnabled ?? true,

    updatedAt: row?.updatedAt ?? null,
  };
}
