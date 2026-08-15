import "server-only";

/** Thrown for expected pipeline failures (provider unreachable, bad response) — the message is user-facing. */
export class EmbeddingProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

/**
 * What every embedding backend implements — Ollama today, a hosted API
 * (OpenAI) as the alternative. `getActiveEmbeddingProvider()`
 * (`src/lib/embeddings/index.ts`) is the only place that picks between them;
 * everything downstream (the embed route) just calls `embed()`.
 */
export type EmbeddingProvider = {
  embed(text: string): Promise<number[]>;
};
