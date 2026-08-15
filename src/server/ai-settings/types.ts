import type { EmbeddingProviderKind } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/** Safe to send to the client — never a ciphertext, iv, or auth tag, embedding or chat. */
export type AiSettingsView = {
  provider: EmbeddingProviderKind;
  ollamaBaseUrl: string;
  ollamaModel: string;
  apiProvider: string | null;
  apiModel: string | null;
  apiKeyConfigured: boolean;

  chatProvider: EmbeddingProviderKind;
  ollamaChatModel: string;
  chatApiProvider: string | null;
  chatApiModel: string | null;
  chatApiKeyConfigured: boolean;

  retrievalTopK: number;
  temperature: number;
  rateLimitPerMinute: number;
  outputModerationEnabled: boolean;

  updatedAt: Date | null;
};

export type SaveEmbeddingSettingsInput =
  | { provider: "ollama"; ollamaBaseUrl: string; ollamaModel: string }
  | { provider: "api"; apiProvider: "openai"; apiModel: string; apiKey?: string };

type SharedChatSettings = {
  retrievalTopK: number;
  temperature: number;
  rateLimitPerMinute: number;
  outputModerationEnabled: boolean;
};

export type SaveChatSettingsInput = SharedChatSettings &
  (
    | { chatProvider: "ollama"; ollamaChatModel: string }
    | { chatProvider: "api"; chatApiProvider: "openai" | "anthropic"; chatApiModel: string; chatApiKey?: string }
  );
