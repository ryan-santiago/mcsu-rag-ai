import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where uploaded files actually live for now — see the "Documentation" note
 * in docs/ARCHITECTURE.md. `public/uploads` is a stand-in for real object
 * storage (Vercel Blob / R2), chosen because there's no repo wired up yet.
 * On Vercel this directory is not writable/persistent across deploys or
 * serverless instances — fine for local/dev use, but the first thing to swap
 * out before this goes anywhere production actually depends on.
 */
const DOCUMENTS_DIR = path.join(process.cwd(), "public", "uploads", "documents");

/** 25MB — generous for the docs/spreadsheets/slides this module expects, not a hard product requirement. */
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

/** Keeps only the file extension from the original name — everything else is a fresh uuid, so path traversal and collisions are both moot. */
function extensionFor(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return ALLOWED_DOCUMENT_TYPES[mimeType] ?? "";
}

export type SavedDocumentFile = {
  storedName: string;
  sizeBytes: number;
};

/** Writes an uploaded file to disk under a fresh uuid-based name and returns what the DB row needs to know. */
export async function saveDocumentFile(file: File): Promise<SavedDocumentFile> {
  await mkdir(DOCUMENTS_DIR, { recursive: true });

  const storedName = `${randomUUID()}${extensionFor(file.name, file.type)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(DOCUMENTS_DIR, storedName), bytes);

  return { storedName, sizeBytes: bytes.byteLength };
}

/** Reads a stored file's bytes back off disk — used by the parsing step of the embedding pipeline. */
export async function readDocumentFile(storedName: string): Promise<Buffer> {
  return readFile(path.join(DOCUMENTS_DIR, storedName));
}

const DELETE_ATTEMPTS = 3;
const DELETE_RETRY_DELAY_MS = 150;

/**
 * Best-effort delete — a missing file on disk (already removed, moved
 * manually) must not block clearing the DB row, so failures are logged, not
 * thrown. Retries a few times first: on Windows, a file that was just
 * written or read (antivirus scanning, an indexer, a just-completed
 * download) can briefly hold a lock that makes a single `unlink` attempt
 * fail with EBUSY/EPERM even though nothing is actually still using it a
 * moment later.
 */
export async function deleteDocumentFile(storedName: string): Promise<void> {
  const filePath = path.join(DOCUMENTS_DIR, storedName);

  for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
    try {
      await unlink(filePath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;

      if (attempt === DELETE_ATTEMPTS) {
        console.error("[documents] failed to delete file from disk", { storedName, error });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, DELETE_RETRY_DELAY_MS * attempt));
    }
  }
}

/** The URL the browser can load the file from directly — `public/` is served as static assets. */
export function publicUrlFor(storedName: string): string {
  return `/uploads/documents/${storedName}`;
}
