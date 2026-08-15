import "server-only";

import { ChatCompletionError, type ChatCompletionMessage, type ChatCompletionProvider } from "./provider";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIChatProvider implements ChatCompletionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(messages: ChatCompletionMessage[], options: { temperature: number }): Promise<string> {
    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages, temperature: options.temperature }),
      });
    } catch {
      throw new ChatCompletionError("Could not reach the OpenAI chat API. Check your connection.");
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new ChatCompletionError("OpenAI rejected the API key — check it in AI Settings.");
      }
      const detail = await response.text().catch(() => "");
      throw new ChatCompletionError(`OpenAI returned an error (${response.status}): ${detail || "no details"}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new ChatCompletionError(`OpenAI returned no reply for model "${this.model}".`);
    }

    return content;
  }
}
