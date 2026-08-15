import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Intentionally empty for now — the document library, chat and retrieval
 * metrics land once the RAG pipeline ships (docs/ARCHITECTURE.md,
 * docs/ROADMAP.md). The permission guard and page frame are wired up so
 * adding content is the only work left.
 */
export default async function DashboardPage() {
  const user = await requirePermission("dashboard:read");
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="ReadTheMemo — for when you really, really should have known."
      />

      <EmptyState
        icon={LayoutDashboard}
        title="Your dashboard is being built"
        description="Document uploads, retrieval activity and recent conversations will appear here once the knowledge base ships. Nothing to show yet."
      />
    </div>
  );
}
