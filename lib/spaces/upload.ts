// ── SPACES upload constants ───────────────────────────────────────────────────
// Single source of truth for the SPACES upload size limit.
// Used by both the client (new/page.tsx) and the server (api/spaces/route.ts).
//
// Next.js App Router Route Handlers use the Web Request API directly and do NOT
// have the 4 MB body-parser limit that applied to the old Pages Router API routes.
// No next.config.js change is needed for 10 MB uploads.

export const SPACES_MAX_UPLOAD_MB    = 10
export const SPACES_MAX_UPLOAD_BYTES = SPACES_MAX_UPLOAD_MB * 1024 * 1024 // 10_485_760

/** Human-readable error shown to both client and server responses. */
export const SPACES_UPLOAD_SIZE_ERROR = `Imagem deve ter menos de ${SPACES_MAX_UPLOAD_MB} MB.`
