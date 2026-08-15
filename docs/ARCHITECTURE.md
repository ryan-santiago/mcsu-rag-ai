# Architecture — ReadTheMemo

How the pieces fit, and why they were chosen. Read this before adding a feature.

This app is scaffolded from [mcsu-app](../../mcsu-app) — same stack, same
conventions (server-guarded RBAC, generic audit log, semantic design tokens).
What's different: a separate Neon database, no Employees/Projects/Maintenance
modules, new branding, and a "Planned" pipeline (below) this shell exists to
eventually carry.

---

## Stack

| Concern     | Choice                            | Why |
| ----------- | --------------------------------- | --- |
| Framework   | Next.js 16 (App Router, Turbopack) | Server components mean authorization runs before markup exists |
| UI          | React 19.2, Tailwind 4, shadcn/ui  | Tokens in CSS, components in our repo — no black-box theming |
| Icons       | Lucide                             | Consistent 24px grid, tree-shakeable |
| Database    | Neon Postgres                      | Serverless, scales to zero, branches per preview deploy — a **separate** Neon project from mcsu-app's |
| ORM         | Drizzle                            | SQL-shaped, fully typed, no runtime codegen step |
| Auth        | BetterAuth                         | Owns its tables in *our* database; hooks let us gate sign-in |
| Server state| TanStack Query                     | Cache, invalidation and request dedupe we'd otherwise hand-roll |
| Forms       | react-hook-form + Zod              | One schema validates on client and server |
| Hosting     | Vercel                             | First-party Next.js runtime |

---

## Directory map

```
src/
  app/
    (auth)/            Split-panel shell — login, register, pending, forgot-password
    (app)/             Authenticated shell — sidebar + topbar
      dashboard/
      admin/users/
      admin/access-control/
      admin/settings/
    api/auth/[...all]/ BetterAuth request handler
    forbidden.tsx      403 boundary, rendered by forbidden()
    error.tsx          Top-level error boundary
  components/
    brand/             Logo, BrandMark — real artwork, see docs/DESIGN.md
    auth/              Login and registration forms
    layout/            Sidebar, topbar, user menu, PageHeader, EmptyState
    users/             User Management table, badges, dialogs
    roles/             Access Control list, permission matrix, role dialog
    settings/          Account card + change-password form
    ui/                shadcn primitives
  db/
    schema.ts          Drizzle tables, enums, relations
    index.ts           The `db` singleton
  hooks/
    use-debounced.ts   Shared by every filterable table's search box
  lib/
    auth.ts            BetterAuth server config  (server only)
    auth-client.ts     BetterAuth React client
    rbac.ts            Permissions, modules, rank rules  (isomorphic)
    session.ts         requireUser / requirePermission / authorize
    audit.ts           recordAudit() + diffFields()  (server only — see below)
    audit-registry.ts  Module/action lists  (isomorphic)
    navigation.ts      Sidebar definition, RBAC-filtered
    format.ts          Shared date formatting
    validation/        Zod schemas shared by forms and actions
  server/
    users/             Queries, server actions, shared types
    roles/             Queries, server actions, shared types — Access Control
  env.ts               Zod-validated environment
  proxy.ts             Optimistic redirect (Next 16's middleware successor)
scripts/
  seed.ts
drizzle/               Generated SQL migrations — commit these
```

---

## Request flow

### Reading a protected page

```
Browser → proxy.ts            cookie present? no → redirect /login  (no DB hit)
        → (app)/layout.tsx    requireUser() → getCurrentUser() → BetterAuth → DB
        → page.tsx            requirePermission("users:read") → forbidden() if not
        → listUsers()         authorize("users:read") again, then query
        → HydrationBoundary   dehydrated cache streamed into the HTML
        → UsersView           TanStack Query adopts it — no loading flash
```

### Mutating

```
UsersView → server action → authorize(permission)   who are you, can you do this
                          → loadTarget()            do you outrank the target
                          → db.update()
                          → revokeSessions()        if access narrowed
                          → recordAudit()
                          → revalidatePath()
          ← ActionResult  → toast + queryClient.invalidateQueries()
```

Actions return `{ ok: false, error }` rather than throwing. See
[RBAC.md](./RBAC.md) for the full model.

---

## Decisions worth knowing

Everything mcsu-app's own ARCHITECTURE.md says about server components by
default, server actions as the only write path, the Neon HTTP driver having
no transactions, the session cookie cache, and roles-in-a-table applies here
unchanged — this app was scaffolded from that one and didn't change any of
it. The one addition: **there is no Employees module**, so `CurrentUser` and
`ManagedUser` carry a plain `name` — no derived `displayName`/`position`
matched against an HR record. Don't reintroduce that pattern unless a real
identity domain gets added.

---

## Planned: RAG pipeline

Not built yet — this is the shape the upload → search → chat product is
expected to take, written down so the shell above doesn't have to be
re-architected when it's time to build it. Every piece below was chosen to
stay free/open-source, per the project's own constraint.

```
Upload → Parse & chunk → Embed → pgvector (Neon) → Retrieve → Chat (+ history)
```

1. **Upload.** Object storage for the original files — Vercel Blob's free
   tier is the path of least resistance on this hosting setup; Cloudflare R2
   (S3-compatible, generous free tier) is the self-hosted-friendlier
   alternative if Vercel Blob's limits become a problem.

2. **Parse & chunk.** Extract text (PDF/DOCX/TXT) and split it into
   overlapping chunks sized for the embedding model's context window. A
   Node-native parser (e.g. `unpdf`/`pdf-parse` for PDFs) avoids standing up
   a separate parsing service.

3. **Embed.** Free, no per-token bill:
   - **Ollama**, self-hosted, running an open embedding model
     (`nomic-embed-text` or `bge-small`) — the suggested default if there's a
     machine to run it on.
   - **`transformers.js`**, in-process, no separate service — the fallback
     if self-hosting isn't available.

4. **Store & retrieve.** `pgvector` as a Postgres extension on the same Neon
   database — no second database to operate. A sketch of the tables this
   would add (not created yet):

   ```
   document          id, title, storageUrl, uploadedBy, createdAt
   documentChunk     id, documentId, content, embedding (vector), chunkIndex
   chatSession        id, userId, title, createdAt
   chatMessage        id, sessionId, role, content, citedChunkIds, createdAt
   ```

   Retrieval is a cosine-distance (`<=>`) nearest-neighbour query against
   `documentChunk.embedding`, with an HNSW or IVFFlat index once the table has
   enough rows to need one.

5. **Chat + history.** A retrieval-augmented prompt (top-K chunks + the
   question) sent to an LLM, with the conversation persisted to
   `chatSession`/`chatMessage` so history survives a page reload. LLM choice,
   free-first:
   - **Ollama** running an open model (Llama 3.1, Qwen2.5) — zero API cost,
     same host as the embedding model if there is one.
   - A free-tier hosted API (Groq, OpenRouter's free models) if self-hosting
     an LLM isn't practical on the deployment target.

When this gets built: new permission group(s) in `src/lib/rbac.ts` (e.g.
`documents:*`, `chat:*`), a new nav group in `src/lib/navigation.ts`, and
every mutation following the existing `diffFields()` + `recordAudit()`
convention so it shows up in an Audit Trail screen the moment one exists. The
RBAC and shell work underneath this file doesn't need to change to support
it — same reasoning mcsu-app's own ARCHITECTURE.md gives for its "Beyond user
management" roadmap.
