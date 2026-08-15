import "server-only";

import { cosineDistance, eq } from "drizzle-orm";

import { db } from "@/db";
import { document, documentChunk } from "@/db/schema";
import { EmbeddingProviderError, getActiveEmbeddingProvider } from "@/lib/embeddings";

/** Pinned to `nomic-embed-text`'s output size — same guard the embed route applies before storing a chunk. */
const EMBEDDING_DIMENSIONS = 768;

export type RetrievedChunk = {
  content: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
};

/**
 * Embeds `query` with the currently active embedding provider, then finds
 * the `topK` nearest chunks (cosine distance) among documents that have
 * finished embedding. Every ready document is searchable by every chat
 * user — there is no per-document retrieval scoping, a deliberate choice
 * (see the retrieval milestone's plan).
 */
export async function retrieveRelevantChunks(query: string, topK: number): Promise<RetrievedChunk[]> {
  const { provider, label } = await getActiveEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);

  if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingProviderError(
      `${label} returned a ${queryEmbedding.length}-dimensional embedding, but stored chunks are ` +
        `${EMBEDDING_DIMENSIONS}-dimensional (nomic-embed-text). The active embedding provider must match ` +
        `whatever embedded the documents — check AI Settings.`,
    );
  }

  const rows = await db
    .select({
      content: documentChunk.content,
      chunkIndex: documentChunk.chunkIndex,
      documentId: document.id,
      documentName: document.originalName,
    })
    .from(documentChunk)
    .innerJoin(document, eq(documentChunk.documentId, document.id))
    .where(eq(document.embeddingStatus, "ready"))
    .orderBy(cosineDistance(documentChunk.embedding, queryEmbedding))
    .limit(topK);

  return rows;
}
