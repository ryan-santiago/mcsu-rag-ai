# RBAC — Roles, Permissions and Guards

Everything about access control lives in `src/lib/rbac.ts`, `src/lib/session.ts`
and `src/server/roles/`. This document explains the model and how to extend
it. It's unchanged from mcsu-app's own RBAC.md except for the permission
list, which is much shorter here — no Employees/Projects/Maintenance/Audit
Trail modules exist in MINAI yet.

---

## The model

Three orthogonal pieces:

1. **Status** — can this account be used at all? (`pending` / `active` / `suspended`)
2. **Role** — a row in the `role` table, admin-editable through Access Control
   (`/admin/access-control`), not a fixed enum.
3. **Permission** — what specific capability is being requested? Named
   `module:action` (e.g. `users:edit`), and *always* one of the fixed
   `PERMISSIONS` in `src/lib/rbac.ts` — modules and actions are code-defined,
   only which roles hold which permission is admin-editable.

Status gates everything. **Only `active` users hold any permission at all**, so
a suspended administrator is exactly as powerless as a pending registrant.
Revoking access is a single status flip.

---

## Roles are data, not code

Roles live in the `role` table (`src/db/schema.ts`): `id` (a slug, e.g.
`"admin"`), `label`, `description`, `rank`, `isSystem`, and `permissions`
(`Permission[]`, stored as `jsonb`). `user.roleId` is a foreign key to it
(`onDelete: "restrict"` — a role in use can't be deleted).

An administrator manages every role's permissions from **Access Control**
(`/admin/access-control`, gated on `access_control:*`) — the Read/Write/Edit/
Delete/All matrix per module. No deploy required to change what a role can do.

| Role | Rank | isSystem | Default permissions |
| ---- | ---- | -------- | -------------------- |
| **Administrator** | 40 | yes, **locked** | Every permission, forever — see below |
| **Manager** | 30 | yes | Dashboard: full · Users & Access: read + edit · Settings/Access Control: read only |
| **Engineer** | 20 | no | Dashboard: read only |
| **Viewer** | 10 | no | Dashboard: read only |

**Administrator's permissions are locked** two ways, not just seeded that
way: `can()` (`src/lib/rbac.ts`) short-circuits to `true` for
`principal.roleId === "admin"` regardless of what's stored in its
`role.permissions` row, and `updateRolePermissions()`
(`src/server/roles/actions.ts`) separately hard-refuses any change to the
`"admin"` row (the matrix UI renders it checked and disabled). This means
Administrator automatically holds a **newly added** permission — a new
module, a new action — the moment it exists in `PERMISSIONS`, with no data
migration required. Every other role's access comes entirely from what's
actually stored in its `permissions` array.

**Manager and Administrator are `isSystem`** — `deleteRole()` refuses to
remove them. **Engineer and Viewer are ordinary roles** — editable, renamable,
deletable once no user holds them. **Any number of new roles can be created**
from Access Control — "Add role" takes a name, description and rank; new
roles start with zero permissions and are granted from the matrix.

Rank exists to stop lateral and upward attacks. It is **not** a permission
hierarchy — a role does not automatically inherit a lower-ranked role's
permissions; each role's `permissions` column is authoritative on its own.

**User Management is Administrator- and Manager-only** by default
(`users:read` in each role's matrix) — an Engineer or Viewer who guesses the
`/admin/users` URL hits the `forbidden()` boundary, and the nav item never
renders for them. Because this is data, it's a matrix edit away from
changing, not a deploy.

## Permissions

4 modules × 4 actions = 16 permissions, all always defined (`PERMISSIONS` in
`src/lib/rbac.ts`), whether or not every cell is wired to a real guard yet:

```
dashboard      read / write / edit / delete   (only `read` has a guard today)
users          read / write / edit / delete   (edit covers approve/reject,
                                                 suspend/reinstate, role change)
settings       read / write / edit / delete   (Settings & Profile has no
                                                 permission gate of its own —
                                                 every active user reaches it)
access_control read / write / edit / delete   (governs Access Control itself)
```

`ACTIONS` and `MODULES` (also in `src/lib/rbac.ts`) are what the Access
Control matrix iterates to draw its rows and columns. "All" in that UI is
never itself a stored permission; it's derived and, when toggled, sets or
clears all four at once.

A future module (document library, chat — see
[ARCHITECTURE.md](./ARCHITECTURE.md#planned-rag-pipeline)) adds its own
`module:action` group here and a row in `MODULES` when it ships.

---

## The three rules

### 1. Permission check

```ts
can(principal, "users:edit")   // false unless status === "active"
```

`principal.permissions` is loaded once per request from the user's role
(`getCurrentUser()` in `src/lib/session.ts` joins `user` ⋈ `role`) — `can()`
itself stays a pure, synchronous check, safe to call from client components.

**Never branch on a role id directly.** `user.roleId === "admin"` scattered
through the codebase means a new role requires a grep; `can()` means it
requires an edit in Access Control, no code change at all.

### 2. Rank rule — who may act on whom

`denyReasonForActingOn(actor, target)` returns a **reason string** when the
action is disallowed, `null` when permitted. It refuses when:

- The actor is the target. Nobody administers their own account through the
  admin tools.
- The target's role outranks the actor's. A manager cannot suspend an
  administrator.

Returning the reason rather than a boolean is deliberate: the UI shows that
exact sentence in a tooltip on the disabled control.

### 3. Grant rule — which roles may be handed out

`assignableRoles(actor, allRoles)` returns only roles at or below the actor's
own rank. This applies to approval too, not just explicit role changes —
approving is granting a role.

---

## Enforcement points

| Layer | Helper | On failure |
| ----- | ------ | ---------- |
| `src/proxy.ts` | cookie presence only | redirect `/login` |
| Layout | `requireUser()` | redirect `/login` or `/pending` |
| Page | `requirePermission(p)` | render `forbidden.tsx` (403) |
| Server action | `authorize(p)` / `authorizeAny([p, …])` | return `{ ok: false, error }` |
| Query | `authorize(p)` / `authorizeAny([p, …])` | throws `AuthorizationError` |
| UI | `can()` / `canAny()` / `canActOn()` | hide or disable with a reason |

**The UI layer is cosmetic.** Hiding a button is a courtesy; the server action
behind it re-checks unconditionally.

---

## Lifecycle

```
register ──> pending ──approve(role)──> active ──suspend──> suspended
                │                          ▲                    │
                └──reject──> deleted       └────reinstate───────┘
```

- **Register** — always `pending`, no effective role. Except the very first
  account in an empty database, bootstrapped to active admin.
- **Approve** — sets `active` and assigns a role in one step.
- **Reject** — deletes the row rather than leaving a tombstone.
- **Suspend / role change** — deletes all of that user's sessions immediately.
- **A role's permissions change** — deletes the sessions of *every* user
  holding that role (`revokeSessionsForRole()` in
  `src/server/roles/actions.ts`).

Every transition writes to `audit_log` — see `src/lib/audit.ts`. There is no
Audit Trail *screen* yet (see [ROADMAP.md](./ROADMAP.md)), but the writes
already happen so one can be added without touching the write side.

---

## No Employee-matched identity

mcsu-app matches a signed-in user's email against an Employee record to show
an HR-sourced display name and position. MINAI has no Employees module, so
`CurrentUser`/`ManagedUser` just carry the account's own `name` — nothing is
derived or matched. Don't reintroduce that pattern unless a real identity
domain gets added later.

---

## Extending

### Add a permission

1. Append to `PERMISSIONS` in `src/lib/rbac.ts` — and to `MODULES` if it's an
   entirely new module.
2. Administrator gets it automatically. Grant it to whichever other roles
   should hold it from `/admin/access-control` — no code change, no deploy,
   for any database created after this point. For an **already-running**
   database, seed a data migration that appends the new permission(s) to the
   existing rows of whichever roles should have it.
3. Use it: `requirePermission("documents:read")` on the page,
   `authorize("documents:read")` in the action.

TypeScript will flag any `Permission` string that doesn't exist.

### Add a role

Use **Access Control** (`/admin/access-control`) → "Add role": name,
description, rank. It starts with zero permissions — grant them from the
matrix. No migration, no deploy.

---

## Deliberate gaps

- **No self-service password reset.** Needs an email provider; an admin resets
  out of band for now.
- **No rate limiting on sign-in.** Add before any public exposure.
- **No 2FA.** BetterAuth has a `twoFactor` plugin when it's wanted.
- **No permission caching.** Permissions load once per request alongside the
  session.
