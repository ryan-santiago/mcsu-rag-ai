import "server-only";

import { ChatCompletionError, type ChatCompletionMessage, type ChatCompletionProvider } from "./provider";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;

/**
 * Anthropic's `/v1/messages` genuinely differs from OpenAI/Ollama's shape:
 * the system prompt is a top-level `system` field, not a `"system"`-role
 * message, and auth is `x-api-key`, not `Authorization: Bearer`. Both are
 * absorbed here so `sendChatMessage` never has to know which provider it's
 * talking to.
 */
export class AnthropicChatProvider implements ChatCompletionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(messages: ChatCompletionMessage[], options: { temperature: number }): Promise<string> {
    const systemPrompt = messages.find((message) => message.role === "system")?.content;
    const conversation = messages
      .filter((message): message is ChatCompletionMessage & { role: "user" | "assistant" } => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          system: systemPrompt,
          messages: conversation,
          max_tokens: MAX_TOKENS,
          temperature: options.temperature,
        }),
      });
    } catch {
      throw new ChatCompletionError("Could not reach the Anthropic API. Check your connection.");
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new ChatCompletionError("Anthropic rejected the API key — check it in AI Settings.");
      }
      const detail = await response.text().catch(() => "");
      throw new ChatCompletionError(`Anthropic returned an error (${response.status}): ${detail || "no details"}`);
    }

    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    if (!text) {
      throw new ChatCompletionError(`Anthropic returned no reply for model "${this.model}".`);
    }

    return text;
  }
}
