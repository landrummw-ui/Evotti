// =============================================================================
// Evotti Sales Analysis — agent backend (Netlify Function)
// =============================================================================
// Dynamic analyst. Claude reads the user's question, pulls the numbers it needs
// via a `query_sales` tool (it may call it several times — e.g. two quarters to
// compare, or by region AND by product line to find drivers), then writes the
// actual answer in plain English.
//
// The model interprets and narrates; it NEVER does arithmetic. Every number —
// including quarter-over-quarter deltas — is computed by the deterministic
// query engine (sales/query.js) over the bundled data (sales/sample-data.json),
// so answers are always exact.
//
// Requires ANTHROPIC_API_KEY (set in the Netlify dashboard). With no key, or on
// any error, it falls back to the built-in keyword parser so the page still
// answers common questions (the frontend then computes + templates the reply).
// =============================================================================

const SalesQuery = require("../../sales/query.js");
const DATA = require("../../sales/sample-data.json");
const ROWS = DATA.rows;

const AS_OF = DATA.as_of || "2026-07-24";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_STEPS = 5;                 // tool rounds before we force a final answer

// ---- the one tool the agent gets ------------------------------------------

const FILTERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    regions: { type: "array", items: { type: "string", enum: SalesQuery.REGIONS } },
    product_lines: { type: "array", items: { type: "string", enum: SalesQuery.LINES } },
    months: { type: "array", items: { type: "string" }, description: "YYYY-MM values, e.g. '2026-06'. Q1=01,02,03; Q2=04,05,06; Q3=07,08,09." },
    date_from: { type: "string", description: "YYYY-MM-DD inclusive" },
    date_to: { type: "string", description: "YYYY-MM-DD inclusive" },
  },
};

const QUERY_TOOL = {
  name: "query_sales",
  description:
    "Compute exact sales figures over Evotti's data. Returns totals and, when grouped, per-group " +
    "numbers (actual, plan, variance vs plan). To COMPARE two periods (e.g. Q2 vs Q1), also pass " +
    "`compare_to` with the other period's filters — the result then gives each group's value for " +
    "both periods and the code-computed delta, so you never subtract numbers yourself. Call this as " +
    "many times as you need before answering.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      metric: { type: "string", enum: ["revenue", "units"] },
      view: { type: "string", enum: ["both", "actual", "forecast", "variance"] },
      group_by: { type: "string", enum: ["month", "week", "day", "region", "product_line"] },
      filters: FILTERS_SCHEMA,
      compare_to: Object.assign({ description: "Second period's filters. Present => return per-group deltas (this period minus compare_to)." }, FILTERS_SCHEMA),
      present: { type: "boolean", description: "Set true on the ONE result that best illustrates your answer; the dashboard charts it." },
    },
    required: ["metric", "group_by", "filters"],
  },
};

const SYSTEM = [
  "You are Evotti's sales analyst. Answer the user's question directly and specifically, using real figures.",
  "",
  "Data: daily boat sales, workdays only, February 2 through July 24, 2026. Today is " + AS_OF + " (July is month-to-date).",
  "Grain: region x product line x day, with actual and forecast (plan) for units and revenue.",
  "Regions: " + SalesQuery.REGIONS.join(", ") + ".",
  "Product lines: " + SalesQuery.LINES.join(", ") + ".",
  "Quarters: Q1 = 2026-01/02/03 (data starts Feb 2), Q2 = 04/05/06, Q3 = 07 (month-to-date).",
  "",
  "How to work:",
  "- Use the query_sales tool to get every number. NEVER calculate or estimate arithmetic yourself — if you need a sum, a ranking, or a difference, get it from the tool.",
  "- To compare two periods (variance/drivers between Q2 and Q1, this month vs last, etc.), pass `compare_to`; the tool returns code-computed per-group deltas. Group by product_line and/or region to surface the drivers.",
  "- Call the tool more than once when a question needs more than one cut.",
  "- Mark exactly one query result with present:true — the one that best illustrates the answer. The dashboard charts it.",
  "",
  "Then answer:",
  "- Lead with the answer in the first sentence. Be specific and quote the real figures.",
  "- Keep it tight: 1-3 sentences. It may be read aloud.",
  "- For 'best/worst/top' questions, name the winner and the runner-up with numbers.",
  "- For 'drivers' questions, name the top 1-3 movers and their contribution to the change.",
  "- Money like $33.7M or $843K; units as whole boats.",
].join("\n");

// ---- helpers ---------------------------------------------------------------

function round(v) { return Math.round(v); }
function round1(v) { return Math.round(v * 10) / 10; }

