import "server-only";

/** Thrown for expected pipeline failures (provider unreachable, bad response) — the message is user-facing. */
export class ChatCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatCompletionError";
  }
}

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * What every chat backend implements — Ollama, OpenAI, or Anthropic today.
 * `getActiveChatProvider()` (`src/lib/chat-completion/index.ts`) is the only
 * place that picks between them; everything downstream (`sendChatMessage`)
 * just calls `complete()`.
 */
export type ChatCompletionProvider = {
  complete(messages: ChatCompletionMessage[], options: { temperature: number }): Promise<string>;
};
