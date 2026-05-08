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

---

## Backlog (P2 / não-prioritário)

### Auth
- [ ] **Sign in with Apple** — alinha com público de arquitetura (skew Apple alto). Bloqueado em: Apple Developer Program ($99/ano, ~24-72h de aprovação), config no Apple Console (App ID + Services ID + private key `.p8` + JWT renovável a cada 6 meses), 1 botão no `/login` (mesmo padrão do Google em [login/page.tsx:82](app/login/page.tsx:82)). Cuidado com email proxy `@privaterelay.appleid.com` — `handle_new_user` salva o relay, comunicação transacional que não passe pelo provider de email da Apple não chega. Reabrir quando: sair do beta pra público amplo, ou conversão de login virar gargalo, ou houver app iOS nativo (App Store exige).
