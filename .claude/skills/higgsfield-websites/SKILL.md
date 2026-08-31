---
version: 0.3.0
name: higgsfield-websites
description: |
  Build, edit, and deploy full-stack websites via the Higgsfield CLI
  (`higgsfield website …`). Each site is a React 19 + TanStack Start app,
  server-rendered as one Cloudflare Worker, with D1 / R2 / KV / Durable Objects /
  Containers. The loop: create → repo-access → clone → edit → push → deploy
  preview. This skill is the website template's AGENTS.md — stack, the wow-maker
  design contract, the hard rules, the editing map, and the verify/deploy flow,
  plus per-task references. Everything is here; don't search the skill library
  for other design guidance.
  Use when: "build me a website", "make a landing page", "create a web app",
  "build a SaaS dashboard / tool / portfolio", "deploy this site", "edit or add
  a page or feature to my site", "ship to production".
  Chain with: higgsfield-generate for hero images, video loops, and OG assets.
  NOT for: single image/video/audio generation (higgsfield-generate), product
  photos (higgsfield-product-photoshoot), marketplace cards
  (higgsfield-marketplace-cards).
argument-hint: "[what to build or edit] [--env preview|production]"
allowed-tools: Bash
---

# Agent guide — Higgsfield website (full-stack, server-rendered)

You are editing ONE per-website Cloudflare Worker: a **React 19 + TanStack Start**
app that is **server-rendered (SSR)** and deploys as a single Worker served at
the website's own subdomain. The look of the site is composed from the **wow-maker**
toolkit (see rule 0). The rules below are hard constraints — breaking them ships a
broken or insecure website.

**Scope: build the real, full app — and make it WOW.** This stack ships complete,
production-grade applications: real frontend AND backend, database (D1), file storage
(R2), auth, third-party API integrations, and background work. When the user describes
an app, tool, site, or web product, BUILD IT directly with the website builder — it is
the default for any web app, site, or tool. Never ask the user to confirm the platform
or build target (e.g. "is this a Higgsfield website-builder site, or something else?"),
never ask whether they "really" want an app, never downgrade to a "demo" or mockup as
the safe option, and don't stall on scope questions. Take the fullest reasonable
interpretation of the request, fill gaps with sensible defaults, and ship a working
preview. Ask at most ONE short clarifying question — and only when the ambiguity
genuinely changes what you'd build and no sensible default exists; otherwise build
first and iterate with the user on the live result.

**"Build it" INCLUDES "make it wow" — wow is part of DONE, not optional polish.** A
real, working app that is a flat page of default components is NOT done; by this
skill's standard it is a failure. Do the wow pass as a first-class part of every build,
not something you add later or skip under time pressure (and never silently judge it
"optional" because the brief feels restrained — see rule 0). Read
`references/wow-maker.md` and hit its minimum wow bar before you consider the site
finished.

**Repo layout.** The website project lives in **`app/`** — its own `package.json`,
`src/`, `packages/`, `migrations/`, build config, and the deploy inputs
(`app.manifest.json`, `wrangler.jsonc`). Run every `bun`/build command from
there. There are no per-template setup files to hunt for — everything you need to
build is in this skill (`website-builder-flow`) and its `references/`.

**Higgsfield infrastructure (what these names mean).** The website you build
integrates with Higgsfield's platform through three pieces — all are Higgsfield's
own infra, not third-party libraries:

- **fnf** — Higgsfield's backend **API**. The product's generation, media,
  profile, workspace, credits, and auth all live behind it. Server code reaches
  it at `https://fnf.internal/*` (the platform injects the user's auth on server
  egress). `@higgsfield/fnf` is the SDK and `@higgsfield/fnf-react` its React
  bindings (both vendored in `app/packages/`).
- **Quanta** (`@higgsfield/quanta`) — Higgsfield's **app UI design system**: tokens
  and components for product surfaces. Use it **only for app surfaces that
  integrate the Higgsfield fnf SDK** — generation consoles and fnf-backed tools
  (image/video generation, media, profile, workspace, credits). Everything else —
  marketing/landing pages, portfolios, and general SaaS/dashboards/tools that do
  NOT use the SDK — are built with custom Tailwind/CSS (per wow-maker), not Quanta.
  Vendored in `app/packages/quanta`.
- **fnf-web** — the main Higgsfield web app/repo that owns these packages
  upstream. You don't edit it; it's the source of truth the vendored
  `app/packages/*` snapshots come from.

