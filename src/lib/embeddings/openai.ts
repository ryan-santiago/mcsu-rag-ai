import "server-only";

import { EmbeddingProviderError, type EmbeddingProvider } from "./provider";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

/** The hosted-API alternative to Ollama — same interface, picked by `getActiveEmbeddingProvider()`. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    let response: Response;
    try {
      response = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: text }),
      });
    } catch {
      throw new EmbeddingProviderError("Could not reach the OpenAI embeddings API. Check your connection.");
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new EmbeddingProviderError("OpenAI rejected the API key — check it in AI Settings.");
      }
      const detail = await response.text().catch(() => "");
      throw new EmbeddingProviderError(`OpenAI returned an error (${response.status}): ${detail || "no details"}`);
    }

    const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
    const embedding = data.data?.[0]?.embedding;

    if (!embedding) {
      throw new EmbeddingProviderError(`OpenAI returned no embedding for model "${this.model}".`);
    }

    return embedding;
  }
}
