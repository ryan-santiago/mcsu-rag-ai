/**
 * Shared between the server page (which prefetches with it) and the client
 * view (which reads/invalidates with it) — same split as `roles/query-key.ts`.
 */
export const chatSessionsQueryKey = () => ["chat-sessions"] as const;

export const chatMessagesQueryKey = (sessionId: string) => ["chat-sessions", sessionId, "messages"] as const;
