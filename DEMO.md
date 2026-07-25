# Evotti Apps — Demo Playbook

**Audience:** CFO + Controller (the decision-makers), Monday
**Also this weekend:** brother-in-law (Evotti sales exec) kicking the tires
**Goal:** Show Evotti isn't buying a report tool — it's standing up a *platform* its team runs on: one login, every role's apps, exact numbers, and an AI that answers in plain English and gets smarter (and cheaper) with use.

> Demo-ready. This is your at-a-glance script — bite-size lines to say, plus answers to the questions finance will ask.

---

## The one-line story

> "Every tool your team runs on, in one place — exact numbers, plain-English answers, and it learns your business as you use it."

Lead with **platform**, not features. The tiles, the personas, the shared data, the two agents — one system, not five demos.

---

## The 30-second frame (open with this)

- **One place.** Everyone logs in here; each role sees only their apps.
- **Exact, never invented.** The AI decides *what* to calculate — our code does the math. Numbers always tie out.
- **It compounds.** Every question can become a saved report; every correction becomes a remembered rule. It gets more valuable *and cheaper* over time.
- **Built on your data, owned by you.** Standard, swappable parts. No per-seat license, no black box.

---

## Pre-demo checklist (do before Monday)

- [ ] **Anthropic key live.** Set `ANTHROPIC_API_KEY` in Netlify → add `ANTHROPIC_MODEL=claude-haiku-4-5` → **redeploy**. One key powers **both** agents (Sales + InfoLink). Without it, both fall back to the keyword parser — fine, but real Claude handles any phrasing.
- [ ] **Kanban seeded.** `supabase/dev_schema.sql` run once (board loads with cards, not a "setup needed" notice).
- [ ] **Voice app on your phone.** Open `…/voice/` → Add to Home Screen. Pocket ace — best on Android; iPhone use the typed fallback.
- [ ] **Smoke test, in order:**
  - [ ] Launcher: switch personas (Leadership → Sales → Controller → Dealer); tiles change per role
  - [ ] Daily Dashboard: Huntington + yesterday's sales cards load; click **Expand** to open the filterable detail
  - [ ] Sales Analysis: ask a free-form question → real numbers + a branded chart
  - [ ] InfoLink: Evotti spotlight + leaderboard load; ask "who's gaining share?" → answer + chart
  - [ ] Kanban: board loads, drag a card, it sticks on reload
  - [ ] Voice: "How were sales yesterday?" → it speaks back
- [ ] **Canned questions ready** (below), in case the room goes quiet.

---

## Demo flow (suggested order)

1. **Launcher + personas.** Point at the "Viewing as" switcher; flip roles. *"Users log in — the persona is attached to their account. Sales sees these apps, the Controller sees those, a dealer lands on their own page. Live apps sort to the top."* Sells platform + access control in 15 seconds.
2. **Daily Dashboard — the morning briefing.** This is the landing page. *"Every role opens to their own at-a-glance briefing."* Show the **Huntington floor-plan** card (payoffs this month + outstanding balance) and **yesterday's sales**. Hit **Expand** on Huntington → the full filterable, by-dealer, drill-to-HIN report. *"Executives read the headline; the detail is one click away."*
3. **Sales Analysis — standard reporting.** Daily actuals vs plan, territory × model line, quarter view, filters, maximize a tile. *"Everything a normal BI tool does."*
4. **Sales Analysis — the agent (the wow).** Type a plain-English question. *"The model interprets the question; the numbers come from the same engine as the dashboard — exact, never made up."* Then a comparison: *"main drivers of variance between Q2 and Q1."*
5. **InfoLink — the agent on data we don't even own.** Open Retail Registration. Land on the Evotti spotlight (*"we just entered pontoons"*), then ask *"who's gaining share the fastest?"* *"This is a report we buy from InfoLink — same AI capability, pointed at competitive intelligence. Any report we receive can land here and get this treatment."*
6. **Kanban — how we run the build pipeline.** *"Request → go-live, with SLAs. This is the governance of what gets built next."* Ties into the feedback vision.
7. **"One more thing" — voice.** Pull out your phone, tap the tile, ask out loud, let it talk back. Don't over-explain; let it land.

---

## What's live today (built and working)

| App | What it does |
|---|---|
| **Launcher + personas** | One home; role-based app catalog; live apps float to the top |
| **Daily Dashboard** | Per-role morning briefing; summary cards with **Expand-to-detail**; Huntington floor-plan payoffs + balance, yesterday's sales |
| **Sales Analysis** | Daily actual-vs-plan by territory × model, quarter view, filters, CSV — **plus** a plain-English agent |
| **InfoLink (Retail Registration)** | Competitive market-share intel from a received InfoLink feed, **plus** a second agent |
| **Voice** | The sales agent, hands-free, on a phone home screen |
| **Kanban (AI Dev)** | Shared, live pipeline board (Supabase) — request to go-live with SLAs |

