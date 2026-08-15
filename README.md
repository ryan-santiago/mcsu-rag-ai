# ReadTheMemo

*For when you really, really should have known.*
Questronix Corporation's internal document search and AI chat console.

ReadTheMemo is scaffolded from [mcsu-app](../mcsu-app), Questronix's MCSU console,
and shares its stack and conventions: Next.js 16 (App Router), React 19,
Tailwind 4 + shadcn/ui, BetterAuth, Drizzle on Neon Postgres, and TanStack
Query. This first pass ships the authenticated shell — Dashboard and
Administration (User Management, Access Control, Settings & Profile) — with
its own database, its own branding, and no Employees/Projects/Maintenance
modules, none of which apply here.

The intended product: upload documents, embed them into a vector store, then
search and chat over them with citations back to the source. That pipeline is
documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#planned-rag-pipeline)
but not built yet — see [docs/ROADMAP.md](docs/ROADMAP.md).

## Read first

| Doc | For |
| --- | --- |
| `docs/ARCHITECTURE.md` | How the pieces fit, and the planned RAG pipeline |
| `docs/RBAC.md` | Permissions, roles, guards |
| `docs/DESIGN.md` | Tokens, brand rules, accessibility |
| `docs/SETUP.md` | Environment and deployment |
| `docs/ROADMAP.md` | What's next and what's deliberately missing |

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in a Neon connection string, see docs/SETUP.md
npm run db:migrate
npm run db:seed
npm run dev
```

## Before committing

```bash
npm run check     # typecheck + lint, both must be clean
```
