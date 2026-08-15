"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { document, documentChunk } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { deleteDocumentFile, saveDocumentFile } from "@/lib/storage/documents";
import { authorize, AuthorizationError } from "@/lib/session";
import { listDocumentChunks, listDocuments } from "@/server/documents/queries";

import type { ActionResult, DocumentChunkView, DocumentFilters, DocumentListResult } from "./types";

const idSchema = z.string().min(1, "A document must be selected");

/** Same shape as `users/actions.ts`'s `run()` — unhandled failures become a rendered message, not a crash. */
async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[documents] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

async function loadDocument(documentId: string) {
  const [row] = await db.select().from(document).where(eq(document.id, documentId)).limit(1);
  if (!row) throw new AuthorizationError("That document no longer exists.");
  return row;
}

function refreshDocumentViews() {
  revalidatePath("/admin/documents");
}

/** Server-action entry point for the table's TanStack Query `queryFn`. */
export async function fetchDocuments(filters: DocumentFilters): Promise<DocumentListResult> {
  return listDocuments(filters);
}

/** Server-action entry point for the expand row's chunk list query. */
export async function fetchDocumentChunks(documentId: string): Promise<DocumentChunkView[]> {
  return listDocumentChunks(documentId);
}

/**
 * Replaces an existing document's bytes in place — the row (and its id) stay
 * the same, `updatedAt` moves. The old file on disk is deleted only after the
 * new one is written successfully, so a failed replace never leaves the
 * document pointing at nothing.
 *
 * The old content's chunks/embeddings no longer describe what's on disk, so
 * they're cleared and `embeddingStatus` resets to `pending` — the client
 * re-triggers embedding right after a successful replace, same as after a
 * fresh upload.
 */
export async function replaceDocument(documentId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("documents:edit");
    const id = idSchema.parse(documentId);
    const target = await loadDocument(id);

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a file to upload." };
    }

    const saved = await saveDocumentFile(file);
    const previousStoredName = target.storedName;

    await db
      .update(document)
      .set({
        originalName: file.name,
        storedName: saved.storedName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: saved.sizeBytes,
        embeddingStatus: "pending",
        embeddingError: null,
        chunkCount: 0,
        embeddedChunkCount: 0,
        embeddedAt: null,
      })
      .where(eq(document.id, id));

    await db.delete(documentChunk).where(eq(documentChunk.documentId, id));
    await deleteDocumentFile(previousStoredName);

    await recordAudit({
      module: "documents",
      action: "replaced",
      entityId: id,
      entityLabel: file.name,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { name: target.originalName, sizeBytes: target.sizeBytes },
        { name: file.name, sizeBytes: saved.sizeBytes },
        { name: "File", sizeBytes: "Size" },
      ),
    });

    refreshDocumentViews();
    return { ok: true, data: undefined, message: `${file.name} replaced the previous file.` };
  });
}

export async function deleteDocument(input: { documentId: string }): Promise<ActionResult> {
  return run(async () => {
    const actor = await authorize("documents:delete");
    const id = idSchema.parse(input.documentId);
    const target = await loadDocument(id);

    // Audit first, same ordering `deleteUser` uses: the row is gone after this either way.
    await recordAudit({
      module: "documents",
      action: "deleted",
      entityId: id,
      entityLabel: target.originalName,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        { name: target.originalName, sizeBytes: target.sizeBytes, uploadedBy: target.uploadedByName },
        null,
        { name: "File", sizeBytes: "Size", uploadedBy: "Uploaded by" },
      ),
    });

    await db.delete(document).where(eq(document.id, id));
    await deleteDocumentFile(target.storedName);

    refreshDocumentViews();
    return { ok: true, data: undefined, message: `${target.originalName} removed.` };
  });
}
