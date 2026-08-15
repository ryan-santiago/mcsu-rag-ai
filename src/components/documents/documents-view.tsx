"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Layers,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebounced } from "@/hooks/use-debounced";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { can, type Principal } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { deleteDocument, fetchDocumentChunks, fetchDocuments, replaceDocument } from "@/server/documents/actions";
import { documentsQueryKey } from "@/server/documents/query-key";
import type { DocumentFilters, DocumentListResult, ManagedDocument } from "@/server/documents/types";

const PAGE_SIZE = 20;

type UploadTask = {
  id: string;
  fileName: string;
  sizeBytes: number;
  progress: number;
  xhr: XMLHttpRequest;
};

/**
 * Posts to the upload route via `XMLHttpRequest`, not `fetch` — only `XMLHttpRequest`
 * exposes an `upload.onprogress` event, which is what makes the table's progress
 * circle a real percentage instead of an indeterminate spinner. See the route
 * handler's own comment for why this couldn't be a server action instead.
 */
function uploadWithProgress(file: File, onProgress: (percent: number) => void) {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append("file", file);

  const promise = new Promise<ManagedDocument>((resolve, reject) => {
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as ManagedDocument);
        return;
      }
      try {
        reject(new Error((JSON.parse(xhr.responseText) as { error?: string }).error ?? "Upload failed."));
      } catch {
        reject(new Error("Upload failed."));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed. Check your connection.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

    xhr.open("POST", "/api/documents/upload");
    xhr.send(formData);
  });

  return { xhr, promise };
}

/**
 * Kicks off parsing/chunking/embedding for a document — called right after a
 * successful upload or replace, and again by the "Retry embedding" row
 * action. A plain `fetch`, not `XMLHttpRequest`: this call's own response
 * carries no useful progress, since the embed route runs synchronously and
 * only returns once it's done or failed — the yellow progress ring instead
 * comes from polling `embeddedChunkCount`/`chunkCount` on the document row
 * itself (see the `refetchInterval` below).
 */