---

## Feature talking points (bite-size)

### The platform (launcher + personas + access)
- Not one-off apps — a **catalog of tiles** driven by who you are.
- **Users authenticate; persona is a field on the account.** Dealers are tied to their own company.
- *"Full login gets wired up as we go live — today's switcher just shows what each role sees."*

### Daily Dashboard (the landing page)
- **Per-role, not a toggle.** Each persona opens to its own briefing — leadership and controller see Huntington across all dealers with filters; a dealer sees only their own account.
- **Summary-first.** Cards show the headline number at a glance; an **Expand** button opens the full filterable detail. *"Executives shouldn't have to click to see the number."*
- **Huntington floor-plan** (the anchor card): dealer payoffs to Huntington this month and outstanding balance, at HIN level. (~156 boats on the floor, ~$13.2M outstanding; ~$9.3M paid off month-to-date.) Payoffs only for the demo — interest/fees deliberately out of scope.
- Other cards (yesterday's sales, production/pipeline/cash) show the pattern; real data drops in the same slots.

### Sales Analysis
- Daily, workday-only data (Feb–Jul), **territory × model line**, actual **and** plan, down to the dealer.
- Standard reporting **plus** a natural-language agent — answer *and* chart, the chart chosen to fit the question (ranking, trend, comparison, variance).
- **Exact by construction:** the model picks *what* to compute; deterministic code does the math. No hallucinated numbers.
- Branded to Evotti, with a key on every chart.

### Retail Registration Data / InfoLink (competitive intelligence)
- **A report Evotti *receives*** — InfoLink's industry feed of new pontoon registrations and market share by make, five trailing-12-month periods (May '22 → '26). Inbound source data, not something we generate.
- Leads with the **Evotti spotlight**: we just *entered* pontoons (0 → 281 registrations, 0.60% share, #24 of 52) in a shrinking market (63.2K → 46.9K). Plus a share-trend chart and a full leaderboard (Evotti pinned).
- **A second agent, on someone else's data:** *"Who's gaining share fastest?"* (Sea Doo +5.6pts; Barletta +2.9), *"How is Evotti doing?"*, *"Is the market growing?"* — same exact-by-construction pattern.
- *"We land it in the platform, and the same AI reads it — competitive intelligence gets the plain-English treatment too, not just our own sales."*

### Voice (pocket demo)
- Same agent, hands-free, on a phone home-screen tile. Ask → hear a punchy answer → see it on screen.
- *"The analysis you just saw, in your pocket, by voice."*

### Kanban — AI App & Agent Development
- Shared, live board (Supabase) — everyone sees the same pipeline.
- Request → Requirements → Dev → QA → UAT → Deploy → Go-Live, with business-day SLAs and green/yellow/red status.
- The visible governance of *how we decide what to build next.*

---

## Under the hood — the part finance will ask about (data, cost, access)

### How the data is structured
- **One conformed model, shared vocabulary.** A *dealer*, a *territory*, a *model line*, a *month*, a *HIN* mean the same thing in every app. That's what lets one question span apps.
- **Grain is explicit per fact:**
  - Sales — one row per **workday × dealer × model line**; dealers roll up to territories; every row carries actual *and* plan for units *and* revenue, so variance computes at any level (day → quarter, dealer → territory → company).
  - Huntington — one row per **boat (HIN)**: advance, floor date, payoff; rolls up to dealer and territory.
  - InfoLink — one row per **make × trailing-12-month period**: units and market share.
- **Why it matters:** *"Because the numbers are modeled once and consistently, the dashboard, the agent, and the voice app all read the same truth — nothing to reconcile between them."*

### The cost story (cheap to run — and it bends *down*)
- **Infra is near-zero.** The apps are static files on a CDN — no servers to keep running. The database (Postgres) and the AI functions are **pay-per-use**: you pay when someone asks, not to keep lights on.
- **No per-seat license.** Unlike a BI tool, adding a user costs nothing.
- **AI cost is controlled by design.** The model only decides *what* to compute; our code does the math. Less model work per answer = fewer tokens, and **no runaway "reasoning" loops** — the biggest source of surprise AI bills is engineered out.
- **Model tiering.** Everyday questions run on a small, fast, cheap model (Haiku); bigger models are reserved for when they're actually needed.
- **It gets cheaper as it matures.** Once a question becomes a saved report, repeat asks run the stored report at **near-zero model cost** (see report library). The library grows, the cost curve bends down.
- **The line:** *"Hosting is pennies, AI is metered and controlled, and the marginal cost of the next question trends toward zero."*

### Security & access
- **Secrets stay server-side.** The AI key and every credential live in the backend — **never in the browser**.
- **Access by user + persona.** Dealers are scoped to their **own company** via row-level security in the database — they cannot see each other's numbers.
- **Private by default.** The site is unindexed (won't show up in search); full login (UAC) lands as we go live.
- **Auditable.** When the memory layer ships, every rule the agent follows traces to the person who said it and when (see feedback layer).
- **The line:** *"Your data stays in your control — your database, your keys, access scoped by role, an audit trail behind every AI behavior."*

### Cross-system access
→ See **the Unified Data Platform** below — the answer to *"how do all these systems talk to each other?"*

---

## Speak to (don't demo): the feedback & memory layer

> Not built yet, **not** demoed. A **vision talking point** — speak to it, don't click it. Deliberate: worth building right, once there's a contract.

**The pitch:**
> "Every answer has a thumbs up / thumbs down and a comment box. If the feedback is *'you should have known this'* or *'present it this way,'* the agent turns it into a remembered rule — so it never makes that mistake twice. It learns **your** business, not a generic model. If the feedback needs a system change, it lands in an admin queue I work from. And the same loop runs on every app, so the whole platform compounds."

**Tune to the room:**
- **Controller → governance.** *"Every rule the agent follows traces to the exact sentence a real person said, who approved it, and when. Nothing enters automatically. It's an auditable trail, not a black box."*
- **CFO → compounding value.** *"A report tool is worth the same on day 100 as day 1. This gets more valuable every week — it's absorbing the institutional knowledge that usually lives in three people's heads."*

**Why it's credible, not vapor:**
- The persona/admin model is already in place — the triage console is a natural extension.
- Supabase already persists shared data (the Kanban proves it) — memory rides the same rails.
- The agent already separates interpretation from computation — which makes remembered rules safe to inject.
- *"The plumbing's in place. It's a defined build, not a research project."*

---

## Speak to: the self-writing report library

> Vision talking point — the natural extension of the dynamic agent. Same "speak to, don't demo" posture.

Behind the agent sits a **report registry** — a growing library of named, defined reports. Ask a question:
- Matches a defined report → the agent **runs it**.
- New → the agent **builds it, answers, and saves the definition** — the next person gets it instantly.

**The pitch:**
> "Standard reporting *and* an agent — and the agent turns new questions into new standard reports. The reporting suite grows itself, and I curate the best ones into your official library."

**Why this controls cost (the part a CFO leans in on):**
An open-ended agent reasoning from scratch every time is the runaway-token risk. The registry caps it: once a report is defined, a repeat question **runs the stored report — deterministic, near-zero model cost.** The expensive thinking happens *once*; after that it's cheap execution. Cost goes **down** as the library matures, and the runaway tail is bounded.

**Ties to governance:** agent-created reports are proposals; you promote the good ones to "official," rename, or retire — same admin console as the feedback layer.

> **Note:** this is different from **received reports** like InfoLink. Received reports are *inbound* feeds we ingest (see the report directory, `reports/`). The report *library* is reports the platform *generates*. Two different things — both land in the platform.

---

## Speak to: the Unified Data Platform

> Vision talking point — the foundation everything runs on with live data. The answer to *"where do the numbers actually come from?"* and *"how do the systems talk?"*

Today the demo runs on a conformed mock dataset (and one real received feed, InfoLink). Production stands up a **Unified Data Platform (UDP)** — one governed place where data from every system lands, is modeled once, and feeds every dashboard and agent.

**The pitch:**
> "We pull from NetSuite, Huntington, the CRM — through their APIs where they have them, scheduled file feeds where they don't — and land it in one conformed model. A boat, a dealer, a HIN, a month means the same thing everywhere. The apps read from that one platform, not from a dozen systems directly."

**The line that sells it — APIs are the pipes; the UDP is the reservoir:**
> "Having an API to each system isn't the same as having a data platform. An API gives you one system's data, in its own language, as it looks right now. The platform gives you all of them joined, speaking one language, with history — so you can ask a question that spans NetSuite *and* Huntington *and* the CRM in one breath, in a second, instead of hammering three live systems."

**What direct-API-only can't do (and the UDP does):**
- **Cross-system joins** — ERP receivables + Huntington payoffs + CRM pipeline in one query.
- **History / time-series** — "what was the floor-plan balance on March 3." APIs give you *now*; the platform remembers.
- **Speed & resilience** — queries hit our store, not vendor rate limits and uptime.
- **One vocabulary** — conformed keys and definitions, so every report ties out.

**Tune to the room:**
- **CFO → single source of truth.** *"One set of numbers the whole company agrees on, instead of finance, sales, and dealers each reconciling their own export."*
- **Controller → governance & cost.** *"Data lands once, definitions are controlled, access is by persona — and the agent reads from the platform, not live ERP calls, so it's fast, auditable, and doesn't run up cost or rate limits."*

**Why it's credible, not vapor:**
- You're **already looking at a UDP in miniature** — every app reads from one conformed model, not raw source tables. This is that pattern with real pipes.
- **Supabase can be the platform to start** — Postgres, already our backend; the access work is the same layer. No new vendor on day one.
- Build it **incrementally** — start with ERP/sales + Huntington, prove the loop, add systems as we go. We don't boil the ocean.
- Honest caveat: **NetSuite has excellent APIs; Huntington's floor-plan data is likely a scheduled file feed, not a live API.** Normal — the platform ingests both, which is exactly why you want it.

---

## Anticipated questions (the deal-closers)

| They ask | You say |
|---|---|
| **"Is the data real?"** | "Realistic mock for the demo — except InfoLink, which is a real received feed. Everything's wired to run on live Evotti data the same way." |
| **"Can it make up numbers?"** | "No. The model only decides *what* to calculate; the math is deterministic code. The number is always exact and ties to the dashboard." |
| **"How is this different from Power BI / Tableau?"** | "BI shows you charts and waits for you to know the question. This *answers* the question in plain English with exact numbers, tailored to Evotti — plus voice, per-role apps, competitive intel, and a workflow board. And no per-seat license." |
| **"What does it cost to run?"** | "Hosting is pennies — static apps, pay-per-use database and AI. No per-seat fees. AI cost is controlled by design and trends down as the report library grows. *(cost story above)*" |
| **"How do we keep AI cost from running away?"** | "Two guards: the model does interpretation only, not open-ended reasoning; and defined reports run deterministically at near-zero cost. The expensive thinking happens once. *(report library)*" |
| **"Where does the data come from? / Do we need a warehouse?"** | "One Unified Data Platform — NetSuite, Huntington, CRM. APIs are the pipes; the platform is the reservoir the apps read from. *(UDP pitch)*" |
| **"If we have APIs to everything, isn't a platform redundant?"** | "An API gives you one system's data as it looks right now. The platform gives you all of them joined, in one language, with history — the part no single API can do." |
| **"Is it secure? Who can see what?"** | "Secrets stay server-side, never in the browser. Access is by user + persona; dealers are scoped to their own company by row-level security. Private by default; full login as we go live." |
| **"Can dealers see each other's numbers?"** | "No — row-level security scopes each dealer to their own company." |
| **"How long until it's on real data / in production?"** | "The foundation's built. Going live is an integration per source — NetSuite first, then Huntington. Incremental, value at each step; weeks per source, not a multi-quarter project." |
| **"What if you (the builder) get hit by a bus?"** | "Plain, standard web tech and SQL — no exotic framework, no black box. It's documented and in your repo. Any competent developer can pick it up." |
| **"Do we own it? Are we locked in?"** | "You own the code and the data. It runs on standard, swappable pieces — static hosting, Postgres, a metered AI API. Nothing proprietary to be trapped in." |
| **"How does it get better over time?"** | *(feedback & memory pitch)* |
| **"How hard is [feature X]?"** | "The foundation's built — most of what you're imagining is a defined build on top, not a rebuild." |

---

## Held back / roadmap (mention as direction, don't show)

- **Feedback + memory layer** — the compounding-value story.
- **Self-writing report library** — grows itself and *lowers* token cost as it matures.
- **Unified Data Platform** — one conformed reservoir fed from NetSuite/Huntington/CRM.
- **Full UAC / real logins** — persona switcher is the demo stand-in.
- **Planned tiles:** Dealer Portal, Build Tracker, Warranty & Service, Options & Pricing, Marketing, Web Applications.
- **Voice** is intentionally hidden from the launcher — pull it out as the "one more thing."

---

## Notes & risks

- **Voice on iPhone:** listening can be flaky in Safari; the typed box always works and the spoken answer works everywhere. iPhone-heavy room → lead with the typed agent, use voice as the flourish.
- **Don't show too much.** Keeping the feedback loop and full UAC as *talked-to* vision is deliberate — it signals depth without implying it was easy.
- **The link is private** (noindex + robots), but there's no login yet — treat the URL like a house key until UAC is on.
- **If the key isn't set,** both agents still answer via the built-in parser — you won't be caught out, but real Claude is far smoother, so confirm the redeploy landed.
