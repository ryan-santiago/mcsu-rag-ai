import "server-only";

import { getAiSettingsRow } from "@/lib/ai-settings/store";
import { decryptSecret } from "@/lib/crypto/secrets";

import { AnthropicChatProvider } from "./anthropic";
import { OllamaChatProvider } from "./ollama";
import { OpenAIChatProvider } from "./openai";
import { ChatCompletionError, type ChatCompletionProvider } from "./provider";

export { AnthropicChatProvider, ChatCompletionError, OllamaChatProvider, OpenAIChatProvider };
export type { ChatCompletionMessage, ChatCompletionProvider } from "./provider";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_CHAT_MODEL = "llama3.2:1b";

/**
 * Reads the singleton `aiSettings` row and returns the chat provider it
 * currently points at — same fallback-to-defaults reasoning as
 * `getActiveEmbeddingProvider()` in `src/lib/embeddings/index.ts`.
 */
export async function getActiveChatProvider(): Promise<{ provider: ChatCompletionProvider; label: string }> {
  const row = await getAiSettingsRow();

  if (!row || row.chatProvider === "ollama") {
    const baseUrl = row?.ollamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    const model = row?.ollamaChatModel ?? DEFAULT_OLLAMA_CHAT_MODEL;
    return { provider: new OllamaChatProvider(baseUrl, model), label: `Ollama (${model})` };
  }

  if (
    !row.chatApiProvider ||
    !row.chatApiModel ||
    !row.chatApiKeyCiphertext ||
    !row.chatApiKeyIv ||
    !row.chatApiKeyAuthTag
  ) {
    throw new ChatCompletionError("The API chat provider isn't fully configured yet — set it up in AI Settings.");
  }

  const apiKey = decryptSecret({
    ciphertext: row.chatApiKeyCiphertext,
    iv: row.chatApiKeyIv,
    authTag: row.chatApiKeyAuthTag,
  });

  if (row.chatApiProvider === "anthropic") {
    return {
      provider: new AnthropicChatProvider(apiKey, row.chatApiModel),
      label: `Anthropic (${row.chatApiModel})`,
    };
  }

  if (row.chatApiProvider === "openai") {
    return { provider: new OpenAIChatProvider(apiKey, row.chatApiModel), label: `OpenAI (${row.chatApiModel})` };
  }

  throw new ChatCompletionError(`Unsupported chat API provider "${row.chatApiProvider}".`);
}
