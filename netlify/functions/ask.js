// =============================================================================
// Evotti Sales Analysis — agent backend (Netlify Function)
// =============================================================================
// Turns a plain-English question into a structured query spec by asking Claude,
// then hands the spec back to the browser, which runs it over the in-memory
// sales data via the shared query engine. The model interprets language; the
// deterministic code computes the numbers — so the answer is always exact.
//
// Requires the ANTHROPIC_API_KEY environment variable (set it in the Netlify
// dashboard). With no key, it falls back to the built-in keyword parser so the
// page still answers common questions.
// =============================================================================

const SalesQuery = require("../../sales/query.js");

const AS_OF = "2026-07-24";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// The structured query the frontend knows how to execute and chart.
const QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    metric: { type: "string", enum: ["revenue", "units"] },
    view: {
      type: "string",
      enum: ["both", "actual", "forecast", "variance"],
      description: "Use 'variance' when the question is about performance vs plan/forecast.",
    },
    group_by: {
      type: "string",
      enum: ["month", "week", "day", "region", "product_line"],
    },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        regions: { type: "array", items: { type: "string", enum: SalesQuery.REGIONS } },
        product_lines: { type: "array", items: { type: "string", enum: SalesQuery.LINES } },
        months: {
          type: "array",
          items: { type: "string" },
          description: "YYYY-MM values, e.g. '2026-06'. Q2 is 04,05,06.",
        },
        date_from: { type: "string", description: "YYYY-MM-DD inclusive" },
        date_to: { type: "string", description: "YYYY-MM-DD inclusive" },
      },
    },
    chart: { type: "string", enum: ["line", "bar", "table"] },
    title: { type: "string", description: "Short human-readable title for the result." },
  },
  required: ["metric", "view", "group_by", "filters", "chart", "title"],
};

const SYSTEM = [
  "You translate a sales executive's plain-English question into a structured query over Evotti's sales data.",
  "",
  "The data is daily sales of boats, workdays only, February 2 through July 24, 2026. Today is " + AS_OF + " (so July is month-to-date).",
  "Grain: region x product line x day, with actual and forecast (plan) for both units and revenue.",
  "Regions: " + SalesQuery.REGIONS.join(", ") + ".",
  "Product lines: " + SalesQuery.LINES.join(", ") + ".",
  "",
  "Rules:",
  "- 'sales', 'revenue', 'dollars', '$' -> metric 'revenue'. 'boats', 'units', 'how many' -> metric 'units'.",
  "- Anything about beating/missing/vs plan or forecast -> view 'variance'. Otherwise 'both'.",
  "- 'by region' -> group_by 'region'; 'by product line/series/model' -> 'product_line'; 'daily' -> 'day'; 'weekly' -> 'week'; else 'month'.",
  "- Map month names and quarters to filters.months (Q2 = 2026-04, 2026-05, 2026-06). 'this month'/'MTD' = 2026-07.",
  "- Only set filters that the question calls for; leave others empty.",
  "- Pick chart 'line' for daily/weekly trends, otherwise 'bar'.",
  "Always answer by calling the build_query tool.",
].join("\n");

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

  // No key configured: answer with the built-in parser so the demo still works.
  if (!process.env.ANTHROPIC_API_KEY) {
    const spec = SalesQuery.interpret(question, { asOf: AS_OF });
    return { statusCode: 200, headers, body: JSON.stringify({ spec, source: "rules" }) };
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM,
        tools: [{
          name: "build_query",
          description: "Return the structured query that answers the question.",
          input_schema: QUERY_SCHEMA,
        }],
        tool_choice: { type: "tool", name: "build_query" },
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!resp.ok) throw new Error("anthropic " + resp.status);
    const data = await resp.json();
    const toolUse = (data.content || []).find(function (b) { return b.type === "tool_use"; });
    if (!toolUse) throw new Error("no tool_use in response");

    return { statusCode: 200, headers, body: JSON.stringify({ spec: toolUse.input, source: "live" }) };
  } catch (err) {
    // Never fail the demo: fall back to the built-in parser.
    const spec = SalesQuery.interpret(question, { asOf: AS_OF });
    return { statusCode: 200, headers, body: JSON.stringify({ spec, source: "rules" }) };
  }
};
