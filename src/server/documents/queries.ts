import "server-only";

import { asc, count, desc, eq, ilike, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { document, documentChunk } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { DocumentChunkView, DocumentFilters, DocumentListResult, ManagedDocument } from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function buildWhere(filters: DocumentFilters): SQL | undefined {
  const search = filters.search?.trim();
  if (!search) return undefined;
  return ilike(document.originalName, `%${search}%`);
}

/** Lists documents for the table, newest first. */
export async function listDocuments(filters: DocumentFilters = {}): Promise<DocumentListResult> {
  await authorize("documents:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const where = buildWhere(filters);

  const rows: ManagedDocument[] = await db
    .select()
    .from(document)
    .where(where)
    .orderBy(desc(document.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db.select({ value: count() }).from(document).where(where);

  return { documents: rows, total, page, pageSize };
}

/** The expand row's chunk list — only meaningful once `embeddingStatus` is `"ready"`. */
export async function listDocumentChunks(documentId: string): Promise<DocumentChunkView[]> {
  await authorize("documents:read");

  return db
    .select({
      id: documentChunk.id,
      chunkIndex: documentChunk.chunkIndex,
      content: documentChunk.content,
      tokenCount: documentChunk.tokenCount,
    })
    .from(documentChunk)
    .where(eq(documentChunk.documentId, documentId))
    .orderBy(asc(documentChunk.chunkIndex));
}
