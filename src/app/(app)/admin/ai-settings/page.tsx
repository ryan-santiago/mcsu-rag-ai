import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { AiSettingsView } from "@/components/ai-settings/ai-settings-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";
import { getAiSettings } from "@/server/ai-settings/queries";
import { aiSettingsQueryKey } from "@/server/ai-settings/query-key";

export const metadata: Metadata = {
  title: "AI Settings",
};

/**
 * Server-renders the current settings and hands them to TanStack Query via
 * `HydrationBoundary` — same pattern as `admin/users/page.tsx`.
 *
 * Covers embedding provider/model and chat/retrieval/guardrails, one page —
 * see docs/ROADMAP.md.
 */
export default async function AiSettingsPage() {
  const actor = await requirePermission("ai_settings:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: aiSettingsQueryKey(),
    queryFn: () => getAiSettings(),
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="AI Settings"
        description="Choose how ReadTheMemo turns documents into embeddings, and how chat answers questions from them."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <AiSettingsView
          actor={{
            id: actor.id,
            status: actor.status,
            roleId: actor.roleId,
            rank: actor.rank,
            permissions: actor.permissions,
          }}
        />
      </HydrationBoundary>
    </div>
  );
}
