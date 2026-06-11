import "server-only";
import postgres from "postgres";

declare global {
  // Cache the client across HMR / dev server reloads.
  // eslint-disable-next-line no-var
  var __binderlyPg: ReturnType<typeof postgres> | undefined;
}

function createClient(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local for local dev or to your deployment env.",
    );
  }
  // SSL: most managed Postgres providers require it; self-hosted often does not.
  // Default to "prefer" (use SSL when available); allow explicit DATABASE_SSL=false to disable.
  const ssl =
    process.env.DATABASE_SSL === "false"
      ? false
      : process.env.DATABASE_SSL === "require"
        ? "require"
        : "prefer";
  return postgres(url, { max: 5, ssl });
}

// Lazy: don't connect (or fail) at module import time so `next build` succeeds
// even when DATABASE_URL isn't set. The first actual query triggers the connect.
export function getSql(): ReturnType<typeof postgres> {
  if (!globalThis.__binderlyPg) {
    globalThis.__binderlyPg = createClient();
  }
  return globalThis.__binderlyPg;
}

export type SharedDocumentRow = {
  id: string;
  markdown: string;
  theme: string;
  custom_css: string | null;
  metadata_title: string | null;
  metadata_author: string | null;
  rounded_corners: boolean;
  show_toc: boolean;
  created_at: Date;
};

export type CreateSharedDocInput = {
  markdown: string;
  theme: string;
  customCss?: string | null;
  metadataTitle?: string | null;
  metadataAuthor?: string | null;
  roundedCorners?: boolean;
  showToc?: boolean;
};

export async function createSharedDoc(input: CreateSharedDocInput): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO shared_documents (
      markdown, theme, custom_css, metadata_title, metadata_author,
      rounded_corners, show_toc
    )
    VALUES (
      ${input.markdown},
      ${input.theme},
      ${input.customCss ?? null},
      ${input.metadataTitle ?? null},
      ${input.metadataAuthor ?? null},
      ${input.roundedCorners ?? false},
      ${input.showToc ?? true}
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function getSharedDoc(id: string): Promise<SharedDocumentRow | null> {
  // Validate id shape before hitting the DB to avoid uuid parse errors leaking as 500s.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const sql = getSql();
  const rows = await sql<SharedDocumentRow[]>`
    SELECT id, markdown, theme, custom_css, metadata_title, metadata_author,
           rounded_corners, show_toc, created_at
    FROM shared_documents
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
