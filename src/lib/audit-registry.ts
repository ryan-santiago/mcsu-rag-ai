/**
 * The module and action registries — pure data, no `"server-only"` guard.
 *
 * `src/lib/audit.ts` (server-only: it touches the database) needs this list,
 * and any future client-side Audit Trail UI would too — splitting it out
 * means the client bundle never tries to import a server-only module. There
 * is no Audit Trail screen yet (see docs/ROADMAP.md); `recordAudit()` is
 * already called from `src/lib/auth.ts` (login) and the users/roles actions,
 * so this stays the single source of truth for what a future page would
 * render.
 *
 * Add a module here the moment it starts writing audit entries — no
 * migration required, since `audit_log.module` is plain text, not a DB enum.
 */
export const AUDIT_MODULES = [
  { value: "users", label: "User Management" },
  { value: "auth", label: "Authentication" },
  { value: "roles", label: "Access Control" },
] as const;

export type AuditModule = (typeof AUDIT_MODULES)[number]["value"];

/**
 * The known action vocabulary. Not exhaustive by design — a future module
 * can invent its own action string; this just documents the current ones.
 */
export const AUDIT_ACTIONS = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "reinstated", label: "Reinstated" },
  { value: "role_changed", label: "Role changed" },
  { value: "permissions_changed", label: "Permissions changed" },
  { value: "deleted", label: "Deleted" },
  { value: "login", label: "Signed in" },
] as const;
