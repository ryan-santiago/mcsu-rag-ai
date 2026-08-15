import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { document, documentChunk } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { chunkText } from "@/lib/chunking";
import { EmbeddingProviderError, getActiveEmbeddingProvider } from "@/lib/embeddings";
import { ParsingError, UnsupportedFileTypeError, extractText } from "@/lib/parsing";
import { authorize, AuthorizationError } from "@/lib/session";
import { readDocumentFile } from "@/lib/storage/documents";

/** Pinned to `nomic-embed-text`'s output size — see `documentChunk.embedding` in the schema. */
const EMBEDDING_DIMENSIONS = 768;

/** Errors with a message safe to show the user as-is, rather than a generic "something went wrong." */
function isUserFacingError(error: unknown): error is UnsupportedFileTypeError | ParsingError | EmbeddingProviderError {
  return (
    error instanceof UnsupportedFileTypeError ||
    error instanceof ParsingError ||
    error instanceof EmbeddingProviderError
  );
}

/**
 * Parses, chunks and embeds a document — synchronous within the request so
 * `document.embeddedChunkCount` can be polled for a real progress percentage
 * (see `documents-view.tsx`). Triggered automatically right after upload, and
 * again by the UI's "Retry embedding" action on a `failed` document.
 */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/documents/[id]/embed">,
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let actor;
  try {
    actor = await authorize("documents:write");
  } catch (error) {
    const message = error instanceof AuthorizationError ? error.message : "Not authorized.";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const [row] = await db.select().from(document).where(eq(document.id, id)).limit(1);
  if (!row) {
    return NextResponse.json({ error: "That document no longer exists." }, { status: 404 });
  }

  try {
    await db
      .update(document)
      .set({ embeddingStatus: "processing", embeddingError: null, embeddedChunkCount: 0 })
      .where(eq(document.id, id));

    const bytes = await readDocumentFile(row.storedName);
    const text = (await extractText(row.mimeType, bytes)).trim();

    if (!text) {
      throw new ParsingError("No extractable text was found in this file.");
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new ParsingError("No extractable text was found in this file.");
    }

    await db.update(document).set({ chunkCount: chunks.length }).where(eq(document.id, id));

    // Clear any chunks left over from a previous attempt so a retry starts clean.
    await db.delete(documentChunk).where(eq(documentChunk.documentId, id));

    const { provider, label } = await getActiveEmbeddingProvider();

    for (const [index, chunk] of chunks.entries()) {
      const embedding = await provider.embed(chunk.content);

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingProviderError(
          `${label} returned a ${embedding.length}-dimensional embedding, but this database is fixed at ` +
            `${EMBEDDING_DIMENSIONS} dimensions (matching nomic-embed-text). Switching to a differently-sized ` +
            `model isn't supported yet — see AI Settings.`,
        );
      }

      await db.insert(documentChunk).values({
        id: crypto.randomUUID(),
        documentId: id,
        chunkIndex: index,
        content: chunk.content,
        embedding,
        tokenCount: chunk.tokenCount,
      });

      await db.update(document).set({ embeddedChunkCount: index + 1 }).where(eq(document.id, id));
    }

    await db
      .update(document)
      .set({ embeddingStatus: "ready", embeddingError: null, embeddedAt: new Date() })
      .where(eq(document.id, id));

    await recordAudit({
      module: "documents",
      action: "embedded",
      entityId: id,
      entityLabel: row.originalName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        null,
        { chunkCount: chunks.length, provider: label },
        { chunkCount: "Chunks", provider: "Provider" },
      ),
    });

    revalidatePath("/admin/documents");

    return NextResponse.json({ ok: true, chunkCount: chunks.length });
  } catch (error) {
    const message = isUserFacingError(error) ? error.message : "Embedding failed unexpectedly. Please try again.";

    if (!isUserFacingError(error)) {
      console.error("[documents] embedding failed", { documentId: id, error });
    }

    await db.delete(documentChunk).where(eq(documentChunk.documentId, id));
    await db
      .update(document)
      .set({ embeddingStatus: "failed", embeddingError: message, embeddedChunkCount: 0 })
      .where(eq(document.id, id));

    await recordAudit({
      module: "documents",
      action: "embedding_failed",
      entityId: id,
      entityLabel: row.originalName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(null, { error: message }, { error: "Error" }),
    });

    revalidatePath("/admin/documents");

    return NextResponse.json({ error: message }, { status: 422 });
  }
}
