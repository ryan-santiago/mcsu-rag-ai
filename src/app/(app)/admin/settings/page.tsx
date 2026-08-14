import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Settings & Profile",
};

/** No `requirePermission()` — every active signed-in user reaches their own profile. */
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader title="Settings & Profile" description="Your account and password." />
      <SettingsView user={user} />
    </div>
  );
}
