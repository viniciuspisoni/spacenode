# SpaceNode — Roadmap

## Done ✅

### Infrastructure
- Google OAuth via Supabase (login/logout)
- `profiles` table with credit system
- `renders` table with generation history
- RLS configured per-user
- `handle_new_user` trigger (auto-creates profile on signup)
- `consume_credit` RPC (atomic decrement)
- Admin Supabase client (`lib/supabase/admin.ts`)

### Generation Pipeline
- Image upload → `fal.storage.upload()` → CDN URL
- Fal.ai model call → output URL
- Save to Supabase `renders`
- Credit deduction via `consume_credit` RPC
- Before/after slider comparison UI
- Download render button

### `/app/generate` UI
- Drag-and-drop upload
- Selectors: Environment / Style / Lighting
- Geometry Lock slider (0–100%)
- AI Engine selector (5 models)
- Real-time credit display
- Loading state with rotating text

---

## In Progress / Next

### Output Quality (main open problem)
- [ ] Test ControlNet (Canny/Depth) pipeline — preserves geometry, applies photorealistic style
- [ ] Evaluate architecture-specialized models on Fal.ai or Replicate
- [ ] Two-stage pipeline: SketchUp → Canny edges → txt2img photorealistic generation
- [ ] Test `strength` 0.85–0.95 (geometry lock 5–15%) for maximum AI freedom
- [ ] Add fixed `seed` support for reproducible comparative testing

### MVP Features (pending)
- [ ] Landing page
- [ ] Onboarding / credit purchase flow
- [ ] Render history gallery
- [ ] User settings / profile page
- [ ] Error handling improvements (user-facing messages)
