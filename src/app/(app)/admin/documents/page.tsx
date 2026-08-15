import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { DocumentsView } from "@/components/documents/documents-view";
import { requirePermission } from "@/lib/session";
import { listDocuments } from "@/server/documents/queries";
import { documentsQueryKey } from "@/server/documents/query-key";
import type { DocumentFilters } from "@/server/documents/types";

export const metadata: Metadata = {
  title: "Documentation",
};

/**
 * Server-renders the first page of results and hands them to TanStack Query
 * via `HydrationBoundary` — same pattern as `admin/users/page.tsx`.
 */
export default async function DocumentsPage() {
  const actor = await requirePermission("documents:read");

  const initialFilters: DocumentFilters = {};

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: documentsQueryKey(initialFilters),
    queryFn: () => listDocuments(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Documentation"
        description="Upload and manage the files ReadTheMemo will eventually search and answer questions from."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <DocumentsView
          actor={{
            id: actor.id,
            status: actor.status,
            roleId: actor.roleId,
            rank: actor.rank,
            permissions: actor.permissions,
          }}
          initialFilters={initialFilters}
        />
      </HydrationBoundary>
    </div>
  );
}
