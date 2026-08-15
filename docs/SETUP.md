# Setup & Deployment

From a fresh clone to a running console, then to Vercel. Same shape as
mcsu-app's own SETUP.md — a separate Neon project, separate secret, separate
port so both apps can run side by side during development.

---

## Do I need Docker?

**No.** Same reasoning as mcsu-app: Neon is hosted Postgres, Vercel builds and
runs Next.js natively, and local dev is `npm run dev` against the same Neon
database (or a branch of it).

---

## Prerequisites

- Node.js 20.9+ (22 LTS recommended)
- npm 10+
- A [Neon](https://neon.tech) account (free tier is enough) — a **new**
  project, separate from mcsu-app's

---

## 1. Install

```bash
npm install
```

## 2. Create the database

1. Sign in to [console.neon.tech](https://console.neon.tech) → **New Project**.
2. Name it `readthememo`, pick the region closest to your users.
3. **Connect** → copy the **pooled** connection string:

   ```
   postgresql://neondb_owner:xxxx@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/readthememo?sslmode=require
   ```

   Use the **pooled** endpoint (`-pooler` in the host).

## 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Notes |
| -------- | ----- |
| `DATABASE_URL` | The pooled Neon string from step 2. Must include `?sslmode=require`. |
| `BETTER_AUTH_SECRET` | ≥32 chars. Generate: `npx @better-auth/cli@latest secret` |
| `PORT` | Defaults to 3000. `4100` is suggested, so it doesn't collide with mcsu-app's `4000` if both run locally at once. |
| `BETTER_AUTH_URL` | Must match `PORT` above, e.g. `http://localhost:4100` locally; your real origin in production. |

`src/env.ts` validates these at startup with Zod.

> `.env.local` is gitignored. Never commit it. Use a **different**
> `BETTER_AUTH_SECRET` in production — rotating it invalidates all sessions.

## 4. Create the tables

```bash
npm run db:migrate
```

There is no pre-existing migration history to port from mcsu-app — ReadTheMemo's
schema starts fresh at `drizzle/0000_initial_schema.sql`.

```bash
npm run db:studio     # Drizzle Studio in the browser
```

<details>
<summary>Changing the schema later</summary>

```bash
# 1. edit src/db/schema.ts
npm run db:generate -- add_document_table   # writes drizzle/0001_add_document_table.sql
npm run db:migrate                          # applies it
```

Commit the generated SQL.

</details>

## 5. Create the first administrator

**A — register through the UI (simplest).**
`npm run dev`, open <http://localhost:4100/register>, sign up. The first
account in an empty database is automatically an active **Administrator**.

**B — seed it non-interactively.**

```bash
npm run db:seed
```

Reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME`. **Change
that password after first sign-in.**

```bash
npm run db:seed -- --with-demo-users
```

Adds a handful of demo accounts spanning every role and status. Re-running is
safe.

## 6. Run

```bash
npm run dev
```

<http://localhost:4100> (or whatever `PORT` is set to in `.env.local`)

---

## Everyday commands

| Command | Does |
| ------- | ---- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run check` | Typecheck + lint — run before every commit |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database |
| `npm run db:seed` | Seed the admin (`-- --with-demo-users` for more) |

---

## Deploying to Vercel

Same as mcsu-app: push to GitHub, import at
[vercel.com/new](https://vercel.com/new), set `DATABASE_URL` /
`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` as environment variables (a **fresh**
secret, not the local one), deploy, then run the migration once against the
production database and visit `/register` to create the first administrator.

### After adding a custom domain

Update `BETTER_AUTH_URL` to the real origin and redeploy.

### Preview deployments

Neon **database branching** pairs well with Vercel previews, same as
mcsu-app — worth doing once more than one person is committing.

---

## Troubleshooting

**`Invalid environment variables` on start**
`.env.local` is missing or a value failed validation.

**`password authentication failed`**
The Neon string was truncated on copy, or the role was rotated. Re-copy from
Neon → Connect.

**Sign-in returns "awaiting approval" for an account you approved**
Approval assigns a role and sets `active`, and deliberately deletes that
user's sessions. Sign in again.

**Everything 500s right after deploy**
Migrations haven't run against the production database. See step 5 above.
