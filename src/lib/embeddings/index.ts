import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import { getAiSettingsRow } from "@/lib/ai-settings/store";

import { listOllamaModels, OllamaEmbeddingProvider } from "./ollama";
import { OpenAIEmbeddingProvider } from "./openai";
import { EmbeddingProviderError, type EmbeddingProvider } from "./provider";

export { EmbeddingProviderError, listOllamaModels, OllamaEmbeddingProvider, OpenAIEmbeddingProvider };
export type { EmbeddingProvider };

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "nomic-embed-text";

/**
 * Reads the singleton `aiSettings` row and returns the embedding provider it
 * currently points at. There is no row until an admin saves AI Settings once
 * — this falls back to the same Ollama defaults the schema itself declares,
 * so the pipeline works out of the box against whatever's already running
 * locally rather than requiring a settings visit first.
 */
export async function getActiveEmbeddingProvider(): Promise<{ provider: EmbeddingProvider; label: string }> {
  const row = await getAiSettingsRow();

  if (!row || row.provider === "ollama") {
    const baseUrl = row?.ollamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    const model = row?.ollamaModel ?? DEFAULT_OLLAMA_MODEL;
    return { provider: new OllamaEmbeddingProvider(baseUrl, model), label: `Ollama (${model})` };
  }

  if (row.apiProvider !== "openai" || !row.apiModel || !row.apiKeyCiphertext || !row.apiKeyIv || !row.apiKeyAuthTag) {
    throw new EmbeddingProviderError(
      "The API embedding provider isn't fully configured yet — set it up in AI Settings.",
    );
  }

  const apiKey = decryptSecret({
    ciphertext: row.apiKeyCiphertext,
    iv: row.apiKeyIv,
    authTag: row.apiKeyAuthTag,
  });

  return { provider: new OpenAIEmbeddingProvider(apiKey, row.apiModel), label: `OpenAI (${row.apiModel})` };
}
