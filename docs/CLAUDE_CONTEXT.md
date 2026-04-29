# SpaceNode — Claude Context

## What is this project?

SpaceNode is a web app that transforms SketchUp/3D architectural renders into photorealistic photographs using AI image generation via Fal.ai.

## Stack

- **Frontend**: Next.js 16.2.4 (App Router + Turbopack), React 19, TypeScript
- **Backend**: Next.js API Routes
- **AI**: `@fal-ai/client` v1.9.5
- **Database**: Supabase (PostgreSQL + Auth + RLS)

## Key Files

```
app/
  api/generate/route.ts          ← AI generation handler (POST)
  app/generate/
    page.tsx                     ← Server component (auth + profile)
    GenerateClient.tsx           ← Client component (full UI)
lib/
  supabase/
    admin.ts                     ← Service role client (bypasses RLS)
    server.ts                    ← SSR client
    client.ts                    ← Browser client
supabase-schema.sql              ← Full database schema
.env.local                       ← Environment variables (not committed)
```

## Environment Variables (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://nucyyqmurhnakhldshwr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
FAL_KEY=173d400b-...:99611ea83ff5e1252a5900805039e739
```

## Generation Engine Config (`route.ts`)

```typescript
// Default model
'fal-ai/flux/dev/image-to-image'

// Available models (UI selector)
'fal-ai/flux/dev/image-to-image'
'fal-ai/flux/krea/image-to-image'
'fal-ai/flux-control-lora-canny/image-to-image'
'fal-ai/flux-control-lora-depth/image-to-image'
'fal-ai/flux-general/image-to-image'

// Parameters
strength = 1 - (geometryLock / 100)  // default geometryLock 30% → strength 0.7
num_inference_steps = 40
guidance_scale = 3.5                  // correct for Flux (not SDXL)

// Prompt = buildPrompt(ambient, style, lighting) + QUALITY_SUFFIX
```

**Important**: `fal-ai/flux/dev/image-to-image` does NOT support `negative_prompt`.

## How to Run Locally

```bash
cd C:\Users\Pisoni\spacenode
npm install
npm run dev
# Visit: http://localhost:3000/app/generate
```

## Database

- Table `profiles`: user credits (`credits` field)
- Table `renders`: generation history
- RLS: each user sees only their own data
- Trigger `handle_new_user`: creates profile on signup
- Function `consume_credit(user_id_input uuid)`: atomic decrement with `SELECT FOR UPDATE`
