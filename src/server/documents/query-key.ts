import type { DocumentFilters } from "./types";

/**
 * Shared between the server page (which prefetches with it) and the client
 * view (which reads/invalidates with it) — same reasoning as `usersQueryKey`.
 */
export const documentsQueryKey = (filters: DocumentFilters) => ["documents", filters] as const;