async function triggerEmbedding(documentId: string): Promise<void> {
  const response = await fetch(`/api/documents/${documentId}/embed`, { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not start embedding.");
  }
}

function downloadDocument(row: ManagedDocument) {
  const link = document.createElement("a");
  link.href = `/uploads/documents/${row.storedName}`;
  link.download = row.originalName;
  link.click();
}

type DocumentsViewProps = {
  /** The signed-in user, used to gate upload/replace/delete controls. */
  actor: Principal;
  initialFilters: DocumentFilters;
};

export function DocumentsView({ actor, initialFilters }: DocumentsViewProps) {
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState(initialFilters.search ?? "");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounced(search);

  const filters = React.useMemo<DocumentFilters>(
    () => ({ search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, page],
  );

  const filterSignature = debouncedSearch;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<DocumentListResult>({
    queryKey: documentsQueryKey(filters),
    queryFn: () => fetchDocuments(filters),
    placeholderData: (previous) => previous,
    // Polls while anything is mid-embedding, so the yellow progress ring reflects real server-side progress.
    refetchInterval: (query) => {
      const rows = query.state.data?.documents ?? [];
      const active = rows.some((row) => row.embeddingStatus === "pending" || row.embeddingStatus === "processing");
      return active ? 1500 : false;
    },
  });

  const [uploads, setUploads] = React.useState<UploadTask[]>([]);
  const [confirmingDelete, setConfirmingDelete] = React.useState<ManagedDocument | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const replaceInputRef = React.useRef<HTMLInputElement>(null);
  const replaceTargetRef = React.useRef<ManagedDocument | null>(null);

  const mayUpload = can(actor, "documents:write");
  const mayReplace = can(actor, "documents:edit");
  const mayDelete = can(actor, "documents:delete");

  function refreshList() {
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  function startUploads(files: FileList) {
    Array.from(files).forEach((file) => {
      const id = crypto.randomUUID();
      const { xhr, promise } = uploadWithProgress(file, (percent) => {
        setUploads((current) => current.map((task) => (task.id === id ? { ...task, progress: percent } : task)));
      });

      setUploads((current) => [...current, { id, fileName: file.name, sizeBytes: file.size, progress: 0, xhr }]);

      promise
        .then((uploaded) => {
          toast.success(`${file.name} uploaded.`);
          refreshList();
          return triggerEmbedding(uploaded.id).catch((err: Error) => {
            toast.error(`${file.name}: ${err.message}`);
          });
        })
        .catch((err: Error) => {
          if (err.message !== "Upload cancelled.") toast.error(err.message);
        })
        .finally(() => {
          setUploads((current) => current.filter((task) => task.id !== id));
          refreshList();
        });
    });
  }

  const replaceMutation = useMutation({
    mutationFn: async ({ documentId, file }: { documentId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return replaceDocument(documentId, formData);
    },
    onSuccess: (result, variables) => {
      if (result.ok) {
        toast.success(result.message);
        refreshList();
        void triggerEmbedding(variables.documentId)
          .catch((err: Error) => toast.error(err.message))
          .finally(refreshList);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const retryEmbedMutation = useMutation({
    mutationFn: (documentId: string) => triggerEmbedding(documentId),
    onSuccess: refreshList,
    onError: (err: Error) => toast.error(err.message),
    onSettled: refreshList,
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deleteDocument({ documentId }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        refreshList();
        setConfirmingDelete(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search file name"
            aria-label="Search documents"
            className="pl-9"
          />
        </div>

        {mayUpload ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) startUploads(event.target.files);
                event.target.value = "";
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" aria-hidden />
              Upload documents
            </Button>
          </>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Table                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10" aria-label="Expand" />
                <TableHead className="min-w-[260px]">File</TableHead>
                <TableHead className="min-w-[160px]">Uploaded by</TableHead>
                <TableHead className="min-w-[140px]">Uploaded</TableHead>
                <TableHead className="min-w-[140px]">Updated</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {uploads.map((task) => (
                <TableRow key={task.id} className="hover:bg-transparent">
                  <TableCell />
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <CircularProgress value={task.progress} label={`Uploading ${task.fileName}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.fileName}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatBytes(task.sizeBytes)} · Uploading {task.progress}%
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell colSpan={3} />
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Cancel upload of ${task.fileName}`}
                      onClick={() => task.xhr.abort()}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {isPending ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell />
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-7 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-20" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : documents.length === 0 && uploads.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={FileText}
                      title={search ? "No matching documents" : "No documents yet"}
                      description={
                        search
                          ? "Try a different file name."
                          : mayUpload
                            ? "Upload a file to get started."
                            : "Documents appear here once someone uploads one."
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((row) => {
                  const isReplacing = replaceMutation.isPending && replaceMutation.variables?.documentId === row.id;
                  const isDeleting = deleteMutation.isPending && deleteMutation.variables === row.id;
                  const isRetrying = retryEmbedMutation.isPending && retryEmbedMutation.variables === row.id;
                  const rowBusy = isReplacing || isDeleting;
                  const isEmbedding = row.embeddingStatus === "pending" || row.embeddingStatus === "processing";
                  const isEmbedFailed = row.embeddingStatus === "failed";
                  const wasUpdated = new Date(row.updatedAt).getTime() !== new Date(row.createdAt).getTime();
                  const isExpanded = expandedIds.has(row.id);

                  return (
                    <React.Fragment key={row.id}>
                      <TableRow className={cn(isFetching && "opacity-70")}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={isExpanded ? `Collapse ${row.originalName}` : `Expand ${row.originalName}`}
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpanded(row.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4" aria-hidden />
                          ) : (
                            <ChevronRight className="size-4" aria-hidden />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {rowBusy ? (
                            <CircularProgress indeterminate label={isDeleting ? "Deleting" : "Replacing"} />
                          ) : isRetrying || (isEmbedding && row.embeddingStatus === "pending") ? (
                            <CircularProgress indeterminate tone="warning" label="Starting embedding" />
                          ) : isEmbedding ? (
                            <CircularProgress
                              value={row.chunkCount > 0 ? (row.embeddedChunkCount / row.chunkCount) * 100 : 0}
                              indeterminate={row.chunkCount === 0}
                              tone="warning"
                              label={`Embedding ${row.originalName}`}
                            />
                          ) : isEmbedFailed ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="bg-destructive/10 text-destructive flex size-7 shrink-0 items-center justify-center rounded-full">
                                  <AlertTriangle className="size-3.5" aria-hidden />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{row.embeddingError ?? "Embedding failed."}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
                              <FileText className="size-3.5" aria-hidden />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{row.originalName}</p>
                            <p
                              className={cn(
                                "text-xs",
                                isEmbedFailed ? "text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {rowBusy
                                ? isDeleting
                                  ? "Deleting…"
                                  : "Replacing…"
                                : isRetrying
                                  ? "Starting embedding…"
                                  : isEmbedding
                                    ? row.chunkCount > 0
                                      ? `Embedding… ${row.embeddedChunkCount}/${row.chunkCount} chunks`
                                      : "Preparing to embed…"
                                    : isEmbedFailed
                                      ? "Embedding failed — see actions to retry"
                                      : formatBytes(row.sizeBytes)}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-sm">{row.uploadedByName}</TableCell>

                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{formatRelative(row.createdAt)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{formatDateTime(row.createdAt)}</TooltipContent>
                        </Tooltip>
                      </TableCell>

                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {wasUpdated ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>{formatRelative(row.updatedAt)}</span>
                            </TooltipTrigger>
                            <TooltipContent>{formatDateTime(row.updatedAt)}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span>—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <RowActions
                          row={row}
                          permissions={{ mayReplace, mayDelete, mayRetryEmbedding: mayUpload }}
                          busy={rowBusy || isRetrying}
                          onDownload={() => downloadDocument(row)}
                          onReplace={() => {
                            replaceTargetRef.current = row;
                            replaceInputRef.current?.click();
                          }}
                          onDelete={() => setConfirmingDelete(row)}
                          onRetryEmbedding={() => retryEmbedMutation.mutate(row.id)}
                        />
                      </TableCell>
                    </TableRow>

                    {isExpanded ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <DocumentChunksPanel document={row} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const target = replaceTargetRef.current;
          event.target.value = "";
          if (!file || !target) return;
          replaceMutation.mutate({ documentId: target.id, file });
        }}
      />

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Could not load documents."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Pagination                                                         */}
      {/* ------------------------------------------------------------------ */}
      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="document" />

      {/* ------------------------------------------------------------------ */}
      {/* Delete confirmation                                                */}
      {/* ------------------------------------------------------------------ */}
      <AlertDialog open={Boolean(confirmingDelete)} onOpenChange={(open) => !open && setConfirmingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingDelete ? (
                <>
                  <span className="text-foreground font-medium">{confirmingDelete.originalName}</span> will be
                  permanently removed. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingDelete) deleteMutation.mutate(confirmingDelete.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chunks                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The expand row's contents — what to show depends entirely on
 * `embeddingStatus`. Chunks are only fetched once there's something to fetch
 * (`enabled: embeddingStatus === "ready"`), so expanding a not-yet-embedded
 * row never fires a query against an empty table.
 */
function DocumentChunksPanel({ document: row }: { document: ManagedDocument }) {
  const chunksQuery = useQuery({
    queryKey: ["documents", row.id, "chunks"],
    queryFn: () => fetchDocumentChunks(row.id),
    enabled: row.embeddingStatus === "ready",
  });

  if (row.embeddingStatus === "failed") {
    return (
      <div className="flex items-center gap-3 px-6 py-5">
        <span className="bg-destructive/10 text-destructive flex size-8 shrink-0 items-center justify-center rounded-full">
          <AlertTriangle className="size-4" aria-hidden />
        </span>
        <div>
          <p className="text-destructive text-sm font-medium">Embedding failed</p>
          <p className="text-muted-foreground text-sm text-pretty">
            {row.embeddingError ?? "Something went wrong."}
          </p>
        </div>
      </div>
    );
  }

  if (row.embeddingStatus !== "ready") {
    return (
      <div className="flex items-center gap-3 px-6 py-5">
        <CircularProgress
          indeterminate={row.chunkCount === 0}
          value={row.chunkCount > 0 ? (row.embeddedChunkCount / row.chunkCount) * 100 : 0}
          tone="warning"
          size={20}
          strokeWidth={2.5}
          label="Embedding in progress"
        />
        <p className="text-muted-foreground text-sm">
          {row.chunkCount > 0 ? `Embedding… ${row.embeddedChunkCount}/${row.chunkCount} chunks` : "Preparing to embed…"}
        </p>
      </div>
    );
  }

  if (chunksQuery.isPending) {
    return (
      <div className="space-y-2 px-6 py-5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const chunks = chunksQuery.data ?? [];

  if (chunks.length === 0) {
    return (
      <div className="flex items-center gap-3 px-6 py-5">
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
          <Layers className="size-4" aria-hidden />
        </span>
        <p className="text-muted-foreground text-sm">No chunks were produced for this document.</p>
      </div>
    );
  }

  return (
    <div className="max-h-80 space-y-3 overflow-y-auto px-6 py-5">
      {chunks.map((chunk) => (
        <div key={chunk.id} className="bg-card rounded-lg border p-3">
          <p className="text-muted-foreground mb-1 text-xs font-medium">
            Chunk {chunk.chunkIndex + 1} · {chunk.tokenCount} tokens
          </p>
          <p className="text-sm text-pretty whitespace-pre-wrap">{chunk.content}</p>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row actions                                                               */
/* -------------------------------------------------------------------------- */

type RowActionsProps = {
  row: ManagedDocument;
  permissions: { mayReplace: boolean; mayDelete: boolean; mayRetryEmbedding: boolean };
  busy: boolean;
  onDownload: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onRetryEmbedding: () => void;
};

function RowActions({ row, permissions, busy, onDownload, onReplace, onDelete, onRetryEmbedding }: RowActionsProps) {
  const { mayReplace, mayDelete, mayRetryEmbedding } = permissions;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={busy} aria-label={`Actions for ${row.originalName}`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onDownload}>
          <Download className="size-4" aria-hidden />
          Download
        </DropdownMenuItem>

        {row.embeddingStatus === "failed" && mayRetryEmbedding ? (
          <DropdownMenuItem onSelect={onRetryEmbedding}>
            <RefreshCw className="size-4" aria-hidden />
            Retry embedding
          </DropdownMenuItem>
        ) : null}

        {mayReplace ? (
          <DropdownMenuItem onSelect={onReplace}>
            <Upload className="size-4" aria-hidden />
            Replace file
          </DropdownMenuItem>
        ) : null}

        {mayDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4" aria-hidden />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