## Prerequisites

You drive the whole lifecycle through the `higgsfield` CLI, then edit code on the
local filesystem with `git` + `bun`.

1. If `higgsfield` is not on `$PATH`, install it:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/higgsfield-ai/cli/main/install.sh | sh
   ```
2. If `higgsfield account status` reports `Session expired` / `Not authenticated`,
   ask the user to run `higgsfield auth login` (interactive) and wait for confirmation.
3. `git` and `bun` are used locally once you clone the repo (lifecycle step 2). The
   CLI itself handles create / deploy / status / db / secrets / delete.

## UX Rules

1. Be concise. No raw website IDs, tokens, or JSON dumps in chat. After a deploy,
   return the preview URL (from `higgsfield website status`) and a one-line summary.
2. Never echo the scoped git token back to the user, and never commit it to the repo.
3. Detect the user's language from the first message and reply in it. CLI flags and
   code stay English.
4. Don't stall on scope questions or ask the user to confirm the platform/build
   target — build the fullest reasonable interpretation and iterate on the live
   preview. At most ONE clarifying question, only when no sensible default exists.
5. **Preview is the default and the only environment you deploy on your own.** Deploy
   `--env production` ONLY when the user explicitly asks to publish / go live / ship.
6. Don't screenshot the deployed site unless the user asks — return the URL.

## Website lifecycle (CLI)

Every hosted website tool maps to a `higgsfield website …` subcommand. The build/edit
loop is: **create → repo-access → clone → edit → commit + push → deploy preview.**

1. **Create** the website + its git repo. Prints a `website_id` (add `--json` for the
   raw object). Use that id in every later command.
   ```bash
   higgsfield website create
   ```
2. **Get repo access** — clone URL, branch, slug, and a scoped git token. Clone into a
   directory named after the slug so multiple sites can share the workspace. Pass the
   token via a per-command header so it never lands in `.git/config`.
   ```bash
   higgsfield website repo-access <website_id> --json
   # with the returned repo_url / branch / slug / token:
   git -c http.extraHeader="Authorization: token <token>" clone <repo_url> <slug> && cd <slug>
   ```
   The project lives in `app/` (see Repo layout below).
3. **Edit** the code under `app/`, following the rules below (Stack, Hard rules,
   wow-maker design pass, auth, …).
4. **Commit + push.** Run push as its own step and confirm it succeeded — the deploy
   builds from the pushed branch.
   ```bash
   git add -A && git commit -m "<what changed>"
   git -c http.extraHeader="Authorization: token <token>" push origin <branch>
   ```
5. **Deploy the preview** (default). The platform CI builds from the pushed branch and
   returns the build result; a build/type error surfaces here.
   ```bash
   higgsfield website deploy <website_id> --env preview
   ```
   Deploy production ONLY on an explicit publish/go-live request: `--env production`.
6. **Status / live URLs** any time:
   ```bash
   higgsfield website status <website_id>
   ```

Other commands (all take `<website_id>`; add `--json` for machine-readable output):

- **Database (read-only D1):** `higgsfield website db tables <id>`,
  `db schema <id> --table <t>`,
  `db rows <id> --table <t> [--limit N] [--filter col:op[:value]]`,
  `db query <id> --sql "SELECT …"` (single read-only `SELECT`/`WITH`).
- **Secrets (staged until the next deploy):**
  `higgsfield website secrets set <id> --name NAME --value VALUE`,
  `secrets list <id>`, `secrets delete <id> --name NAME`.
- **List / delete:** `higgsfield website list`;
  `higgsfield website delete <id>` permanently removes the site, database, storage,
  and repo — only on an explicit delete request.

## Stack

- **TanStack Start** (file-based routing under `app/src/routes/`, SSR via
  `app/src/server.ts` → a Worker `export default { fetch }`). No Next/Remix/Astro
  conventions, no `app/src/pages`.
- **Vite 7 + bun**. Build emits `dist/server/server.js` (the Worker) +
  `dist/client` (hashed static assets). Tailwind v4 is wired in `app/src/styles.css`
  (it also imports Quanta's Tailwind entry for the template bundle). Legacy
  shadcn/ui files may exist from the scaffold. **Higgsfield-SDK app surfaces**
  (generation consoles, fnf-backed tools) use Quanta components/tokens; **every
  other site** (marketing, landing, general SaaS/dashboards/tools, portfolios)
  uses custom Tailwind/CSS (per wow-maker) — do not import
  `@higgsfield/quanta/*` for page chrome, heroes, or marketing sections.
- **No separate Hono/Express backend.** Server logic is TanStack **server
  functions** (`createServerFn`) and **server routes**. App-local API routes are
  allowed when a platform contract requires them, for example `GET /api/user`
  as the browser-safe proxy to `https://fnf.internal/user`.

## Hard rules

### 0. Design: build a WOW site from the wow-maker toolkit

There are no fixed templates. For EVERY build — marketing site, app, dashboard, or
the simplest landing — your design source is **`references/wow-maker.md`**: the single
directory of everything that makes a site wow (bespoke AI-generated assets, signature
animation patterns, motion/3D libraries, and copy-paste component/block registries,
all free + permissively licensed). **Read it FIRST and compose a distinctive site
from it; every site must ship a real wow moment.** Do NOT ship generic scaffolding,
and do NOT search the skill library for other design guidance (no `popular-web-designs`,
`design-md`, external landing-page skill) — everything is in wow-maker.

**Our biggest edge: generate bespoke assets** (images, video loops, 3D, OG) with the
Higgsfield generation tools — a site with real generated art looks far cooler than
stock or CSS-only visuals, and the agent under-uses this. wow-maker §1 has the
pipeline; treat asset generation as a default step on every build.

**After** wow-maker, read exactly ONE craft skill for HOW to execute with taste —
which one depends on whether the site integrates the Higgsfield SDK:

- **Default — any site that does NOT use the Higgsfield SDK** (marketing/landing
  pages, portfolios, general SaaS/dashboards/tools): read
  **`references/design-taste-frontend.md`** (the anti-"AI-slop" craft playbook) and
  build custom Tailwind/CSS components. Do NOT import `@higgsfield/quanta/*`, and do
  NOT use `minimalist-ui`.
- **Higgsfield-SDK app surfaces — apps that integrate the fnf SDK** (image/video
  generation, media upload, profile, workspace, credits, generation feed/history):
  read **`references/minimalist-ui.md`** for the craft layer and
  **`references/quanta-design.md`** + the package guide
  `app/packages/quanta/ai/AGENTS.md` to implement. **`minimalist-ui` is for
  Higgsfield-SDK app surfaces ONLY** — never load it for a non-SDK site.

Apply the craft skill's PRINCIPLES (layout variance, hierarchy, typographic
discipline, anti-AI-tell rules, real imagery, motivated motion) **in service of the
wow you're building**. Where a craft skill's assumed stack (Next.js/RSC, `next/font`,
shadcn/Fluent/Carbon, raw `bg-zinc-*` palette) conflicts with this template, **THIS
STACK WINS**. Do NOT ship default, generic-looking scaffolding.

Then route to the FUNCTIONAL skill for the task:

| Task | Read |
|---|---|
| **Design / wow on any build** — bespoke AI assets + signature effects + motion/3D libs + copy-paste components (approved, free) | **`references/wow-maker.md`** (read FIRST, every build) |
| fnf SDK: generation jobs, media upload, profile/workspace/credits, adapters | `references/fnf-sdk.md` + `references/auth.md` + `references/runtime-and-infra.md` |
| React query/cache/controllers for fnf | `references/fnf-react.md` + `references/auth.md` |
| Higgsfield-SDK app UI (generation console, fnf-backed tool) | `references/minimalist-ui.md` + `references/quanta-design.md` + `app/packages/quanta/ai/AGENTS.md` + `references/fnf-sdk.md` + `references/fnf-react.md` + `references/auth.md` |
| Auth, current user, login/logout, `/api/user`, `__auth` routes | `references/auth.md` + `references/runtime-and-infra.md` |
| TanStack Start routes, SSR, server functions, Cloudflare Worker runtime | `references/runtime-and-infra.md` |
| Heavy / long-running work (ffmpeg, headless browser, background jobs), containers | `references/containers.md` |
| SEO meta tags, Open Graph, Twitter Cards, canonical URLs, robots directives | `references/seo-meta-tags.md` |
| JSON-LD structured data, schema.org markup | `references/seo-schema-markup.md` |
| robots.txt, sitemap.xml, security headers, canonicals, redirects, trailing slashes | `references/seo-technical.md` |
| Post-build SEO quality audit | `references/seo-audit.md` |
| GEO optimization for AI search engines (Perplexity, ChatGPT, Gemini) | `references/seo-geo-content.md` |
| Brand entity, knowledge graph, sameAs, NAP consistency | `references/seo-entity.md` |
| Cloudflare Workers security: secrets, global state, streaming, headers | `references/security-worker-hardening.md` |
| Post-build web security audit (OWASP Top 10, XSS, CSRF, insecure defaults) | `references/security-web-audit.md` |
| Threat modeling for websites with auth, user data, or databases | `references/security-threat-model.md` |

Package-local guides are canonical for package APIs (read alongside the relevant
skill when a task touches the package):

| Package | Guide |
|---|---|
| `@higgsfield/quanta` | `app/packages/quanta/ai/AGENTS.md` |
| `@higgsfield/fnf` | `app/packages/fnf/ai/AGENTS.md` |
| `@higgsfield/fnf-react` | `app/packages/fnf-react/ai/AGENTS.md` |

### 0a. Higgsfield packages and template modules

The `app/packages/` directory contains managed snapshots from fnf-web:
`@higgsfield/fnf`, `@higgsfield/fnf-react`, and `@higgsfield/quanta`. Do not
edit these manually unless the task explicitly asks to patch a package snapshot.

Template-owned infrastructure lives in `app/src/module/**`. The Design mode
child bridge lives in `app/src/module/design-inspector`, not in a package and
not in fnf-web.

Higgsfield-SDK app UI uses Quanta tokens/components; every other surface uses
wow-maker + custom Tailwind/CSS. fnf API calls stay server-side.

### 0b. Deploy targets and Design-mode inspector

Deploy with the CLI. `higgsfield website deploy <website_id> --env preview` is the
default and the ONLY environment you deploy on your own. Deploy `--env production`
ONLY when the user explicitly asks to publish, go live, or ship. The platform CI runs
the build on deploy (preview = the editable Design-mode build, production = a clean
public build) and returns the build result — you do not run the production/preview
build scripts yourself.

Supercomputer's in-browser Design mode adds an editable-preview inspector to preview
builds; it is **platform-managed**. The template owns the child-iframe runtime under
`app/src/module/design-inspector`; `fnf-web` owns the parent UI. You never hand-write
inspector code, refs, source markers, or `data-hf-*` attributes; never fold the
inspector build into the production `build` script; and never ship inspector metadata
to production just to make Design mode work.

### 1. SSR-safe rendering
Every route renders on the server per request. NEVER touch browser-only globals
(`window`, `document`, `localStorage`, `navigator`) at module top level or during
render — only inside `useEffect`/event handlers, or guarded with
`typeof window !== "undefined"`. A top-level `window` reference crashes SSR.

### 2. Server-only code stays server-only
Put server logic in `createServerFn(...).handler(...)` or a `*.server.ts` module
(the `.server.ts` suffix keeps it out of the client bundle). Secrets and
bindings are read **server-side, per request** — never shipped to the browser.

### 3. Higgsfield (fnf) calls are BACKEND-ONLY — and your app needs a real backend
Build whatever backend the website needs: your own database (D1), server
functions (`createServerFn`), app-local API routes, sessions, business logic —
that's expected and fully supported, not just Higgsfield glue. **For any website
that uses the Higgsfield SDK this is mandatory, not a nice-to-have: it MUST be a
real end-to-end app — real server functions/routes AND real persistence (D1) —
never a front-end mock (see rule 3a).** This rule is ONLY
about reaching **Higgsfield's** API (fnf): call Higgsfield internal services
exclusively from server code (a server function, server route, or
`*.server.ts`). The platform attaches identity on server egress, so tokens never
live in website code. NEVER call `https://fnf.internal/*` from client components
— route the request through your own server code instead. (Your own backend
endpoints can be called from the client as normal; the restriction is specific
to Higgsfield's API.)

For current user auth, implement `GET /api/user` as a TanStack server route that
calls `https://fnf.internal/user` server-side and returns the upstream status
and JSON unchanged. Browser UI calls `/api/user`. Login/logout are browser
navigations to `/__auth/login?return=<path>` and
`/__auth/logout?return=<path>`. Read `references/auth.md` before touching this.

**If the website uses the Higgsfield (fnf) SDK, adding auth is MANDATORY — not
optional.** Any website that touches the fnf SDK (generation, media upload, job
feed/history, profile, workspace, wallet, credits, or any `https://fnf.internal/*`
call) is an authenticated surface. Before shipping it you MUST implement the
Higgsfield auth contract exactly as written in `references/auth.md`: the
`GET /api/user` server proxy, a signed-out state that links to `/__auth/login`,
`/__auth/logout`, and a server-side auth re-check before every SDK operation.
Read `references/auth.md` and follow it — do not invent your own login UI,
email/password form, or token handling, and do not build anonymous generation
flows unless the user EXPLICITLY asks for an offline/mock demo (see rule 3a —
a mock is never the default).

**Preview sign-in is platform-owned — do NOT improvise a cause if it fails.**
Sign-in is not implemented in the website you build: `/__auth/login` is a
platform-injected route that hands off to Higgsfield's auth service (Clerk),
then redirects back to `return` so `/api/user` succeeds. The generated code's
only job is to navigate to `/__auth/login` and read `/api/user` — both per
`references/auth.md`. So if a user reports sign-in failing or looping on a
PREVIEW, FIRST confirm the website side is correct (it links to
`/__auth/login?return=<path>` and proxies `/api/user` unchanged); if it is, the
failure is on the platform/auth side (the Higgsfield auth service / Clerk
instance config), NOT the generated website. Say so plainly instead of inventing
a website-code cause (e.g. "cookies are scoped to the prod domain"). Only change
website code if it actually deviates from the `references/auth.md` contract.

Choose the auth mode by what the website is doing:

- **Higgsfield auth** is mandatory for Higgsfield SDK/model features: image/video
  generation, media upload, profile, workspace, credits, and generation history.
  Use `/api/user`, `/__auth/login`, `/__auth/logout`, and server-only
  `https://fnf.internal` calls.
- **In-app auth** is for the generated product's own users: todo accounts,
  SaaS team members, dashboards, notes, CRM users, and other app-local identity.
  Implement it with the website's own routes/storage and do not call
  `https://fnf.internal/user` unless the website also uses Higgsfield SDK features.
- If a website needs both, keep them separate. Higgsfield auth gates paid
  generation/profile/workspace operations; in-app auth gates the product's own
  data. Never replace Higgsfield auth with app-local auth for generation, and
  never use Higgsfield auth as fake product-user accounts unless the prompt asks
  for a Higgsfield-authenticated tool.

If the user prompt asks for a model/generation website, even casually, treat auth,
profile, credits/workspace display, and a generation feed/history as mandatory
acceptance criteria. Example: "create a form app for Nano Banana generation 2"
means build the form **plus** sign-in/logout, `/api/user`, profile/credits/
workspace UI, SDK submit/cost/media upload routes, polling until terminal
status, and a feed/history panel that renders real image/video previews for
submitted and historical generations. Do not wait for the user to explicitly ask
for those.

Generation history cards must render SDK `Generation.results`, not status-only
placeholders. Use `app/src/lib/higgsfield-generation-results.ts` and
`app/src/components/higgsfield-generation-card.tsx`, or an equivalent component
with the same URL precedence: optimized image preview first, video thumbnail as
poster when present, raw URL for playback/open/download. Show prompt, model,
status, and created time where available. A completed job without a result URL
must show an explicit "preview unavailable" state with refresh/get behavior.

When creating SDK clients in generated websites, use only
`createWorkflowPlatformAdapter({ baseUrl: 'https://fnf.internal' })` from
server-side code. Do not use public/dev fnf URLs, env-selected backend URLs,
`createFnfWebAdapter`, `createDevFnfWebAdapter`, apps-marketplace adapters,
bearer tokens, or dev user headers in generated website code.

This is a generated-template policy. The SDK package itself is adapter-based; if
the user explicitly asks to build a separate non-Supercomputer integration with
another approved backend, use that host's adapter or a custom SDK backend port
instead of applying this template-only restriction.

### 3a. A Higgsfield-SDK app is end-to-end — real backend + real DB, never a mock

Any website that uses the Higgsfield SDK (generation, media, profile, workspace,
credits, or any `https://fnf.internal/*` call) MUST ship as a real, end-to-end
product — NOT a front-end mock, prototype, or "demo" that fakes the backend. This
is a hard requirement, on the same footing as the auth contract above.

An SDK app MUST have all three:

- **A real backend.** Every data operation (submit, poll, save, list, mutate) runs
  through a TanStack **server function** or **server route** — fnf calls
  server-side, reads/writes server-side. No client-only data layer standing in for
  a backend.
- **Real persistence (D1).** Opt into D1 (`"db": true` in `app/app.manifest.json`,
  rule 6) and persist the app's OWN product state: saved/favorited generations,
  collections/galleries, named projects, prompt presets, share/publish records,
  in-app user data, settings — whatever the product remembers between sessions.
  Add the schema in `app/migrations/000N_*.sql` (additive; rule 5).
- **Real fnf integration.** Generations, media, profile, and credits come from the
  live SDK against `https://fnf.internal` (rule 3), never hardcoded fixtures.

fnf is the source of truth for the generations themselves — do NOT mirror fnf's
tables into D1. D1 is for YOUR product layer on top of fnf (the "saved",
"organized", "shared", "annotated" state fnf doesn't own). A generation app with
zero app-owned state is almost always under-built: at minimum let users save and
organize what they make.

**These are NOT a backend and are bugs in an SDK app:** in-memory arrays or
module-level state as "the database"; `localStorage`/`sessionStorage` as the
persistence layer; hardcoded / fixture / `lorem` data standing in for real records;
a static JSON file faking a list endpoint; `setTimeout` faking request latency;
memory/mock SDK adapters shipped as the product; TODO stubs where a write belongs.

The ONLY exception is when the user **explicitly** asks for an offline/mock demo
(an "offline demo", "no backend", "static prototype", memory-adapter sample) —
then say plainly that it is a mock and why. Absent that explicit ask, build the
real thing; never downgrade to a mock as the "safe" default.

### 4. Cloudflare bindings via `cloudflare:workers`
Any infra you opt into (D1 `DB`, R2 `STORAGE`, KV `KV`) is read server-side
through `app/src/lib/bindings.server.ts` (`import { env } from "cloudflare:workers"`).
Each binding is present ONLY if declared in `app/app.manifest.json`, so the typed
accessors are optional — guard before use. Do not thread `env` through React
props or read it at module top level.

### 5. Opted-in storage is SHARED — preview data == prod data
If you opt into D1, R2, or KV, each is a SINGLE instance **shared by the preview
and prod deploys**. Only the CODE is split (`vars.HF_ENV`). The DATA is not.
- `env.HF_ENV` tells you which env it is; it CANNOT switch the database / bucket /
  namespace.
- A destructive migration or write you run "just to test on preview" hits
  **production data**. Prefer additive migrations (`CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN`); avoid `DROP`/destructive `UPDATE` unless you mean prod.

### 6. `app/app.manifest.json` declares infra — NOTHING is provisioned by default
A new website gets **no D1, no R2, no KV, no Durable Object** — `app/app.manifest.json`
ships every service OFF. Opt in only when the website actually needs it:
- `"db": true` → a D1 database, bound `env.DB`
- `"r2": true` → an R2 bucket, bound `env.STORAGE`
- `"kv": true` → a KV namespace, bound `env.KV`
- `"durableObject": "ClassName"` → a Durable Object, bound `env.ROOMS`
- `"container": true` (or `{ "instanceType", "port", "sleepAfter" }`) → a Docker
  container for heavy / long-running work, bound `env.CONTAINER` — see
  `references/containers.md`

Counts are capped (≤1 each) by the platform, which PROVISIONS the resource and
binds it in an authoritative config at deploy. The committed `app/wrangler.jsonc` is
build/dev input only (used by `wrangler dev`); the platform OVERWRITES its `name`
+ bindings at deploy, so editing a binding there does not change the deploy —
declare infra in `app/app.manifest.json`.

**KV is eventually consistent** (it is NOT Redis): use it for config, feature
flags, and cached reads — NOT for counters, locks, or read-after-write. Reach
for a Durable Object when you need strong consistency.

For a **Durable Object** you must ALSO `export class ClassName extends
DurableObject {…}` from `app/src/server.ts` (alongside the default `{ fetch }`
export) so the class ships in the Worker.

For a **container** — heavy or long-running work a Worker can't do (ffmpeg, a
headless browser, a 30-minute job): set `"container"` in the manifest and follow
**`references/containers.md`**. It has the exact `app/container/Dockerfile`, the
platform-fixed `AppContainer` class (a Durable Object you export from
`app/src/server.ts`), the keep-alive + 3-hour-deadline pattern that long jobs
REQUIRE (or the container is idle-killed mid-job), and how a background container
calls fnf via a container token. Containers are **off by default**.

## Editing map
- Pages / routing → `app/src/routes/**` (file-based; `__root.tsx` is the shell).
- Server logic → `createServerFn` (see `app/src/lib/api/example.functions.ts`) or
  `*.server.ts`.
- Bindings access → `app/src/lib/bindings.server.ts`.
- Infra declaration → `app/app.manifest.json`; `app/wrangler.jsonc` = build/dev input.
- Durable Object class → exported from `app/src/server.ts`.
- Container (heavy/long jobs) → `app/container/Dockerfile` + the `AppContainer`
  class in `app/src/server.ts`; recipe in `references/containers.md`.
- Components → **Default builds (marketing, landing, general SaaS/tools):** custom
  components built per wow-maker; app-local files in `app/src/components/**`.
  **Higgsfield-SDK app builds:** Quanta imports from `@higgsfield/quanta/*`,
  app-local wrappers only when composition is app-specific. Do not start from
  `app/src/components/ui/*` unless migrating a legacy shadcn piece (restyle it to
  the site's tokens, or to Quanta tokens on an SDK app surface).
- Generation result UI → use `app/src/components/higgsfield-generation-card.tsx`
  and `app/src/lib/higgsfield-generation-results.ts` for SDK-backed feeds and
  post-submit polling output. Do not render completed generations as blank boxes
  with only status/id text.
- Styles / theme → `app/src/styles.css` wires Tailwind v4 (Quanta CSS is imported
  for the template bundle). **Default builds:** a custom token layer per
  wow-maker — no q-prefixed utilities. **Higgsfield-SDK app builds:**
  native Tailwind spacing (`p-4`, `gap-2`) + Quanta semantic utilities
  (`bg-q-background-primary`, `text-q-body-md-regular`). Keep Quanta package tokens
  in `app/packages/quanta`; do not redefine them unless patching the package snapshot.
- D1 schema → `app/migrations/000N_*.sql` (additive; see rule 5).

## Verify

The trusted platform CI builds the website on **every deploy** (preview →
editable Design-mode build, production → clean public build), so a deploy already
gives you the authoritative type + build result. Do NOT reflexively `bun install` +
`bun run build` (or lint, or any other local install/build) just to check your
work — that repeats the build the deploy is about to run and makes the user sit
through two builds back to back. The platform CI provisions infra and deploys/migrates.

**Default: make your edits, push, and deploy the preview**
(`higgsfield website deploy <website_id> --env preview`) — never production unless the
user explicitly asked to publish. Let the deploy build surface any type or build error
and report it back — no `node_modules`, no local build needed for a normal content/UI
edit.

**Do NOT take a screenshot of the deployed website** (e.g. via the browser
tool) unless the user explicitly asks for one. Return the preview URL and let
the user open it — screenshotting is slow, often unnecessary, and not something
the user asked for by default.

**Run the local checks only when you actually need them** — from `app/`:
```bash
cd app
bun install          # only when you changed dependencies / package.json
bun run typecheck    # tsc --noEmit
bun run build        # production-clean build: no inspector runtime or source metadata
bun run build:design # editable Supercomputer preview build with WeakMap source registry
bun run build:prod   # alias for the production-clean build
```
Run them only when the work genuinely requires it, e.g.:
- You added, removed, or upgraded a dependency, or edited `package.json`.
- You changed build/runtime config (`vite.config.ts`, `tsconfig*.json`,
  `wrangler.jsonc`, `app.manifest.json`).
- You are debugging a build or type error and need the local output to iterate.
- A command you must run genuinely needs `node_modules` present.

For a small, isolated edit (copy, styling, a self-contained component), skip the
local install/build and let the deploy verify it.

**Before claiming a build done / deploying, no placeholders may remain.** Run
`bun run qa:fill -- --strict` (add `--url <preview>` to also scan the rendered
page). It fails if any template placeholder survives — a `<...>`-style token
(e.g. `"<brand name>"`), `lorem ipsum`, or the scaffold blank-page marker
(`REMOVE_THIS` / `blank-app-v1`). On a freshly scaffolded website it flags the
blank-page placeholder by design — that just means nothing has been built yet.
It is a completion gate, not a CI build step.
