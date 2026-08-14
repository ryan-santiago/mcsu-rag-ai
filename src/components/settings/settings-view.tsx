import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { STATUS_LABELS } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/session";

/**
 * There is no Employee record in MINAI (that was mcsu-app's HR module, not
 * ported here — see docs/ROADMAP.md), so unlike mcsu-app's Settings & Profile
 * this has no self-service change-request flow. Just the account's own
 * identity, read-only, plus the password form.
 */
export function SettingsView({ user }: { user: CurrentUser }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your identity in MINAI.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Name</p>
            <p className="text-sm font-medium">{user.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Email</p>
            <p className="text-sm font-medium">{user.email}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Role</p>
            <Badge variant="outline">{user.roleLabel}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Status</p>
            <Badge variant="secondary">{STATUS_LABELS[user.status]}</Badge>
          </div>
        </CardContent>
      </Card>

      <ChangePasswordForm />
    </div>
  );
}
