// =============================================================================
// Evotti Sales Analysis — query engine (shared)
// =============================================================================
// One source of truth for turning the sales rows into numbers. Used by:
//   - the dashboard (app.js), for its fixed charts and KPIs
//   - the agent (netlify/functions/ask.js), server-side
// so both always compute variance the same way.
//
// A "spec" describes what to compute:
//   {
//     metric:   "revenue" | "units",
//     view:     "both" | "actual" | "forecast" | "variance" | "variance_pct",
//     group_by: "month" | "week" | "day" | "region" | "product_line",
//     filters:  { regions?, product_lines?, date_from?, date_to?, months? },
//     chart:    "line" | "bar" | "table",
//     title?:   string
//   }
//
// runQuery(payload, spec) returns buckets + totals ready to chart or tabulate.
// interpret(question, payload) is the no-LLM fallback that maps plain English
// to a spec, so the agent still answers when there's no API key.
// =============================================================================

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SalesQuery = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
    "Oct", "Nov", "Dec"];

  var REGIONS = ["Great Lakes", "Southeast", "Gulf", "Northeast", "West"];
  var LINES = ["190 Sport", "240 Series", "280 Cruiser", "320 Flagship"];

  // ---- formatting ----------------------------------------------------------

  function money(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(v / 1e3) + "K";
    return "$" + Math.round(v);
  }
  function moneyFull(v) {
    return "$" + Math.round(v).toLocaleString("en-US");
  }
  function num(v) {
    return Math.round(v).toLocaleString("en-US");
  }
  function pct(v) {
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  }

  // ---- date helpers --------------------------------------------------------

  function ym(dateStr) { return dateStr.slice(0, 7); }
  function monthLabel(ymStr) {
    var p = ymStr.split("-");
    return MON3[parseInt(p[1], 10) - 1] + " " + p[0].slice(2);
  }
  // Monday of the week containing dateStr (UTC-safe, no Date.now used).
  function weekKey(dateStr) {
    var d = new Date(dateStr + "T00:00:00Z");
    var dow = (d.getUTCDay() + 6) % 7; // Mon=0
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  function dayLabel(dateStr) {
    var p = dateStr.split("-");
    return parseInt(p[1], 10) + "/" + parseInt(p[2], 10);
  }
  // Count Mon–Fri in the calendar month of a YYYY-MM string.
  function workdaysInMonth(ymStr) {
    var p = ymStr.split("-"), y = +p[0], m = +p[1];
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var n = 0;
    for (var i = 1; i <= days; i++) {
      var dow = new Date(Date.UTC(y, m - 1, i)).getUTCDay();
      if (dow !== 0 && dow !== 6) n++;
    }
    return n;
  }

  // ---- core aggregation ----------------------------------------------------

  function applyFilters(rows, f) {
    f = f || {};
    return rows.filter(function (r) {
      if (f.regions && f.regions.length && f.regions.indexOf(r.region) < 0) return false;
      if (f.product_lines && f.product_lines.length &&
          f.product_lines.indexOf(r.product_line) < 0) return false;
      if (f.date_from && r.sale_date < f.date_from) return false;
      if (f.date_to && r.sale_date > f.date_to) return false;
      if (f.months && f.months.length && f.months.indexOf(ym(r.sale_date)) < 0) return false;
      return true;
    });
  }

  function keyFns(group_by) {
    switch (group_by) {
      case "day":   return { key: function (r) { return r.sale_date; }, label: dayLabel };
      case "week":  return { key: function (r) { return weekKey(r.sale_date); },
                             label: function (k) { return "wk " + dayLabel(k); } };
      case "region": return { key: function (r) { return r.region; }, label: function (k) { return k; } };
      case "product_line": return { key: function (r) { return r.product_line; }, label: function (k) { return k; } };
      case "month":
      default: return { key: function (r) { return ym(r.sale_date); }, label: monthLabel };
    }
  }

  function aggregate(rows, spec) {
    var f = applyFilters(rows, spec.filters);
    var kf = keyFns(spec.group_by);
    var map = {};
    for (var i = 0; i < f.length; i++) {
      var r = f[i], k = kf.key(r);
      var b = map[k] || (map[k] = { key: k, unitsActual: 0, unitsForecast: 0, revActual: 0, revForecast: 0 });
      b.unitsActual += r.units_actual;
      b.unitsForecast += r.units_forecast;
      b.revActual += r.revenue_actual;
      b.revForecast += r.revenue_forecast;
    }
    var buckets = Object.keys(map).map(function (k) { return map[k]; });
    var timeGrouped = spec.group_by === "day" || spec.group_by === "week" || spec.group_by === "month";
    if (timeGrouped) {
      buckets.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    } else {
      buckets.sort(function (a, b) { return b.revActual - a.revActual; });
    }
    buckets.forEach(function (b) {
      b.label = kf.label(b.key);
      b.revVariance = b.revActual - b.revForecast;
      b.revVariancePct = b.revForecast ? b.revVariance / b.revForecast * 100 : 0;
      b.unitsVariance = b.unitsActual - b.unitsForecast;
      b.unitsVariancePct = b.unitsForecast ? b.unitsVariance / b.unitsForecast * 100 : 0;
    });
    return buckets;
  }

  function totals(rows, spec) {
    var f = applyFilters(rows, spec.filters);
    var t = { unitsActual: 0, unitsForecast: 0, revActual: 0, revForecast: 0 };
    for (var i = 0; i < f.length; i++) {
      t.unitsActual += f[i].units_actual;
      t.unitsForecast += f[i].units_forecast;
      t.revActual += f[i].revenue_actual;
      t.revForecast += f[i].revenue_forecast;
    }
    t.revVariance = t.revActual - t.revForecast;
    t.revVariancePct = t.revForecast ? t.revVariance / t.revForecast * 100 : 0;
    t.unitsVariance = t.unitsActual - t.unitsForecast;
    t.unitsVariancePct = t.unitsForecast ? t.unitsVariance / t.unitsForecast * 100 : 0;
    return t;
  }

  function runQuery(payload, spec) {
    var rows = payload.rows || payload;
    spec = normalizeSpec(spec);
    return {
      spec: spec,
      buckets: aggregate(rows, spec),
      totals: totals(rows, spec)
    };
  }

  function normalizeSpec(spec) {
    spec = spec || {};
    return {
      metric: spec.metric === "units" ? "units" : "revenue",
      view: spec.view || "both",
      group_by: spec.group_by || "month",
      filters: spec.filters || {},
      chart: spec.chart || "bar",
      title: spec.title || ""
    };
  }

  // ---- plain-English fallback interpreter ----------------------------------
  // Deliberately simple keyword matching. The deployed agent uses Claude for
  // real language understanding; this keeps the demo answering without a key.

  function interpret(question, payload) {
    var q = (question || "").toLowerCase();
    var asOf = payload.asOf || (payload.rows && lastDate(payload.rows));
    var curMonth = ym(asOf);

    var metric = /\b(unit|units|boat|boats|hull|hulls|#|volume|count)\b/.test(q)
      ? "units" : "revenue";

    var filters = {};
    var regions = REGIONS.filter(function (r) {
      return q.indexOf(r.toLowerCase()) >= 0 ||
        (r === "Great Lakes" && /\bgreat lakes\b/.test(q));
    });
    if (regions.length) filters.regions = regions;

    var lines = [];
    LINES.forEach(function (l) {
      var num = l.split(" ")[0].toLowerCase();          // "190","240",...
      var word = l.split(" ")[1].toLowerCase();          // "sport","series",...
      if (q.indexOf(l.toLowerCase()) >= 0 || q.indexOf(num) >= 0 ||
          (word === "cruiser" && q.indexOf("cruiser") >= 0) ||
          (word === "sport" && q.indexOf("sport") >= 0) ||
          (l === "320 Flagship" && q.indexOf("flagship") >= 0)) lines.push(l);
    });
    if (lines.length) filters.product_lines = lines;

    // time window
    var monthIdx = -1;
    for (var m = 0; m < 12; m++) {
      if (q.indexOf(MONTHS[m].toLowerCase()) >= 0 || q.indexOf(MON3[m].toLowerCase()) >= 0) { monthIdx = m; break; }
    }
    if (/\bthis month\b|\bmtd\b|month to date\b/.test(q)) filters.months = [curMonth];
    else if (/\blast month\b/.test(q)) filters.months = [addMonth(curMonth, -1)];
    else if (/\bq1\b|first quarter/.test(q)) filters.months = quarter(curMonth, 1);
    else if (/\bq2\b|second quarter/.test(q)) filters.months = quarter(curMonth, 2);
    else if (/\bq3\b|third quarter/.test(q)) filters.months = quarter(curMonth, 3);
    else if (monthIdx >= 0) filters.months = [curMonth.slice(0, 5) + pad2(monthIdx + 1)];

    // grouping
    var group_by = "month";
    if (/\bby region\b|per region\b|which region|regions?\b/.test(q) && !regions.length) group_by = "region";
    else if (/\bby (product|line|series|model)\b|per (product|line)|which (product|line|series|model)|product line/.test(q)) group_by = "product_line";
    else if (/\bdaily\b|per day|by day|each day\b/.test(q)) group_by = "day";
    else if (/\bweekly\b|per week|by week|each week\b/.test(q)) group_by = "week";
    else if (regions.length && !filters.months && /region/.test(q)) group_by = "region";

    // view: are they asking about plan/forecast/variance?
    var view = "both";
    if (/\bvariance\b|vs plan|versus plan|against plan|vs forecast|to plan|beat|miss|over plan|under plan|ahead of plan|behind plan|off plan/.test(q))
      view = "variance";

    var chart = (group_by === "day" || group_by === "week") ? "line" : "bar";

    return normalizeSpec({
      metric: metric, view: view, group_by: group_by,
      filters: filters, chart: chart,
      title: titleFor({ metric: metric, group_by: group_by, filters: filters, view: view })
    });
  }

  function titleFor(s) {
    var mLabel = s.metric === "units" ? "Units" : "Revenue";
    var g = { month: "by month", week: "by week", day: "daily",
      region: "by region", product_line: "by product line" }[s.group_by];
    var scope = "";
    if (s.filters.regions) scope += " — " + s.filters.regions.join(", ");
    if (s.filters.product_lines) scope += " — " + s.filters.product_lines.join(", ");
    if (s.filters.months && s.filters.months.length === 1) scope += " — " + monthLabel(s.filters.months[0]);
    var v = s.view === "variance" || s.view === "variance_pct" ? " vs plan" : "";
    return mLabel + " " + g + v + scope;
  }

  // ---- one-line answer templater ------------------------------------------

  function describe(spec, result) {
    var isUnits = spec.metric === "units";
    var t = result.totals;
    var a = isUnits ? t.unitsActual : t.revActual;
    var fc = isUnits ? t.unitsForecast : t.revForecast;
    var vp = isUnits ? t.unitsVariancePct : t.revVariancePct;
    var fa = isUnits ? num : moneyFull;
    var word = vp >= 0 ? "ahead of" : "behind";
    var head = fa(a) + (isUnits ? " boats" : "") + " actual vs " + fa(fc) +
      " plan — " + pct(vp) + ", " + word + " plan.";

    // Call out the standout bucket when grouped.
    var extra = "";
    if (result.buckets.length > 1 && (spec.view === "variance" || spec.view === "variance_pct")) {
      var key = isUnits ? "unitsVariancePct" : "revVariancePct";
      var sorted = result.buckets.slice().sort(function (x, y) { return y[key] - x[key]; });
      var top = sorted[0], bot = sorted[sorted.length - 1];
      extra = " " + top.label + " led at " + pct(top[key]) +
        "; " + bot.label + " lagged at " + pct(bot[key]) + ".";
    }
    return head + extra;
  }

  // ---- small utils ---------------------------------------------------------

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function addMonth(ymStr, delta) {
    var p = ymStr.split("-"), y = +p[0], m = +p[1] + delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return y + "-" + pad2(m);
  }
  function quarter(curYm, qn) {
    var y = curYm.slice(0, 4);
    var start = (qn - 1) * 3 + 1;
    return [y + "-" + pad2(start), y + "-" + pad2(start + 1), y + "-" + pad2(start + 2)];
  }
  function lastDate(rows) {
    var mx = rows[0].sale_date;
    for (var i = 1; i < rows.length; i++) if (rows[i].sale_date > mx) mx = rows[i].sale_date;
    return mx;
  }

  return {
    REGIONS: REGIONS, LINES: LINES, MONTHS: MONTHS, MON3: MON3,
    money: money, moneyFull: moneyFull, num: num, pct: pct,
    ym: ym, monthLabel: monthLabel, workdaysInMonth: workdaysInMonth,
    aggregate: aggregate, totals: totals, runQuery: runQuery,
    normalizeSpec: normalizeSpec, interpret: interpret, describe: describe,
    titleFor: titleFor
  };
});
