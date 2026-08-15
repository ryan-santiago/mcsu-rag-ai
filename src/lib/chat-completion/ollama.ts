import "server-only";

import { ChatCompletionError, type ChatCompletionMessage, type ChatCompletionProvider } from "./provider";

/** How long Ollama keeps the model loaded after a request — cuts down on the ~30s cold-start reload between chat calls. */
const KEEP_ALIVE = "30m";

export class OllamaChatProvider implements ChatCompletionProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async complete(messages: ChatCompletionMessage[], options: { temperature: number }): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          options: { temperature: options.temperature },
          keep_alive: KEEP_ALIVE,
        }),
      });
    } catch {
      throw new ChatCompletionError(
        `Could not reach Ollama at ${this.baseUrl} — is it running? Check the base URL in AI Settings.`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ChatCompletionError(`Ollama returned an error (${response.status}): ${detail || "no details"}`);
    }

    const data = (await response.json()) as { message?: { content?: string } };
    const content = data.message?.content;

    if (!content) {
      throw new ChatCompletionError(`Ollama returned no reply for model "${this.model}".`);
    }

    return content;
  }
}
