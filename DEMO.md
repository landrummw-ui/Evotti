# Evotti Apps — Demo Playbook

**Audience:** CFO + Controller (key players), Monday
**Also this weekend:** brother-in-law (Evotti sales exec) kicking the tires
**Goal:** Show that Evotti isn't buying a report tool — it's standing up a *platform* its team runs on, one that gets smarter with use.

> Working draft. We'll reorganize and tighten this today/tomorrow before Monday.

---

## The one-line story

> "Every tool your team runs on, in one place — and it learns your business as you use it."

Lead with **platform**, not features. The tiles, the personas, the shared data, the agent — they're one system, not four demos.

---

## Pre-demo checklist (do before Monday)

- [ ] **Anthropic key live.** Set `ANTHROPIC_API_KEY` in Netlify → add `ANTHROPIC_MODEL=claude-haiku-4-5` → **redeploy**. (Without this, the sales agent runs on the keyword fallback — fine, but real Claude handles any phrasing.)
- [ ] **Kanban seeded.** Confirm `supabase/dev_schema.sql` has been run once in Supabase (board loads with cards, not the "setup needed" notice).
- [ ] **Voice app on your phone.** Open `…/voice/` → Add to Home Screen. This is your pocket ace — best on Android for live voice; iPhone use the typed fallback.
- [ ] **Smoke test, in order:**
  - [ ] Launcher: switch personas (Leadership → Sales → Controller → Dealer), tiles change per role
  - [ ] Sales Analysis: ask a free-form question, confirm it answers with real numbers + a branded chart
  - [ ] Kanban: board loads, drag a card, it sticks on reload
  - [ ] Voice: "How were sales yesterday?" → it speaks back
- [ ] **Canned questions ready** (in case the room goes quiet — see below).

---

## Demo flow (suggested order)

1. **Open on the launcher.** Point out the "Viewing as" switcher. Flip through personas — *"users log in, they don't pick a persona; the persona is attached to their user record. Sales sees these tiles, the Controller sees those, a dealer lands on their own page."* This sells the platform + access-control story in 15 seconds.
2. **Sales Analysis — the standard reporting.** Show the dashboard: daily actuals vs plan, region × product line, the quarterly slicer, filter pills, maximize a tile. *"Everything a normal BI tool does."*
3. **Sales Analysis — the agent (the "wow").** Type a plain-English question. Emphasize: *"The model interprets the question; the numbers are computed by the same deterministic engine as the dashboard — so the answer is always exact, never made up."*
4. **The Kanban** (AI App & Agent Development). *"This is how we run the pipeline of what gets built next — request to go-live, with SLAs."* Ties into the feedback vision below.
5. **"One more thing" — voice.** Pull out your phone, tap the tile, ask a question out loud, let it talk back. Don't over-explain; let it land.

---

## Feature talking points

### The platform (launcher + personas + UAC)
- Not one-off apps — a **catalog of tiles** driven by who you are.
- Access control is real: **users authenticate; persona is a field on the user record.** Dealers get tied to a specific dealer company.
- *"We wire up full login after we're live — today this switcher just shows you what each role sees."*

### Sales Analysis
- Six months of **daily, workday-only** data, **region × product line**, actual **and** forecast.
- Standard reporting **plus** a natural-language agent — ask in plain English, get the answer and the chart.
- **Exact by construction:** the agent picks *what* to compute; deterministic code does the math. No hallucinated numbers.
- Branded to Evotti (crimson/charcoal), with a key on every chart.

### Voice (pocket demo)
- Same agent, hands-free, on a phone home-screen tile. Ask → hear a punchy answer → see it on screen.
- Framing: *"The analysis you just saw, in your pocket, by voice."*

### Kanban — AI App & Agent Development
- Shared, live board (Supabase-backed) — everyone sees the same pipeline.
- Request → Requirements → Dev → QA → UAT → Deploy → Go-Live, with business-day SLAs and green/yellow/red status.
- The visible governance of *how we decide what to build next.*

---

## Speak to (don't demo): the feedback & memory layer

> Not built yet, and **not** being demoed. This is a **vision talking point** — speak to it, don't click it. Deliberate: it's a platform feature worth building right, once there's a contract.

**The pitch:**
> "Every answer the agent gives has a thumbs up / thumbs down and a comment box. Two things happen with that feedback. If it's *'you should have known this'* or *'present it this way,'* the agent turns it into a remembered rule — so it never makes that mistake twice. The tool learns **your** business, not a generic model. If the feedback needs an actual system change, it lands in an admin queue I work from. And the same loop runs on every app — sales, CRM, warranty, pricing — so the whole platform compounds."

**Tune to the room:**
- **Controller → governance.** *"Every rule the agent follows traces back to the exact sentence a real person said, who approved it, and when. Nothing enters the system automatically. It's an auditable trail, not a black box."* (Controllers buy traceability and controls.)
- **CFO → compounding value.** *"A report tool is worth the same on day 100 as day 1. This gets more valuable every week, because it's absorbing the institutional knowledge that usually lives in three people's heads."*

**Why it's credible, not vapor** (if asked "how hard is that?"):
- The persona/admin model is already in place — the triage console is a natural extension.
- Supabase already persists shared data (the Kanban proves it) — memory rides the same rails.
- The agent already separates interpretation from computation — which is what makes remembered rules safe to inject.
- Honest answer: *"The plumbing's in place. It's a defined build, not a research project."*

---

## The self-writing report library (speak to)

> Vision talking point — the natural extension of the dynamic agent. Same "speak to, don't demo" posture.

Behind the agent sits a **report registry** — a growing library of named, defined reports. When someone asks a question:
- If it matches a report we've already defined, the agent **runs that report**.
- If it's new, the agent **builds the report, answers, and saves the definition** — so the next person gets it instantly.

