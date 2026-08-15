import type { DocumentEmbeddingStatus } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/** A document row as rendered by the Documentation table. */
export type ManagedDocument = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string | null;
  uploadedByName: string;
  embeddingStatus: DocumentEmbeddingStatus;
  embeddingError: string | null;
  chunkCount: number;
  embeddedChunkCount: number;
  embeddedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One row of the expanded chunk list — the embedded content itself isn't sent, just what's shown. */
export type DocumentChunkView = {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
};

export type DocumentFilters = {
  search?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type DocumentListResult = {
  documents: ManagedDocument[];
  total: number;
  page: number;
  pageSize: number;
};
