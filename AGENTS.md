# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# ReadTheMemo — working notes

Internal document search and AI chat console for Questronix Corporation,
scaffolded from [mcsu-app](../mcsu-app) — same stack, same conventions,
separate database, separate branding. See `README.md` for what ReadTheMemo is.

## Read first

| Doc | For |
| --- | --- |
| `docs/ARCHITECTURE.md` | How the pieces fit, and the planned RAG pipeline |
| `docs/RBAC.md` | Permissions, roles, guards |
| `docs/DESIGN.md` | Tokens, brand rules, accessibility |
| `docs/SETUP.md` | Environment and deployment |
| `docs/ROADMAP.md` | What's next and what's deliberately missing |

## Rules that are easy to get wrong

- **Never branch on `role`.** Use `can(user, "permission")` from `src/lib/rbac.ts`.
  Role checks scattered in components are the thing this codebase is built to avoid.
- **Guard on the server, always.** Pages use `requirePermission()`, actions and
  queries use `authorize()`. Hiding a button in the UI is cosmetic.
- **Server actions never `redirect()`** — it breaks the mutation response. They
  return `{ ok: false, error }`; only layouts and pages redirect.
- **`import "server-only"`** in any module that must not reach the browser.
- **Semantic tokens only.** `bg-primary`, never `bg-[#006E8F]`.
- **Coral (`--brand-accent`) is reserved for AI-generated content badges** —
  never a general UI fill, link colour, or button. See `docs/DESIGN.md`.
- **Anything that narrows access must call `revokeSessions()`** — the session
  cookie cache is 5 minutes, so without it a suspended user lingers.
- **There is no Employees module here.** `CurrentUser`/`ManagedUser` carry
  `name` only — don't reintroduce an `Employee`-matched `displayName` unless a
  real HR/identity domain gets added.
- **Any future module's Edit/Delete must call `diffFields()` + `recordAudit()`**
  (`src/lib/audit.ts`) so it's ready for an Audit Trail screen if one gets
  built — there's no page for it yet (see `docs/ROADMAP.md`), but `auth.ts`
  and the users/roles actions already write to it. Don't build a one-off
  logging path.
- **`src/lib/audit.ts` is server-only; `src/lib/audit-registry.ts` isn't.**
  Client components import module/action lists from `audit-registry.ts`,
  never from `audit.ts` — importing a `"server-only"` module from a client
  component throws at runtime, not at build time.
- **Don't build the upload/embedding/chat pipeline speculatively.** It's
  documented in `docs/ARCHITECTURE.md`'s "Planned" section but intentionally
  not implemented — see `docs/ROADMAP.md` for why.

## Before committing

```bash
npm run check     # typecheck + lint, both must be clean
```

The lint config enforces React Compiler rules — no `setState` inside an effect,
and use `useWatch()` rather than `form.watch()` in react-hook-form.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