**The pitch:**
> "Standard reporting *and* an agent — and the agent builds new standard reports as your team asks new questions. The reporting suite grows itself, and I curate the best ones into your official library."

**Why this also controls cost (the part a CFO leans in on):**
An open-ended agent that reasons from scratch on every question is the runaway-token risk. The registry caps it: once a report is defined, a repeat question **runs the stored report — deterministic, near-zero model cost — instead of re-running a full analysis every time.** The expensive thinking happens *once*, when the report is first created; after that it's cheap execution. So cost goes **down** as the library matures, and the runaway tail is bounded — a defined report has a known, small ceiling.

**Ties to governance:** agent-created reports are proposals; you promote the good ones to "official," rename, or retire — the same admin console as the feedback/memory layer. One curation surface for both.

---

## The Unified Data Platform (speak to)

> Vision talking point — the foundation everything else runs on once we're on live data. "Speak to, don't demo." This is the answer to *"where do the numbers actually come from?"*

Today the demo runs on a conformed mock dataset. The production version stands up a **Unified Data Platform** — one governed place where Evotti's data from every system lands, gets modeled once, and feeds every dashboard and the agent.

**The pitch:**
> "We pull from NetSuite, from Huntington, from the CRM — through their APIs where they have them, scheduled file feeds where they don't — and land it all in one conformed model. A 'boat,' a 'dealer,' a 'HIN,' a 'month' means the same thing everywhere. The dashboards and the agent read from that one platform, not from a dozen systems directly."

**The line that sells it — APIs are the pipes; the UDP is the reservoir:**
> "Having an API to each system isn't the same as having a data platform. An API gives you one system's data, in that system's language, as it looks right now. The platform gives you all of them joined together, speaking one language, with history — so you can ask a question that spans NetSuite *and* Huntington *and* the CRM in a single breath, and get an answer in a second instead of hammering three live systems."

What direct-API-only **can't** do (and the UDP does):
- **Cross-system joins** — ERP receivables + Huntington payoffs + CRM pipeline in one query. You can't join across vendors in a live API call.
- **History / time-series** — "what was the floor-plan balance on March 3." APIs give you *now*; the platform remembers.
- **Speed & resilience** — queries hit our store, not the vendor's rate limits and uptime.
- **One vocabulary** — conformed keys and definitions, so every report ties out.

**Tune to the room:**
- **CFO → single source of truth.** *"One set of numbers the whole company agrees on, instead of finance, sales, and the dealers each reconciling their own export."*
- **Controller → governance & cost.** *"Data lands once, definitions are controlled, access is by persona — and the agent reads from the platform, not from live ERP calls, so it's fast, auditable, and doesn't run up cost or rate limits."* (Same token-cost logic as the report library, one layer down: precomputed and conformed beats re-deriving from raw every time.)

**Why it's credible, not vapor** (if asked "how big a lift?"):
- You're **already looking at a UDP in miniature** — the sales dashboard and agent both read from one conformed model, not from raw source tables. This is that pattern with real pipes.
- **Supabase can be the platform to start** — it's Postgres, it's already our backend, and the RLS/access work is the same access layer. No new vendor to buy on day one.
- Build it **incrementally**: start with the two sources that matter first (ERP/sales + Huntington), prove the loop, add systems as we go. We don't boil the ocean.
- Honest caveat worth naming: **NetSuite has excellent APIs; Huntington's floor-plan data is likely a scheduled file feed, not a live API.** That's normal — the platform is built to ingest both, which is exactly why you want it.

---

## Anticipated questions

| They ask | You say |
|---|---|
| "Is the data real?" | "Realistic mock for the demo — the app is wired to run on live Evotti data the same way." |
| "Can it make up numbers?" | "No — the model only decides what to calculate; the math is deterministic code. The number is always exact." |
| "Is this secure? / Who can see what?" | "Access control is by user + persona; dealers are scoped to their own company. Full login gets wired up as we go live." |
| "How does it get better over time?" | *(the feedback & memory pitch above)* |
| "Where does the data come from? / Do we need a data warehouse?" | "It lands in one Unified Data Platform — pulled from NetSuite, Huntington, the CRM. APIs are the pipes; the platform is the reservoir the dashboards and agent read from. *(the UDP pitch above)*" |
| "If we have APIs to everything, isn't a platform redundant?" | "An API gives you one system's data as it looks right now. The platform gives you all of them joined, in one language, with history — that's the part no single API can do." |
| "How hard is [feature X]?" | "The platform foundation is built — most of what you're imagining is a defined build on top of it, not a rebuild." |

---

## Held back / roadmap (mention as direction, don't show)

- Feedback + memory layer (above) — the compounding-value story.
- Self-writing report registry (above) — the library that grows itself and *lowers* token cost as it matures.
- Unified Data Platform (above) — one conformed reservoir fed from NetSuite/Huntington/CRM; the foundation the whole platform runs on with live data.
- Full UAC / real logins (persona switcher is the demo stand-in).
- Planned tiles: Dealer Portal, Build Tracker, Warranty & Service, Options & Pricing.
- Voice tile is intentionally hidden from the launcher — pull it out as the "one more thing."

---

## Notes & risks

- **Voice on iPhone:** listening can be flaky in Safari; the typed box always works and speaking the answer back works everywhere. If the room is iPhone-heavy, lead with the typed agent and use voice as the flourish.
- **Don't show too much.** Keeping the feedback loop and full UAC as *talked-to* vision is deliberate — it signals depth without implying it was easy.
- **The link is private** (noindex + robots), but there's no login yet — treat the URL like a house key until UAC is on.
