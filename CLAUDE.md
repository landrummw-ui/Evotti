# Evotti Apps — Codebase Map

Internal application platform for **Evotti Boats** (Elkhart, IN). One home page,
role-based apps, exact numbers, and AI agents that answer in plain English.
This file orients a human (or an AI assistant) to what's where and how it fits.

---

## Stack & principles

- **Frontend:** vanilla HTML/CSS/JavaScript. **No framework, no build step, no
  TypeScript.** Every chart is hand-rolled inline SVG. A page is just files that
  load as `<script>`/`<link>` — many render straight from disk.
- **Backend:** **Netlify Functions** (Node, global `fetch`, esbuild bundler) for
  anything that needs a secret (the AI agents, user admin).
- **Data/Auth:** **Supabase** (Postgres + Row-Level Security + Auth).
- **AI:** Anthropic Messages API, agentic tool-use loop. The model decides *what*
  to compute; deterministic JS does the math — so answers are **exact, never
  hallucinated**. Every agent degrades to a keyword parser with no API key.
- **Deploy:** push to **`main`** → Netlify builds and deploys. No manual step.

## Run / deploy

- **View locally:** open any app's `index.html` in a browser, or serve the repo
  root (`python3 -m http.server`) and visit `/sales/`, `/dashboard/`, etc.
  Static pages + data render offline; the AI agents need the deployed functions.
- **Deploy:** `git push origin <branch>:main`. Netlify config is in `netlify.toml`
  (functions dir + esbuild). Secrets (`ANTHROPIC_API_KEY`, Supabase service key)
  are set in the Netlify dashboard, not in the repo.
- **Regenerate demo data:** `python3 scripts/gen_sales_data.py` and
  `python3 scripts/gen_huntington_data.py` (deterministic; see below).

---

## Directory map

### Launcher & shared shell
- **`index.html`** — the app launcher. Persona switcher ("Viewing as …") + the
  tile catalog. Tiles are defined in one `TILES` object; each persona lists which
  tiles it sees; **live tiles sort to the top** of the grid automatically. The
  switcher is the *no-login demo stand-in*.
- **`platform/`** — the real shared shell: `platform.css` (brand tokens/styles),
  `platform.js` (one Supabase client + auth helpers: who's signed in, their
  persona/dealer, tile access, `Evotti.gate(...)` page gating), `config.js`
  (Supabase URL + **publishable** key — safe in client; RLS governs access).
- **`login.html`** — real Supabase Auth sign-in. `admin/` — user-admin console
  (Leadership only). `assets/` — logos. `robots.txt` — keep the site unindexed.

### Apps (each is a self-contained folder)
- **`sales/`** — Sales Analysis. `index.html`, `styles.css`, `app.js` (dashboard +
  agent drawer), `charts.js` (`SalesCharts`: hand-rolled line/grouped/variance
  SVG — reused by other apps), **`query.js`** (the shared UMD query engine — see
  below), `data.js`/`sample-data.json` (generated data).
- **`dashboard/`** — Daily Dashboard: the per-persona morning briefing. Summary
  cards with an **Expand-to-detail** modal. Anchor card = **Huntington** floor-plan
  payoffs/balance (`huntington-data.js`/`.json`, generated).
- **`infolink/`** — Retail Registration Data (InfoLink) market intelligence.
  `app.js` (spotlight + leaderboard + "Ask the market" agent), **`market.js`**
  (shared UMD engine over the received report), `data.js` (generated from the
  report). Reuses `../sales/charts.js`, retinted teal via `styles.css`.
- **`voice/`** — the sales agent, hands-free (Web Speech API), as a phone
  home-screen PWA. Single-shot. Launcher tile is intentionally hidden.
- **`dev/`** — Kanban board (AI App & Agent Development pipeline), Supabase-backed
  shared state. `crm/`, `dealer/` — additional app surfaces.

### Backend
- **`netlify/functions/ask.js`** — Sales agent. Tool `query_sales` over
  `sales/query.js` + `sales/sample-data.json`. Agentic loop; the model marks one
  query `present` to drive the chart; deterministic compute for every number.
- **`netlify/functions/infolink-ask.js`** — Market agent. Tool `query_market`
  over `infolink/market.js` + `reports/infolink-pontoon-ttm.json`. Same pattern.
- **`netlify/functions/admin-users.js`** — user create/update/delete (holds the
  Supabase **service-role** key server-side; verifies caller is Leadership).
- Both agents default to `claude-sonnet-5`; set `ANTHROPIC_MODEL` (e.g.
  `claude-haiku-4-5`) to switch. No key → keyword-parser fallback.

### Data
- **`reports/`** — external reports Evotti **receives** (inbound feeds), with a
  `registry.json` manifest. Holds the InfoLink workbook + parsed JSON. (Distinct
  from the *self-writing report library* concept, which is agent-generated.)
- **`scripts/`** — deterministic Python generators (fixed RNG seeds, so re-running
  reproduces byte-identical data). `gen_sales_data.py` → sales data + seed;
  `gen_huntington_data.py` → Huntington data. **Edit these, not the generated
  `data.js`/`.json`/seed files.**
- **`supabase/`** — SQL. `*_schema.sql` (tables + RLS), `*_seed.sql` (data). Run
  once in the Supabase SQL editor. Demo RLS is intentionally open (`anon` read).

### Docs
- **`DEMO.md`** — the demo playbook / sales script (flow, talking points,
  anticipated questions, data/cost/access, roadmap). **`README.md`**, this file.

---

## Shared engines (the important pattern)

`sales/query.js` and `infolink/market.js` are **UMD modules** — the *same file*
runs in the browser (`window.SalesQuery` / `window.InfoLink`) and under Node
(the Netlify functions `require()` them). This is why a number computed for the
dashboard and a number computed by the agent are always identical: there is one
implementation. When changing calculation logic, change it here.

## Domain model (current demo data)

- **Territories (7):** Payne, Good, Girten, Wyland, Robinson, Cooper, Canada.
- **Product lines (4):** 400, 500, 700, 900 (ascending size/price).
- **Dealers (14):** two per territory; dealers roll up to territories.
- **Sales grain:** one row per workday × dealer × model line, with actual **and**
  plan for units **and** revenue (Feb–Jul 2026, workdays only).
- **Huntington grain:** one row per boat (**HIN**) — advance, floor date, payoff.
- **InfoLink grain:** one row per make × trailing-12-month period (units, share).

## Conventions

- Match the surrounding code: vanilla JS, no dependencies added lightly.
- Generated files are produced by `scripts/` — never hand-edit them.
- Brand: crimson `#a83435` / charcoal; each app may retint via CSS variables.
- Keep the site unindexed (`robots`, `noindex`) until real auth is fully on.
- Deploy is `push → main`. Develop on a feature branch, promote to `main`.
