import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, vector } from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `pending` users have registered but have not been approved yet: they hold no
 * role and cannot obtain a session. `suspended` users keep their role but are
 * locked out.
 */
export const userStatus = pgEnum("user_status", ["pending", "active", "suspended"]);

export const chatMessageRole = pgEnum("chat_message_role", ["user", "assistant"]);

/**
 * `pending` — just uploaded, chunking/embedding hasn't started. `processing` —
 * the embed route is actively parsing/chunking/embedding it. `ready` — chunks
 * exist and are searchable. `failed` — see `document.embeddingError` for why;
 * retriable from the same state.
 */
export const documentEmbeddingStatus = pgEnum("document_embedding_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

/** Which kind of provider is active for a given concern (embedding or chat) — see `aiSettings`. Shared between both. */
export const embeddingProviderKind = pgEnum("embedding_provider_kind", ["ollama", "api"]);

/* -------------------------------------------------------------------------- */
/*  Roles — the RBAC anchor                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Roles and the permissions they grant are admin-editable at runtime (see
 * docs/RBAC.md and the Access Control screen), so this is a table rather than
 * a fixed enum. `permissions` stores `Permission` strings (`src/lib/rbac.ts`)
 * as plain `text[]` rather than importing that type here, to keep `schema.ts`
 * free of a dependency on `lib/`; the roles query/action layer validates the
 * array's shape at the boundary instead.
 *
 * `rank` preserves the hierarchy rules — who may act on whom, and which roles
 * someone may grant — as an admin-settable field. `isSystem` roles
 * (Administrator, Manager) cannot be deleted; Administrator's `permissions`
 * are additionally locked in the action layer (`src/server/roles/actions.ts`)
 * so the workspace can never accidentally lock itself out.
 */
export const role = pgTable(
  "role",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    description: text("description"),
    rank: integer("rank").notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("role_rank_idx").on(table.rank)],
);

/* -------------------------------------------------------------------------- */
/*  BetterAuth core tables                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Matches BetterAuth's expected `user` model, extended with the ReadTheMemo fields
 * declared under `user.additionalFields` in `src/lib/auth.ts`. Column names on
 * the JS side must stay in sync with that config.
 */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified")
      .$defaultFn(() => false)
      .notNull(),
    image: text("image"),

    // --- ReadTheMemo fields ---
    roleId: text("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "restrict" }),
    status: userStatus("status").default("pending").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("user_status_idx").on(table.status), index("user_role_id_idx").on(table.roleId)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/* -------------------------------------------------------------------------- */
/*  Audit trail                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One entry in a field-level diff — what changed, from what, to what.
 * `label` is the human-readable column header ("Role"); `field` is the
 * machine key ("role"). Stored as JSON, produced by `diffFields()` in
 * `src/lib/audit.ts`.
 */
export type AuditChange = {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
};

/**
 * Append-only, generic across every module the app will ever have. There is
 * no Audit Trail screen yet (see docs/ROADMAP.md) — this table exists because
 * `src/lib/auth.ts` (login) and the users/roles actions already write to it,
 * and it's the convention every future module (document upload, chat) should
 * follow. `module`/`action` are plain text, not DB enums, so a future module
 * can start writing entries without a migration. `entityId` deliberately has
 * no foreign key: a single audit table can't reference N different future
 * domain tables, so it's a snapshot, not a live reference.
 *
 * `actorId` is null for system-driven events; `changes` is null for pure
 * events with no before/after state (login, logout).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(),
    action: text("action").notNull(),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    changes: jsonb("changes").$type<AuditChange[]>(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_actor_id_idx").on(table.actorId),
    index("audit_log_module_idx").on(table.module),
    index("audit_log_entity_idx").on(table.entityId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Chat                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A single conversation, owned by exactly one user — chat history is
 * personal, not a shared/admin-visible record like `role` or `user`.
 * `title` defaults to a placeholder and is renamed either by the user or
 * automatically from the first message; see `src/server/chat/actions.ts`.
 *
 * Replies are retrieval-augmented — grounded in `documentChunk` content, see
 * `src/lib/retrieval.ts` — but structured citations (`citedChunkIds` per
 * message) aren't built yet; docs/ROADMAP.md defers that to its own step.
 */
export const chatSession = pgTable(
  "chat_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("chat_session_user_id_idx").on(table.userId)],
);

export const chatMessage = pgTable(
  "chat_message",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSession.id, { onDelete: "cascade" }),
    role: chatMessageRole("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("chat_message_session_id_idx").on(table.sessionId)],
);

/* -------------------------------------------------------------------------- */
/*  Documents                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A raw uploaded file, stored as-is under `public/uploads/documents` — see
 * `src/lib/storage/documents.ts`. No parsing, chunking or embedding happens
 * yet; this table is deliberately just metadata around a file on disk, not
 * the `document`/`documentChunk` pair sketched in docs/ARCHITECTURE.md's
 * "Planned" section for the future RAG pipeline.
 *
 * `storedName` is the uuid-prefixed name the bytes actually live under on
 * disk (collision-proof, path-safe); `originalName` is what the uploader
 * picked and what the UI shows. There is no upload/edit "status" column: a
 * row is only ever inserted after the file has finished writing to disk, so
 * its mere existence means "ready" — in-flight progress is a client-only
 * concept (see `documents-view.tsx`), not persisted state.
 *
 * `uploadedByName` is a label snapshot, same reasoning as `auditLog.entityLabel`
 * — the uploader's account may later be deleted (`uploadedById` is `on delete
 * set null`) but the table should still say who uploaded it.
 */
export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    originalName: text("original_name").notNull(),
    storedName: text("stored_name").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    uploadedByName: text("uploaded_by_name").notNull(),

    // --- Embedding pipeline — see src/app/api/documents/[id]/embed/route.ts ---
    embeddingStatus: documentEmbeddingStatus("embedding_status").default("pending").notNull(),
    /** Set only when `embeddingStatus` is `failed` — a user-facing message, not a stack trace. */
    embeddingError: text("embedding_error"),
    /** Total chunk count once known (after parsing/chunking, before embedding starts). */
    chunkCount: integer("chunk_count").default(0).notNull(),
    /** Bumped after each chunk is embedded — `embeddedChunkCount/chunkCount` is the progress UI's real percentage. */
    embeddedChunkCount: integer("embedded_chunk_count").default(0).notNull(),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("document_created_at_idx").on(table.createdAt),
    index("document_embedding_status_idx").on(table.embeddingStatus),
  ],
);

