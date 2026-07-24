// =============================================================================
// Evotti Sales Analysis — app
// =============================================================================
// Loads the bundled data (window.EVOTTI_SALES), renders the dashboard, and
// drives the natural-language agent: a free-text box plus a guided drill-down
// (a starter question reveals follow-up options, which reveal the next set).
// All aggregation goes through SalesQuery, so the dashboard and the agent
// compute variance identically.
// =============================================================================

(function () {
  "use strict";

  var SQ = window.SalesQuery, SC = window.SalesCharts;
  var PAYLOAD = window.EVOTTI_SALES;

  if (!PAYLOAD || !PAYLOAD.rows) {
    document.querySelector(".main").innerHTML =
      '<p style="color:#a83435">Could not load sales data (data.js).</p>';
    return;
  }
  var ROWS = PAYLOAD.rows;
  var AS_OF = PAYLOAD.asOf;
  var CUR_MONTH = SQ.ym(AS_OF);

  var $ = function (id) { return document.getElementById(id); };
  var color = { crimson: "#a83435", plan: "#47505f" };

  function init() {
    $("asof").textContent = "As of " + prettyDate(AS_OF);
    $("range").textContent = "Feb – Jul 2026 · workdays only";
    renderKpis();
    renderTrend();
    renderBreakdown("by-region", "region");
    renderBreakdown("by-line", "product_line");
    renderMonthTable();
    wireAgent();
  }

  // ---- KPIs ----------------------------------------------------------------

  function renderKpis() {
    var mtd = SQ.totals(ROWS, { filters: { months: [CUR_MONTH] } });
    var all = SQ.totals(ROWS, { filters: {} });

    var total = SQ.workdaysInMonth(CUR_MONTH);
    var elapsed = distinctDates(ROWS, CUR_MONTH);
    var pace = elapsed ? mtd.revActual / elapsed * total : 0;
    var pacePlan = elapsed ? mtd.revForecast / elapsed * total : 0;
    var pacePct = pacePlan ? (pace - pacePlan) / pacePlan * 100 : 0;
    var mon = SQ.MON3[+CUR_MONTH.split("-")[1] - 1];

    var cards = [
      kpi(mon + " revenue · MTD", SQ.money(mtd.revActual),
        "vs " + SQ.money(mtd.revForecast) + " plan", mtd.revVariancePct),
      kpi(mon + " units · MTD", SQ.num(mtd.unitsActual) + " boats",
        "vs " + SQ.num(mtd.unitsForecast) + " plan", mtd.unitsVariancePct),
      kpi("Full-month pace", SQ.money(pace),
        "on pace · " + elapsed + "/" + total + " workdays", pacePct),
      kpi("Season to date", SQ.money(all.revActual),
        "vs " + SQ.money(all.revForecast) + " plan", all.revVariancePct)
    ];
    $("kpis").innerHTML = cards.join("");
  }

  function kpi(label, value, sub, pct) {
    return '<div class="kpi">' +
      '<div class="k-label">' + esc(label) + "</div>" +
      '<div class="k-value">' + esc(value) + "</div>" +
      '<div class="k-sub">' + esc(sub) + " " + chip(pct) + "</div></div>";
  }
  function chip(pct) {
    return '<span class="chip ' + (pct >= 0 ? "pos" : "neg") + '">' + SQ.pct(pct) + "</span>";
  }

  // ---- charts --------------------------------------------------------------

  function renderTrend() {
    var b = SQ.aggregate(ROWS, { group_by: "day" });
    var cats = b.map(function (x) { return x.label; });
    var svg = SC.lineChart(cats, [
      { values: b.map(function (x) { return x.revActual; }), color: color.crimson },
      { values: b.map(function (x) { return x.revForecast; }), color: color.plan, dashed: true }
    ], { fmt: SQ.money, height: 300 });
    slot("trend", svg);
    $("trend-cap").textContent = "Company-wide, " + cats[0] + " – " + cats[cats.length - 1];
  }

  function renderBreakdown(elId, groupBy) {
    var b = SQ.aggregate(ROWS, { group_by: groupBy });
    var cats = b.map(function (x) { return x.label; });
    var svg = SC.groupedBars(cats, [
      { values: b.map(function (x) { return x.revActual; }), color: color.crimson },
      { values: b.map(function (x) { return x.revForecast; }), color: color.plan }
    ], { fmt: SQ.money, height: 280 });
    slot(elId, svg);
  }

  // ---- monthly table -------------------------------------------------------

  function renderMonthTable() {
    var b = SQ.aggregate(ROWS, { group_by: "month" });
    var t = SQ.totals(ROWS, { filters: {} });
    var head = "<thead><tr>" +
      th("Month") + th("Units") + th("Plan") + th("Revenue") + th("Plan") +
      th("Var $") + th("Var %") + "</tr></thead>";
    var body = b.map(function (r) {
      var mtd = r.key === CUR_MONTH ? " <span style='color:#9297a1'>(MTD)</span>" : "";
      return "<tr>" +
        td(r.label + mtd, true) +
        td(SQ.num(r.unitsActual)) + td(SQ.num(r.unitsForecast)) +
        td(SQ.moneyFull(r.revActual)) + td(SQ.moneyFull(r.revForecast)) +
        tdV(r.revVariance, SQ.money(r.revVariance)) +
        tdV(r.revVariancePct, SQ.pct(r.revVariancePct)) + "</tr>";
    }).join("");
    var foot = "<tfoot><tr>" +
      td("Total", true) +
      td(SQ.num(t.unitsActual)) + td(SQ.num(t.unitsForecast)) +
      td(SQ.moneyFull(t.revActual)) + td(SQ.moneyFull(t.revForecast)) +
      tdV(t.revVariance, SQ.money(t.revVariance)) +
      tdV(t.revVariancePct, SQ.pct(t.revVariancePct)) + "</tr></tfoot>";
    $("month-table").innerHTML = head + "<tbody>" + body + "</tbody>" + foot;
    $("export").onclick = exportCsv;
  }

  function th(t) { return "<th>" + esc(t) + "</th>"; }
  function td(t, raw) { return "<td>" + (raw ? t : esc(t)) + "</td>"; }
  function tdV(v, txt) {
    return '<td class="' + (v >= 0 ? "v-pos" : "v-neg") + '">' + esc(txt) + "</td>";
  }

  function exportCsv() {
    var cols = ["sale_date", "region", "product_line", "units_actual",
      "units_forecast", "revenue_actual", "revenue_forecast"];
    var lines = [cols.join(",")];
    ROWS.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c];
        return typeof v === "string" ? '"' + v + '"' : v;
      }).join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "evotti-sales-daily.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---- guided question tree ------------------------------------------------
  // Each node has a plain-English question the agent answers, plus the set of
  // follow-ups to surface next. Follow-ups loop back to sibling explorations,
  // so the drill-down never dead-ends.

  var TREE = {
    start: ["plan", "where", "trend", "mtd"],
    nodes: {
      plan:  { label: "How are we tracking against plan?", q: "Revenue vs plan by month",     next: ["byRegion", "byLine", "q2", "units"] },
      where: { label: "Where are we winning and losing?",  q: "Which region is behind plan?", next: ["worstRegion", "byLine", "units"] },
      trend: { label: "Show the daily sales trend",        q: "Daily revenue trend",          next: ["q2", "byMonth", "units"] },
      mtd:   { label: "How is July pacing so far?",        q: "July revenue vs plan",         next: ["mtdRegion", "byLine", "byMonth"] },

      byRegion: { label: "Break it down by region",        q: "Revenue vs plan by region",       next: ["worstRegion", "byLine", "units"] },
      byLine:   { label: "Break it down by product line",  q: "Revenue vs plan by product line", next: ["bestLine", "byRegion", "units"] },
      q2:       { label: "Just look at Q2",                q: "Q2 revenue vs plan by region",    next: ["byLine", "byMonth"] },
      units:    { label: "Show it in boats, not dollars",  q: "Units vs plan by month",          next: ["byRegion", "byLine"] },
      byMonth:  { label: "Compare the months",             q: "Revenue by month",                next: ["byRegion", "byLine", "units"] },

      worstRegion: { label: "Which region is furthest behind?", q: "Which region is behind plan?", next: ["byLine", "q2"] },
      bestLine:    { label: "Which product line sells best?",   q: "Revenue by product line",      next: ["byRegion", "units"] },
      mtdRegion:   { label: "July, by region",                  q: "July revenue by region",       next: ["byLine", "byMonth"] }
    }
  };

  function wireAgent() {
    renderGuide(TREE.start, true);
    $("guide-reset").onclick = function () { renderGuide(TREE.start, true); };
    $("ask-go").onclick = function () { ask($("ask").value); };
    $("ask").addEventListener("keydown", function (e) { if (e.key === "Enter") ask($("ask").value); });
  }

  function renderGuide(ids, atStart) {
    $("guide-label").textContent = atStart ? "Start here" : "Then explore";
    $("guide-reset").hidden = atStart;
    var box = $("suggests");
    box.innerHTML = "";
    ids.forEach(function (id) {
      var node = TREE.nodes[id];
      var b = document.createElement("button");
      b.className = "suggest";
      b.textContent = node.label;
      b.onclick = function () { askNode(id); };
      box.appendChild(b);
    });
  }

  function askNode(id) {
    var node = TREE.nodes[id];
    ask(node.q);
    renderGuide(node.next, false);
  }

  // ---- agent ---------------------------------------------------------------

  function ask(qArg) {
    var q = (qArg != null ? qArg : $("ask").value).trim();
    if (!q) return;
    thinking(q);
    fetch("/.netlify/functions/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q })
    }).then(function (r) {
      if (!r.ok) throw new Error("fn " + r.status);
      return r.json();
    }).then(function (data) {
      var spec = SQ.normalizeSpec(data.spec);
      var result = SQ.runQuery(PAYLOAD, spec);
      renderAnswer(q, spec, data.title || spec.title,
        data.answer || SQ.describe(spec, result), result,
        data.source === "rules" ? "rules" : "live");
    }).catch(function () {
      var spec = SQ.interpret(q, PAYLOAD);
      var result = SQ.runQuery(PAYLOAD, spec);
      renderAnswer(q, spec, spec.title, SQ.describe(spec, result), result, "rules");
    });
  }

  function thinking(q) {
    $("answer").innerHTML =
      '<div class="answer"><div class="a-q">' + esc(q) + "</div>" +
      '<div class="thinking"><i></i><i></i><i></i></div></div>';
    $("answer").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderAnswer(q, spec, title, text, result, source) {
    var wrap = document.createElement("div");
    wrap.className = "answer";
    wrap.innerHTML =
      '<div class="a-q">' + esc(q) + "</div>" +
      '<div class="a-title">' + esc(title || SQ.titleFor(spec)) + "</div>" +
      '<div class="a-text">' + esc(text) + "</div>" +
      '<div class="chart-slot"></div>' +
      '<div class="a-src">Answered from <span class="tag ' +
      (source === "live" ? "live" : "") + '">' +
      (source === "live" ? "live agent" : "built-in rules") +
      "</span> · " + result.buckets.length + " group" +
      (result.buckets.length === 1 ? "" : "s") + "</div>";
    var svg = resultChart(spec, result);
    if (svg) {
      var s = wrap.querySelector(".chart-slot");
      s.appendChild(svg);
      s.insertAdjacentHTML("beforeend", answerLegend(spec));
    }
    $("answer").innerHTML = "";
    $("answer").appendChild(wrap);
  }

  function answerLegend(spec) {
    var isVar = spec.view === "variance" || spec.view === "variance_pct";
    var a = isVar ? "Over plan" : "Actual";
    var b = isVar ? "Under plan" : "Plan";
    return '<div class="legend">' +
      '<span><i class="bar" style="background:#a83435"></i>' + a + "</span>" +
      '<span><i class="bar" style="background:#47505f"></i>' + b + "</span></div>";
  }

  function resultChart(spec, result) {
    var b = result.buckets;
    if (!b.length) return null;
    var isUnits = spec.metric === "units";
    var fmt = isUnits ? SQ.num : SQ.money;
    var cats = b.map(function (x) { return x.label; });
    var aKey = isUnits ? "unitsActual" : "revActual";
    var fKey = isUnits ? "unitsForecast" : "revForecast";
    var vKey = isUnits ? "unitsVariancePct" : "revVariancePct";

    if ((spec.view === "variance" || spec.view === "variance_pct") && b.length >= 2) {
      return SC.varianceBars(cats, b.map(function (x) { return x[vKey]; }),
        { suffix: "%", height: 240 });
    }
    var series = [
      { values: b.map(function (x) { return x[aKey]; }), color: color.crimson },
      { values: b.map(function (x) { return x[fKey]; }), color: color.plan,
        dashed: spec.chart === "line" }
    ];
    if (spec.chart === "line" || spec.group_by === "day" || spec.group_by === "week") {
      return SC.lineChart(cats, series, { fmt: fmt, height: 260 });
    }
    return SC.groupedBars(cats, series, { fmt: fmt, height: 260 });
  }

  // ---- utils ---------------------------------------------------------------

  function slot(id, svg) { var e = $(id); e.innerHTML = ""; e.appendChild(svg); }
  function distinctDates(rows, ymStr) {
    var set = {};
    rows.forEach(function (r) { if (SQ.ym(r.sale_date) === ymStr) set[r.sale_date] = 1; });
    return Object.keys(set).length;
  }
  function prettyDate(d) {
    var p = d.split("-");
    return SQ.MON3[+p[1] - 1] + " " + (+p[2]) + " " + p[0];
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  init();
})();
