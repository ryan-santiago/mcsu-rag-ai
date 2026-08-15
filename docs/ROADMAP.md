# Roadmap

What is built, what is deliberately missing, and what to build next.

---

## Shipped

- Split-panel login, registration and pending-approval screens
- BetterAuth email/password with sessions, sign-in blocked for
  pending/suspended accounts
- Drizzle schema on Neon: user, session, account, verification, role,
  audit_log
- RBAC: admin-editable roles and permissions (Access Control), rank rules,
  guards on layout, page, action and query — see [RBAC.md](./RBAC.md)
- App shell: RBAC-filtered sidebar, topbar, mobile drawer, light/dark/system
- Dashboard (intentionally empty — the frame and guard are in place)
- User Management: search, status filters, approve with role assignment,
  reject, role change, suspend/reinstate, remove
- Settings & Profile: account identity card + change password
- Real ReadTheMemo brand assets: logo, mark and favicon (`src/components/brand/logo.tsx`, `src/app/icon.png`)

---

## Deliberately missing

Each of these is a decision, not an oversight.

| Gap | Why | Cost to add |
| --- | --- | ----------- |
| The actual product (upload/embed/chat) | This pass only scaffolds the shell — see "Planned" in [ARCHITECTURE.md](./ARCHITECTURE.md#planned-rag-pipeline) | The real work — next milestone |
| Audit Trail screen | Not asked for in this pass — the write path (`recordAudit()`) already exists and is used by login/users/roles | A read-only page + filters, same shape as mcsu-app's `/admin/audit` |
| Employees/Projects/Maintenance modules | Out of scope — ReadTheMemo is not an HR/ops tool | N/A — these are mcsu-app-specific, not planned here |
| Email verification / password reset | No transactional sender configured. Admin approval/reset is the gate instead | ~half a day with Resend, same as mcsu-app |
| Sign-in rate limiting | Internal-only for now | ~1 hour — BetterAuth's `rateLimit` option |
| Two-factor auth | Not requested | ~1 day — BetterAuth `twoFactor` plugin |
| Tests | Speed of the first milestone | See below |

---

## Next up

### 1. The RAG pipeline

Upload → parse/chunk → embed → pgvector → retrieve → chat, per
[ARCHITECTURE.md](./ARCHITECTURE.md#planned-rag-pipeline). Rough order:

1. `document`/`documentChunk` schema + upload UI, storing originals in object
   storage and text chunks (unembedded) in Postgres.
2. Wire an embedding step (Ollama or `transformers.js`) and add the
   `pgvector` column + index.
3. A retrieval query (top-K nearest chunks) and a bare-bones chat UI that
   sends it plus the question to an LLM.
4. `chatSession`/`chatMessage` persistence so history survives a reload.
5. Citations — surface which chunks/documents backed an answer.

### 2. Tests

Same order mcsu-app recommends: Vitest on `src/lib/rbac.ts` first (pure
functions, highest security value per line), then server actions against a
Neon test branch, then Playwright for register → pending → approve → sign in.

---

## Later

- **Audit Trail screen**, once there's enough write volume (uploads, chat) to
  make it worth a page.
- **Microsoft Entra ID SSO** — same reasoning as mcsu-app, if Questronix
  staff should sign in with their existing identity instead of registering.
- **Neon branching per PR** — before more than one person is committing.
- **Bulk actions**, **CSV export** — same low-priority conveniences mcsu-app
  defers.
