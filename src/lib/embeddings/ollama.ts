import "server-only";

import { EmbeddingProviderError, type EmbeddingProvider } from "./provider";

/** How long Ollama keeps the model loaded after a request — cuts down on the ~30s cold-start reload between embed calls. */
const KEEP_ALIVE = "30m";

async function ollamaFetch(baseUrl: string, path: string, body: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EmbeddingProviderError(
      `Could not reach Ollama at ${baseUrl} — is it running? Check the base URL in AI Settings.`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmbeddingProviderError(`Ollama returned an error (${response.status}): ${detail || "no details"}`);
  }

  return response;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await ollamaFetch(this.baseUrl, "/api/embed", {
      model: this.model,
      input: text,
      keep_alive: KEEP_ALIVE,
    });

    const data = (await response.json()) as { embeddings?: number[][] };
    const embedding = data.embeddings?.[0];

    if (!embedding) {
      throw new EmbeddingProviderError(`Ollama returned no embedding for model "${this.model}".`);
    }

    return embedding;
  }
}

/** Populates the model picker in AI Settings — the models actually installed on this Ollama host. */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/tags`);
  } catch {
    throw new EmbeddingProviderError(`Could not reach Ollama at ${baseUrl} — is it running?`);
  }

  if (!response.ok) {
    throw new EmbeddingProviderError(`Ollama returned an error (${response.status}) listing models.`);
  }

  const data = (await response.json()) as { models?: Array<{ name: string }> };
  return (data.models ?? []).map((model) => model.name);
}