/**
 * One chunk of extracted text from a `document`, plus its embedding vector.
 * `embedding` is pinned to 768 dimensions — `nomic-embed-text`'s output size,
 * the only model this ships against today (see `aiSettings` below).
 * Switching to a model with a different dimensionality strands existing rows
 * in an incompatible vector space; there is no migration for that yet, see
 * docs/ARCHITECTURE.md and the embedding milestone's plan for why.
 *
 * No HNSW/IVFFlat index yet — deferred until there's enough data for pgvector's
 * own guidance on index choice to matter.
 */
export const documentChunk = pgTable(
  "document_chunk",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("document_chunk_document_id_idx").on(table.documentId)],
);

/* -------------------------------------------------------------------------- */
/*  AI settings                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A singleton config row (`id` is always the literal `"default"`, upserted —
 * there is exactly one active configuration at a time) rather than a
 * per-user or per-document setting. Admin-configurable from `/admin/ai-settings`
 * instead of hardcoded env vars, so switching providers (or retrieval/guardrail
 * knobs) is a settings change, not a redeploy — see the embedding milestone's
 * plan for why this matters given local Ollama isn't reachable from a
 * Vercel-hosted deployment.
 *
 * The TypeScript binding is `aiSettings` (not `embeddingSettings`, its
 * original name) because it grew to cover the chat pipeline too — but the
 * underlying SQL table is still literally named `embedding_settings`.
 * Renaming it would need drizzle-kit's interactive rename-vs-recreate
 * prompt, which needs a TTY this environment doesn't have; a purely
 * cosmetic DB-level rename wasn't worth hand-writing a migration/snapshot
 * for. The embedding columns kept their existing (unprefixed) names either
 * way, so this is invisible from application code.
 *
 * Every `*KeyCiphertext`/`*KeyIv`/`*KeyAuthTag` triple holds an
 * AES-256-GCM-encrypted API key (`src/lib/crypto/secrets.ts`) — the
 * plaintext key is never stored and never sent back to the browser once
 * saved. Embedding and chat each get their own key/provider fields — they
 * can point at entirely different providers (e.g. local Ollama for
 * embedding, an API for chat) independently.
 */
