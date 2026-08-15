import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { document } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE_BYTES, saveDocumentFile } from "@/lib/storage/documents";
import type { ManagedDocument } from "@/server/documents/types";

/**
 * A dedicated route handler, not a server action, so the client can drive
 * the upload through `XMLHttpRequest` and read real `upload.onprogress`
 * events — server actions have no equivalent hook. See `documents-view.tsx`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let actor;
  try {
    actor = await authorize("documents:write");
  } catch (error) {
    const message = error instanceof AuthorizationError ? error.message : "Not authorized.";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return NextResponse.json({ error: "That file is larger than the 25MB limit." }, { status: 413 });
  }

  if (file.type && !(file.type in ALLOWED_DOCUMENT_TYPES)) {
    return NextResponse.json(
      { error: "That file type isn't supported. Try a PDF, Office document, image, or text file." },
      { status: 415 },
    );
  }

  const saved = await saveDocumentFile(file);

  const [row]: ManagedDocument[] = await db
    .insert(document)
    .values({
      id: crypto.randomUUID(),
      originalName: file.name,
      storedName: saved.storedName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: saved.sizeBytes,
      uploadedById: actor.id,
      uploadedByName: actor.name,
    })
    .returning();

  await recordAudit({
    module: "documents",
    action: "uploaded",
    entityId: row.id,
    entityLabel: row.originalName,
    actorId: actor.id,
    actorEmail: actor.email,
    changes: diffFields(null, { name: row.originalName, sizeBytes: row.sizeBytes }, { name: "File", sizeBytes: "Size" }),
  });

  revalidatePath("/admin/documents");

  return NextResponse.json(row satisfies ManagedDocument, { status: 201 });
}
