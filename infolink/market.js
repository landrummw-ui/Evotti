// =============================================================================
// Evotti InfoLink market engine — shared by the page and the agent function.
// =============================================================================
// Deterministic analysis over the InfoLink pontoon retail-registration report
// (an external feed Evotti receives). The model narrates; every number comes
// from here, so answers are exact. UMD: window.InfoLink in the browser,
// module.exports under Node (the Netlify function).
// =============================================================================
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.InfoLink = factory();
})(typeof self !== "undefined" ? self : this, function () {

  // ---- formatting ----------------------------------------------------------
  function num(v) {
    if (v == null) return "0";
    return Math.round(v).toLocaleString("en-US");
  }
  function pct(v, dp) {
    if (v == null) v = 0;
    return (v * 100).toFixed(dp == null ? 1 : dp) + "%";
  }
  function signedPct(v, dp) {
    var s = (v >= 0 ? "+" : "") + (v * 100).toFixed(dp == null ? 1 : dp) + "pts";
    return s;
  }

  // ---- period resolution ---------------------------------------------------
  // Accepts an index, "latest"/"current", "prior"/"previous", "first"/"earliest",
  // a 4- or 2-digit year, or any substring of a period label.
  function resolvePeriod(data, p) {
    var n = data.labels.length;
    if (p == null || p === "" || /latest|current|newest|most recent|this/i.test(p)) return n - 1;
    if (typeof p === "number") return Math.max(0, Math.min(n - 1, p));
    var s = String(p).toLowerCase();
    if (/prior|previous|last year|year ago|prior year/.test(s)) return n - 2;
    if (/first|earliest|oldest/.test(s)) return 0;
    var ym = s.match(/(20\d\d|['’]?\d\d)\b/);
    if (ym) {
      var yr = ym[1].replace(/[^\d]/g, "");
      if (yr.length === 4) yr = yr.slice(2);
      for (var i = 0; i < n; i++) if (data.labels[i].indexOf("'" + yr) >= 0) return i;
    }
    for (var j = 0; j < n; j++) if (data.labels[j].toLowerCase().indexOf(s) >= 0) return j;
    return n - 1;
  }

  // ---- make lookup (case-insensitive, forgiving) ---------------------------
  function findMake(data, name) {
    if (!name) return null;
    var s = String(name).trim().toLowerCase();
    var exact = null, contains = null;
    for (var i = 0; i < data.makes.length; i++) {
      var m = data.makes[i], ml = m.make.toLowerCase();
      if (ml === s) { exact = m; break; }
      if (!contains && (ml.indexOf(s) >= 0 || s.indexOf(ml) >= 0)) contains = m;
    }
    return exact || contains;
  }

  // ---- core reads ----------------------------------------------------------
  function val(m, metric, idx) {
    var arr = metric === "units" ? m.units : m.share;
    return arr[idx] == null ? 0 : arr[idx];
  }

  // Ranked list for a period. Returns [{make, units, share, rank}] desc by metric.
  function ranking(data, metric, pIdx, topN) {
    metric = metric === "units" ? "units" : "share";
    var rows = data.makes.map(function (m) {
      return { make: m.make, units: val(m, "units", pIdx), share: val(m, "share", pIdx) };
    });
    rows.sort(function (a, b) { return b[metric] - a[metric]; });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return topN ? rows.slice(0, topN) : rows;
  }

  function rankOf(data, metric, pIdx, makeName) {
    var full = ranking(data, metric, pIdx, 0);
    for (var i = 0; i < full.length; i++) if (full[i].make === makeName) return full[i].rank;
    return null;
  }

  // A make across all periods, plus its rank each period.
  function trajectory(data, name) {
    var m = findMake(data, name);
    if (!m) return null;
    return {
      make: m.make,
      labels: data.labels,
      units: m.units.slice(),
      share: m.share.slice(),
      rank_share: data.labels.map(function (_l, i) { return rankOf(data, "share", i, m.make); }),
      rank_units: data.labels.map(function (_l, i) { return rankOf(data, "units", i, m.make); }),
    };
  }

  // Biggest movers between two periods.
  function movers(data, metric, fromIdx, toIdx, n) {
    metric = metric === "units" ? "units" : "share";
    var rows = data.makes.map(function (m) {
      var a = val(m, metric, fromIdx), b = val(m, metric, toIdx);
      return { make: m.make, from: a, to: b, delta: b - a };
    });
    var gainers = rows.slice().sort(function (a, b) { return b.delta - a.delta; }).slice(0, n || 5);
    var losers = rows.slice().sort(function (a, b) { return a.delta - b.delta; }).slice(0, n || 5);
    return { gainers: gainers, losers: losers };
  }

  function market(data) {
    var t = data.totals_units;
    return {
      labels: data.labels, totals: t.slice(),
      delta_units: t[t.length - 1] - t[0],
      delta_pct: t[0] ? (t[t.length - 1] - t[0]) / t[0] : 0,
    };
  }

  // ---- fallback keyword parser (no API key / error) ------------------------
  // Produces a spec the same shape the agent's tool uses, so both paths compute
  // through runSpec.
  function interpret(data, question) {
    var q = (question || "").toLowerCase();
    var metric = /\bunit|units|volume|registrations?\b/.test(q) && !/share/.test(q) ? "units" : "share";
    var spec = { view: "ranking", metric: metric, period: "latest", compare_period: "first", top_n: 10 };

    // Detect a make by matching any distinctive word (>=4 chars) of its name as
    // a whole word in the question; prefer the longest such match.
    var best = null;
    for (var mi = 0; mi < data.makes.length; mi++) {
      var words = data.makes[mi].make.toLowerCase().split(/[ /&]+/);
      for (var wi = 0; wi < words.length; wi++) {
        var w = words[wi];
        if (w.length >= 4 && new RegExp("\\b" + w + "\\b").test(q)) {
          if (!best || w.length > best.w.length) best = { make: data.makes[mi].make, w: w };
        }
      }
    }
    if (best) { spec.view = "make"; spec.make = best.make; }
    if (/gain|grow|grew|rising|risen|momentum|winner|mover|gainer/.test(q)) { spec.view = "movers"; spec.dir = "gainers"; }
    if (/declin|losing|lost|fell|falling|shrink|loser|slipping/.test(q)) { spec.view = "movers"; spec.dir = "losers"; }
    if (/market size|total market|whole market|market shrink|market grow|how big|total registrations/.test(q)) spec.view = "market";
    if (/\bevotti\b/.test(q)) { spec.view = "make"; spec.make = "Evotti"; }
    if (/top (\d+)/.test(q)) spec.top_n = Math.min(20, +RegExp.$1);
    var yr = q.match(/20(2[0-6])/);
    if (yr) spec.period = "20" + yr[1];
    return spec;
  }

  // ---- run a spec -> structured result (used by tool + fallback) -----------
  function runSpec(data, spec) {
    var metric = spec.metric === "units" ? "units" : "share";
    var pIdx = resolvePeriod(data, spec.period);
    var cIdx = resolvePeriod(data, spec.compare_period != null ? spec.compare_period : "first");
    if (spec.view === "make") {
      var t = trajectory(data, spec.make);
      return { view: "make", metric: metric, period: data.labels[pIdx], trajectory: t };
    }
    if (spec.view === "movers") {
      var mv = movers(data, metric, cIdx, pIdx, spec.top_n || 5);
      return { view: "movers", metric: metric, from: data.labels[cIdx], to: data.labels[pIdx], gainers: mv.gainers, losers: mv.losers };
    }
    if (spec.view === "market") {
      return { view: "market", market: market(data) };
    }
    return { view: "ranking", metric: metric, period: data.labels[pIdx], rows: ranking(data, metric, pIdx, spec.top_n || 10) };
  }

  // ---- one-line answer templater (fallback narration) ----------------------
  function describe(data, spec, result) {
    if (result.view === "make" && result.trajectory) {
      var t = result.trajectory, i = t.units.length - 1;
      if (t.units[i] == null || t.units[i] === 0) {
        return t.make + " has no registrations in " + data.labels[i] + ".";
      }
      return t.make + " registered " + num(t.units[i]) + " pontoons in " + data.labels[i] +
        " for " + pct(t.share[i]) + " market share — rank #" + t.rank_share[i] + " of " + data.makes.length + ".";
    }
    if (result.view === "movers") {
      var g = result.gainers[0], l = result.losers[0];
      var fmtD = function (d) { return result.metric === "share" ? signedPct(d) : (d >= 0 ? "+" : "") + num(d); };
      if (spec && spec.dir === "losers") {
        return "From " + result.from + " to " + result.to + ", " + l.make + " gave up the most " +
          result.metric + " (" + fmtD(l.delta) + "), followed by " + result.losers[1].make + " (" + fmtD(result.losers[1].delta) + ").";
      }
      return "From " + result.from + " to " + result.to + ", " + g.make + " gained the most " +
        result.metric + " (" + fmtD(g.delta) + "); " + l.make + " gave up the most (" + fmtD(l.delta) + ").";
    }
    if (result.view === "market") {
      var mk = result.market, n = mk.totals.length - 1;
      return "The pontoon market totaled " + num(mk.totals[n]) + " registrations in " + mk.labels[n] +
        ", " + signedPct(mk.delta_pct === 0 ? 0 : mk.delta_pct, 0).replace("pts", "%") + " vs " + mk.labels[0] + ".";
    }
    var top = result.rows[0], two = result.rows[1];
    return top.make + " leads pontoon " + (result.metric === "units" ? "registrations" : "share") + " in " +
      result.period + " with " + (result.metric === "units" ? num(top.units) : pct(top.share)) +
      (two ? ", ahead of " + two.make + " (" + (result.metric === "units" ? num(two.units) : pct(two.share)) + ")" : "") + ".";
  }

  // ---- chart contract (shared by the agent function and the page) ----------
  // { kind:"bars"|"line"|"variance", unit:"pct"|"count"|"pts",
  //   title, categories:[...], series:[{label,values}] | values:[...] }
  function buildChart(data, spec) {
    var metric = spec.metric === "units" ? "units" : "share";
    var p = spec.present || {};
    var result = runSpec(data, spec);
    var unitCount = metric === "units";

    if (result.view === "make" && result.trajectory) {
      var t = result.trajectory;
      var vals = (unitCount ? t.units : t.share).map(function (v) { return unitCount ? Math.round(v || 0) : Math.round((v || 0) * 1000) / 10; });
      return {
        kind: "line", unit: unitCount ? "count" : "pct",
        title: p.title || (t.make + " — pontoon " + (unitCount ? "registrations" : "market share") + " trend"),
        categories: t.labels, series: [{ label: t.make, values: vals }],
      };
    }
    if (result.view === "movers") {
      var dir = spec.dir === "losers" ? result.losers : result.gainers;
      return {
        kind: "variance", unit: unitCount ? "count" : "pts",
        title: p.title || ("Biggest " + (spec.dir === "losers" ? "share losses" : "share gains") + " — " + result.from + " to " + result.to),
        categories: dir.map(function (x) { return x.make; }),
        values: dir.map(function (x) { return unitCount ? Math.round(x.delta) : Math.round(x.delta * 1000) / 10; }),
      };
    }
    if (result.view === "market") {
      var mk = result.market;
      return {
        kind: "line", unit: "count",
        title: p.title || "Total pontoon market — registrations by period",
        categories: mk.labels, series: [{ label: "Registrations", values: mk.totals.map(function (v) { return Math.round(v); }) }],
      };
    }
    var rows = result.rows;
    return {
      kind: "bars", unit: unitCount ? "count" : "pct",
      title: p.title || ("Pontoon " + (unitCount ? "registrations" : "market share") + " leaders — " + result.period),
      categories: rows.map(function (x) { return x.make; }),
      series: [{ label: unitCount ? "Registrations" : "Market share", values: rows.map(function (x) { return unitCount ? Math.round(x.units) : Math.round(x.share * 1000) / 10; }) }],
    };
  }

  return {
    num: num, pct: pct, signedPct: signedPct,
    resolvePeriod: resolvePeriod, findMake: findMake,
    ranking: ranking, rankOf: rankOf, trajectory: trajectory, movers: movers, market: market,
    interpret: interpret, runSpec: runSpec, describe: describe, buildChart: buildChart,
  };
});