export const aiSettings = pgTable("embedding_settings", {
  id: text("id").primaryKey().default("default"),

  // --- Embedding — src/lib/embeddings/ ---
  provider: embeddingProviderKind("provider").default("ollama").notNull(),
  ollamaBaseUrl: text("ollama_base_url").default("http://localhost:11434").notNull(),
  ollamaModel: text("ollama_model").default("nomic-embed-text").notNull(),
  /** e.g. `"openai"` — the only hosted embedding provider wired up today. Claude has no embeddings API. */
  apiProvider: text("api_provider"),
  apiModel: text("api_model"),
  apiKeyCiphertext: text("api_key_ciphertext"),
  apiKeyIv: text("api_key_iv"),
  apiKeyAuthTag: text("api_key_auth_tag"),

  // --- Chat — src/lib/chat-completion/ ---
  chatProvider: embeddingProviderKind("chat_provider").default("ollama").notNull(),
  ollamaChatModel: text("ollama_chat_model").default("llama3.2:1b").notNull(),
  /** `"openai"` or `"anthropic"` — unlike embedding, Claude is a valid chat provider. */
  chatApiProvider: text("chat_api_provider"),
  chatApiModel: text("chat_api_model"),
  chatApiKeyCiphertext: text("chat_api_key_ciphertext"),
  chatApiKeyIv: text("chat_api_key_iv"),
  chatApiKeyAuthTag: text("chat_api_key_auth_tag"),

  // --- Retrieval & guardrails — src/lib/retrieval.ts, src/lib/guardrails.ts, src/lib/rate-limit.ts ---
  /** How many nearest chunks to retrieve per question. */
  retrievalTopK: integer("retrieval_top_k").default(5).notNull(),
  /** Low by default — favors grounded/factual answers over creative ones for policy Q&A. */
  temperature: real("temperature").default(0.4).notNull(),
  /** Per-user cap on user messages per 60s window — see `checkChatRateLimit()`. */
  rateLimitPerMinute: integer("rate_limit_per_minute").default(10).notNull(),
  /** Local keyword/pattern filter on generated replies — see `moderateOutput()`. */
  outputModerationEnabled: boolean("output_moderation_enabled").default(true).notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

/* -------------------------------------------------------------------------- */
/*  Relations                                                                 */
/* -------------------------------------------------------------------------- */

export const roleRelations = relations(role, ({ many }) => ({
  users: many(user),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  role: one(role, { fields: [user.roleId], references: [role.id] }),
  sessions: many(session),
  accounts: many(account),
  chatSessions: many(chatSession),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, { fields: [auditLog.actorId], references: [user.id] }),
}));

export const chatSessionRelations = relations(chatSession, ({ one, many }) => ({
  user: one(user, { fields: [chatSession.userId], references: [user.id] }),
  messages: many(chatMessage),
}));

export const chatMessageRelations = relations(chatMessage, ({ one }) => ({
  session: one(chatSession, { fields: [chatMessage.sessionId], references: [chatSession.id] }),
}));

export const documentRelations = relations(document, ({ one, many }) => ({
  uploadedBy: one(user, { fields: [document.uploadedById], references: [user.id] }),
  chunks: many(documentChunk),
}));

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
  document: one(document, { fields: [documentChunk.documentId], references: [document.id] }),
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type Role = typeof role.$inferSelect;
export type UserStatus = (typeof userStatus.enumValues)[number];
export type ChatSession = typeof chatSession.$inferSelect;
export type ChatMessage = typeof chatMessage.$inferSelect;
export type ChatMessageRole = (typeof chatMessageRole.enumValues)[number];
export type Document = typeof document.$inferSelect;
export type DocumentEmbeddingStatus = (typeof documentEmbeddingStatus.enumValues)[number];
export type DocumentChunk = typeof documentChunk.$inferSelect;
export type AiSettings = typeof aiSettings.$inferSelect;
export type EmbeddingProviderKind = (typeof embeddingProviderKind.enumValues)[number];
