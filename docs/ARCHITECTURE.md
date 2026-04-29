# SpaceNode — Architecture

## Overview

Next.js App Router application. All AI calls go through a server-side API route — the Fal.ai key is never exposed to the browser.

## Request Flow

```
Browser (GenerateClient.tsx)
  → POST /api/generate
      → fal.storage.upload(image)       # upload to Fal CDN
      → fal.subscribe(model, params)    # run AI model
      → supabase.from('renders').insert # save result
      → consume_credit(user_id)         # debit credit atomically
  ← { outputUrl, renderRecord }
Browser
  → renders before/after slider
  → download button
```

## Directory Structure

```
app/
  api/
    generate/
      route.ts          ← POST handler; model routing, Fal.ai call, DB write
  app/
    generate/
      page.tsx          ← Server component; auth guard, profile fetch
      GenerateClient.tsx← Client component; all UI state
  layout.tsx
  page.tsx              ← Landing / home
components/             ← Shared UI components
lib/
  supabase/
    admin.ts            ← createClient with service_role (server-only)
    server.ts           ← createClient with cookies (SSR)
    client.ts           ← createClient (browser)
public/                 ← Static assets
docs/                   ← Project documentation
```

## Auth

- Google OAuth via Supabase Auth
- Session managed by Supabase SSR helpers (cookie-based)
- API route uses admin client to bypass RLS for credit deduction

## AI Engine

- All models accessed via `@fal-ai/client`
- `fal.storage.upload()` converts local File → Fal CDN URL before inference
- Model selected per-request from the UI selector
- `strength` parameter derived from `geometryLock` slider: `strength = 1 - geometryLock/100`

## Database (Supabase / PostgreSQL)

```sql
profiles (id uuid PK, credits int, created_at)
renders  (id uuid PK, user_id uuid FK, input_url text, output_url text,
          model text, prompt text, params jsonb, created_at)
```

RLS policies restrict reads/writes to the owning user.
`consume_credit` is a PL/pgSQL function that uses `SELECT FOR UPDATE` to prevent race conditions.