function val(metric, o) { return metric === "units" ? o.unitsActual : o.revActual; }
function plan(metric, o) { return metric === "units" ? o.unitsForecast : o.revForecast; }
function vpct(metric, o) { return metric === "units" ? o.unitsVariancePct : o.revVariancePct; }

// A single aggregation, compacted for the model.
function runOne(spec) {
  var r = SalesQuery.runQuery(ROWS, spec);
  var m = spec.metric;
  return {
    metric: m,
    group_by: spec.group_by,
    filters: spec.filters,
    totals: { actual: round(val(m, r.totals)), plan: round(plan(m, r.totals)), variance_pct: round1(vpct(m, r.totals)) },
    groups: r.buckets.map(function (b) {
      return { label: b.label, actual: round(val(m, b)), plan: round(plan(m, b)), variance_pct: round1(vpct(m, b)) };
    }),
  };
}

// Two periods aligned by group, with code-computed deltas.
function runCompare(spec, compareFilters) {
  var m = spec.metric;
  var a = SalesQuery.runQuery(ROWS, spec);
  var bSpec = SalesQuery.normalizeSpec(Object.assign({}, spec, { filters: compareFilters }));
  var b = SalesQuery.runQuery(ROWS, bSpec);
  var bmap = {};
  b.buckets.forEach(function (x) { bmap[x.label] = val(m, x); });
  var groups = a.buckets.map(function (x) {
    var av = val(m, x), bv = bmap[x.label] || 0, d = av - bv;
    return { label: x.label, this_period: round(av), compare_period: round(bv), delta: round(d), delta_pct: round1(bv ? (d / bv) * 100 : 0) };
  });
  var at = val(m, a.totals), bt = val(m, b.totals);
  return {
    metric: m, group_by: spec.group_by,
    this_period_filters: spec.filters, compare_period_filters: compareFilters,
    totals: { this_period: round(at), compare_period: round(bt), delta: round(at - bt), delta_pct: round1(bt ? ((at - bt) / bt) * 100 : 0) },
    groups: groups,
  };
}

function textOf(content) {
  return (content || []).filter(function (b) { return b.type === "text"; })
    .map(function (b) { return b.text; }).join(" ").trim();
}

function callAnthropic(messages, withTools) {
  var body = { model: MODEL, max_tokens: 1024, system: SYSTEM, messages: messages };
  if (withTools) body.tools = [QUERY_TOOL];
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
}

function json(obj) {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
function fallback(question) {
  var spec = SalesQuery.interpret(question, { asOf: AS_OF });
  return json({ spec: spec, source: "rules" });
}

// ---- handler ---------------------------------------------------------------

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  let question = "";
  try {
    question = (JSON.parse(event.body || "{}").question || "").toString().slice(0, 500);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "bad json" }) };
  }
  if (!question.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "empty question" }) };
  }

  // No key: keep the demo alive with the built-in parser.
  if (!process.env.ANTHROPIC_API_KEY) return fallback(question);

  try {
    var messages = [{ role: "user", content: question }];
    var chartSpec = null;   // last spec run, or the one flagged present:true

    for (var step = 0; step < MAX_STEPS; step++) {
      var resp = await callAnthropic(messages, true);
      if (!resp.ok) throw new Error("anthropic " + resp.status);
      var data = await resp.json();

      messages.push({ role: "assistant", content: data.content });

      var toolUses = (data.content || []).filter(function (b) { return b.type === "tool_use"; });
      if (data.stop_reason !== "tool_use" || !toolUses.length) {
        return finish(textOf(data.content), chartSpec, question);
      }

      var results = toolUses.map(function (tu) {
        var out;
        try {
          var spec = SalesQuery.normalizeSpec(tu.input);
          if (tu.input.present || !chartSpec) chartSpec = spec;   // prefer flagged; else keep last
          out = (tu.input.compare_to)
            ? runCompare(spec, tu.input.compare_to)
            : runOne(spec);
        } catch (e) {
          out = { error: "could not run that query" };
        }
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) };
      });
      messages.push({ role: "user", content: results });
    }

    // Ran the tool budget: force a final answer with tools off.
    var last = await callAnthropic(messages, false);
    if (!last.ok) throw new Error("anthropic " + last.status);
    var ldata = await last.json();
    return finish(textOf(ldata.content), chartSpec, question);
  } catch (err) {
    return fallback(question);
  }
};

function finish(answer, chartSpec, question) {
  if (!chartSpec) chartSpec = SalesQuery.interpret(question, { asOf: AS_OF });
  if (!answer) answer = SalesQuery.describe(chartSpec, SalesQuery.runQuery(ROWS, chartSpec));
  return json({ answer: answer, spec: chartSpec, title: chartSpec.title, source: "live" });
}
