// =============================================================================
// Evotti InfoLink — market-intelligence agent (Netlify Function)
// =============================================================================
// Analyzes the InfoLink pontoon retail-registration report (an external feed
// Evotti receives). Claude reads the question, pulls exact figures via a
// `query_market` tool over the received data, then answers in plain English and
// declares how its answer should be charted. The model narrates; every number
// is computed by infolink/market.js, so answers are always exact.
//
// Requires ANTHROPIC_API_KEY. With no key or on any error it falls back to the
// built-in keyword parser so the page keeps answering.
// =============================================================================

const Market = require("../../infolink/market.js");
const DATA = require("../../reports/infolink-pontoon-ttm.json");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_STEPS = 5;

const QUERY_TOOL = {
  name: "query_market",
  description:
    "Compute exact figures from the InfoLink pontoon report Evotti receives — new retail " +
    "registrations (units) and market share by manufacturer (make), across five trailing-12-month " +
    "periods ending May 2022 through May 2026. Call as many times as you need before answering.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      view: {
        type: "string",
        enum: ["ranking", "make", "movers", "market"],
        description:
          "ranking = leaderboard of makes for a period. make = one make's full 5-period trajectory (units, share, rank). movers = biggest share/unit changes between two periods. market = total market size trend.",
      },
      metric: { type: "string", enum: ["share", "units"], description: "Market share or unit registrations. Default share." },
      period: { type: "string", description: "Which period: 'latest', 'prior', 'first', a year like '2024', or a label. Default latest." },
      compare_period: { type: "string", description: "For movers/changes, the earlier period (default 'first' = TTM May '22)." },
      make: { type: "string", description: "Manufacturer name for view 'make' (e.g. 'Evotti', 'Barletta', 'Tracker')." },
      top_n: { type: "integer", description: "How many makes to return for ranking/movers. Default 10." },
      present: {
        type: "object",
        additionalProperties: false,
        description: "Set on EXACTLY ONE call — the result that best answers the question becomes the chart. Choose a chart that fits what was asked.",
        properties: {
          title: { type: "string", description: "Chart title in plain English, matching the question." },
          chart: { type: "string", enum: ["bars", "line", "variance"], description: "bars = one value per make (a ranking). line = a trend across the five periods. variance = signed change per make (movers)." },
          show: { type: "string", enum: ["ranking", "trajectory", "movers", "market"], description: "What to plot; align with the view you used." },
        },
        required: ["title", "chart", "show"],
      },
    },
    required: ["view"],
  },
};

const SYSTEM = [
  "You are Evotti's market-intelligence analyst. You read the InfoLink report Evotti receives and answer questions about the pontoon market directly and specifically, with real figures.",
  "",
  "The data: new pontoon RETAIL REGISTRATIONS (an industry-wide count from InfoLink, an external feed), and each manufacturer's MARKET SHARE, over five trailing-12-month periods: " + DATA.labels.join(", ") + ".",
  "There are " + DATA.makes.length + " manufacturers (makes). Evotti is Evotti Boats — the company you work for; it just ENTERED the pontoon market (no registrations until the latest period).",
  "The overall pontoon market has been shrinking (" + Market.num(DATA.totals_units[0]) + " registrations in " + DATA.labels[0] + " down to " + Market.num(DATA.totals_units[DATA.totals_units.length - 1]) + " in " + DATA.labels[DATA.labels.length - 1] + ").",
  "",
  "How to work:",
  "- Use query_market for every number. NEVER estimate or do arithmetic yourself — get sums, rankings, ranks, and changes from the tool.",
  "- 'Who leads / top makes' -> view 'ranking'. A specific make or 'how is X doing' -> view 'make'. 'Who's gaining/losing / momentum / drivers' -> view 'movers'. 'How big is the market / is it growing' -> view 'market'.",
  "- Share is the headline metric for competitive questions; use units when asked about volume.",
  "",
  "The chart (you drive it):",
  "- Mark EXACTLY ONE call with a `present` object: bars for a ranking, line for a make's trajectory or the market trend, variance for movers. Write a title that matches the question.",
  "",
  "Then answer:",
  "- Lead with the answer in the first sentence, with the real figures. Keep it tight (1-3 sentences).",
  "- Share as percentages (e.g. 15.5%), units as whole boats. When it's relevant, put Evotti in context.",
].join("\n");

// ---- helpers ---------------------------------------------------------------
function textOf(content) {
  return (content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join(" ").trim();
}
function callAnthropic(messages, withTools) {
  var body = { model: MODEL, max_tokens: 1024, system: SYSTEM, messages: messages };
  if (withTools) body.tools = [QUERY_TOOL];
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
}
function json(obj) { return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }; }
function fallback(question) {
  var spec = Market.interpret(DATA, question);
  var result = Market.runSpec(DATA, spec);
  return json({ answer: Market.describe(DATA, spec, result), chart: Market.buildChart(DATA, spec), source: "rules" });
}

// ---- handler ---------------------------------------------------------------
exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };

  let question = "";
  try { question = (JSON.parse(event.body || "{}").question || "").toString().slice(0, 500); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "bad json" }) }; }
  if (!question.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: "empty question" }) };

  if (!process.env.ANTHROPIC_API_KEY) return fallback(question);

  try {
    var messages = [{ role: "user", content: question }];
    var presented = null;   // {spec, present}

    for (var step = 0; step < MAX_STEPS; step++) {
      var resp = await callAnthropic(messages, true);
      if (!resp.ok) throw new Error("anthropic " + resp.status);
      var data = await resp.json();
      messages.push({ role: "assistant", content: data.content });

      var toolUses = (data.content || []).filter(function (b) { return b.type === "tool_use"; });
      if (data.stop_reason !== "tool_use" || !toolUses.length) {
        return finish(textOf(data.content), presented, question);
      }

      var results = toolUses.map(function (tu) {
        var out;
        try {
          var spec = tu.input;
          if (spec.present || !presented) presented = { spec: spec, present: spec.present || null };
          out = Market.runSpec(DATA, spec);
        } catch (e) { out = { error: "could not run that query" }; }
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) };
      });
      messages.push({ role: "user", content: results });
    }

    var last = await callAnthropic(messages, false);
    if (!last.ok) throw new Error("anthropic " + last.status);
    var ldata = await last.json();
    return finish(textOf(ldata.content), presented, question);
  } catch (err) {
    return fallback(question);
  }
};

function finish(answer, presented, question) {
  var spec = presented ? presented.spec : Market.interpret(DATA, question);
  if (!answer) answer = Market.describe(DATA, spec, Market.runSpec(DATA, spec));
  return json({ answer: answer, chart: Market.buildChart(DATA, spec), source: "live" });
}
