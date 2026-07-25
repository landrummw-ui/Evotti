// =============================================================================
// Evotti InfoLink — market-intel page controller
// =============================================================================
// Renders the received InfoLink pontoon report (spotlight, KPIs, share-trend,
// leaderboard) and drives the "Ask the market" agent drawer. Numbers come from
// the shared engine (infolink/market.js); charts from SalesCharts.
// =============================================================================
(function () {
  "use strict";
  var DATA = window.EVOTTI_INFOLINK;
  var IL = window.InfoLink;
  var SC = window.SalesCharts;
  var ACCENT = "#2f7d8f", GRAY = "#6b7280";
  var PALETTE = ["#2f7d8f", "#a83435", "#c2872f", "#5a54c9", "#3f7d54", "#8a5a9c", "#b5761f", "#2f6f8f"];

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var LAST = DATA.labels.length - 1;
  function units(v) { return IL.num(v); }
  function share(v) { return IL.pct(v); }

  // fmt for chart axes/labels by unit
  function fmtFor(unit) {
    if (unit === "pct") return function (v) { return v.toFixed(1) + "%"; };
    return function (v) { return Math.round(v).toLocaleString("en-US"); };
  }

  // ---- static dashboard ----------------------------------------------------
  function renderChrome() {
    $("asof").textContent = "InfoLink · " + DATA.as_of;
    $("range").textContent = DATA.source + " · " + DATA.period_type + " · " +
      DATA.labels[0] + " → " + DATA.labels[LAST];
  }

  function renderSpotlight() {
    var t = IL.trajectory(DATA, "Evotti");
    var rank = t ? t.rank_share[LAST] : null;
    var u = t ? t.units[LAST] : 0, s = t ? t.share[LAST] : 0;
    $("spotlight").innerHTML =
      '<div class="sl-head"><span class="sl-tag">Evotti</span>' +
      '<h2>New entrant — pontoon segment</h2></div>' +
      '<div class="sl-figs">' +
      fig(units(u), "registrations · " + DATA.labels[LAST]) +
      fig(share(s), "market share") +
      fig("#" + rank, "of " + DATA.makes.length + " makes") +
      fig("0 → " + units(u), "first units on the board") +
      '</div>' +
      '<p class="sl-note">Evotti had no pontoon registrations through ' + DATA.labels[LAST - 1] +
      ', then entered this year — in a market that has contracted from ' + units(DATA.totals_units[0]) +
      ' to ' + units(DATA.totals_units[LAST]) + ' registrations since ' + DATA.labels[0] + '.</p>';
  }
  function fig(v, l) { return '<div class="sl-fig"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div></div>'; }

  function renderKpis() {
    var mk = IL.market(DATA);
    var leader = IL.ranking(DATA, "share", LAST, 1)[0];
    var gain = IL.movers(DATA, "share", 0, LAST, 1).gainers[0];
    var ev = IL.trajectory(DATA, "Evotti");
    var cards = [
      kpi("Total market", units(mk.totals[LAST]), (mk.delta_pct * 100).toFixed(0) + "% vs " + DATA.labels[0], mk.delta_pct < 0 ? "down" : "up"),
      kpi("Market leader", leader.make, share(leader.share) + " share", ""),
      kpi("Fastest riser", gain.make, IL.signedPct(gain.delta) + " share since " + DATA.labels[0], "up"),
      kpi("Evotti", "#" + ev.rank_share[LAST] + " · " + share(ev.share[LAST]), units(ev.units[LAST]) + " registrations", ""),
    ];
    $("kpis").innerHTML = cards.join("");
  }
  function kpi(label, big, sub, dir) {
    var cls = dir === "down" ? "neg" : dir === "up" ? "pos" : "";
    return '<div class="kpi"><div class="k-label">' + esc(label) + '</div>' +
      '<div class="k-value">' + esc(big) + '</div>' +
      '<div class="k-sub ' + cls + '">' + esc(sub) + '</div></div>';
  }

  // Top makes' market-share trend across the five periods.
  function trendChart(host, topN) {
    var top = IL.ranking(DATA, "share", LAST, topN || 6);
    var series = top.map(function (r, i) {
      var t = IL.trajectory(DATA, r.make);
      return { label: r.make, color: PALETTE[i % PALETTE.length],
        values: t.share.map(function (v) { return Math.round((v || 0) * 1000) / 10; }) };
    });
    host.innerHTML = "";
    host.appendChild(SC.lineChart(DATA.labels, series, { fmt: fmtFor("pct"), height: 300 }));
    return series;
  }
  function renderTrend() {
    $("trend-cap").textContent = "Market share by trailing-12-month period · top makes by current share";
    var series = trendChart($("trend"), 6);
    $("trend-legend").innerHTML = series.map(function (s) {
      return '<span><i class="bar" style="background:' + s.color + '"></i>' + esc(s.make || s.label) + '</span>';
    }).join("");
  }

  // ---- leaderboard ---------------------------------------------------------
  var showAll = false;
  function renderBoard() {
    var rows = IL.ranking(DATA, "share", LAST, 0);
    var shown = showAll ? rows : rows.slice(0, 15);
    // Always keep Evotti visible even when it ranks outside the top 15.
    var evottiShown = shown.some(function (r) { return r.make.toLowerCase() === "evotti"; });
    if (!evottiShown) {
      var ev = rows.filter(function (r) { return r.make.toLowerCase() === "evotti"; })[0];
      if (ev) shown = shown.concat([ev]);
    }
    $("board-cap").textContent = "By market share · " + DATA.labels[LAST] +
      " · change is share points vs " + DATA.labels[0] + (showAll ? "" : " · top 15 + Evotti");
    var head = "<thead><tr><th>#</th><th>Make</th><th class='num'>Registrations</th>" +
      "<th class='num'>Share</th><th class='num'>Δ vs " + esc(DATA.labels[0].replace("TTM ", "")) + "</th></tr></thead>";
    var body = shown.map(function (r) {
      var t = IL.trajectory(DATA, r.make);
      var d = (r.share - (t.share[0] || 0)) * 100;
      var dcls = d >= 0 ? "up" : "down";
      var me = r.make.toLowerCase() === "evotti" ? " class='me'" : "";
      return "<tr" + me + "><td class='rank'>" + r.rank + "</td>" +
        "<td class='mk'>" + esc(r.make) + "</td>" +
        "<td class='num'>" + units(r.units) + "</td>" +
        "<td class='num'>" + share(r.share) + "</td>" +
        "<td class='num delta " + dcls + "'>" + (d >= 0 ? "+" : "") + d.toFixed(1) + "pts</td></tr>";
    }).join("");
    $("board").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  // ---- the agent drawer ----------------------------------------------------
  var SUGGESTS = [
    "Who leads the pontoon market?",
    "How is Evotti doing?",
    "Who's gaining share the fastest?",
    "Who's losing the most share?",
    "How has Barletta trended?",
    "Is the pontoon market growing?",
  ];
  function renderSuggests() {
    $("suggests").innerHTML = SUGGESTS.map(function (q) {
      return '<button class="chip" data-q="' + esc(q) + '">' + esc(q) + "</button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#suggests .chip"), function (b) {
      b.onclick = function () { $("ask").value = b.getAttribute("data-q"); submitAsk(); };
    });
  }

  function openAsk() {
    $("ask-drawer").classList.add("open");
    $("ask-drawer").setAttribute("aria-hidden", "false");
    $("ask-open").setAttribute("aria-expanded", "true");
    $("ask-scrim").hidden = false;
    $("ask").value = "";
    setTimeout(function () { $("ask").focus(); }, 60);
  }
  function closeAsk() {
    $("ask-drawer").classList.remove("open");
    $("ask-drawer").setAttribute("aria-hidden", "true");
    $("ask-open").setAttribute("aria-expanded", "false");
    $("ask-scrim").hidden = true;
  }
  function submitAsk() {
    var q = $("ask").value.trim();
    if (!q) return;
    $("ask").value = "";
    closeAsk();
    ask(q);
  }

  function ask(q) {
    renderAnswer(q, "Working…", "", "live", null);
    fetch("/.netlify/functions/infolink-ask", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.chart) {
        renderAnswer(q, data.chart.title, data.answer || "", data.source === "rules" ? "rules" : "live", drawFromChart(data.chart));
      } else {
        computeLocal(q);
      }
    }).catch(function () { computeLocal(q); });
  }

  // Fallback: compute entirely in the browser (no function needed).
  function computeLocal(q) {
    var spec = IL.interpret(DATA, q);
    var result = IL.runSpec(DATA, spec);
    var chart = IL.buildChart(DATA, spec);
    renderAnswer(q, chart.title, IL.describe(DATA, spec, result), "rules", drawFromChart(chart));
  }

  function renderAnswer(q, title, text, source, drawChart) {
    var wrap = document.createElement("div");
    wrap.className = "answer";
    wrap.innerHTML =
      '<div class="a-q">' + esc(q) + "</div>" +
      '<div class="a-title">' + esc(title || "") + "</div>" +
      (text ? '<div class="a-text">' + esc(text) + "</div>" : "") +
      '<div class="chart-slot"></div>' +
      '<div class="a-src">Answered from <span class="tag ' + (source === "live" ? "live" : "") + '">' +
      (source === "live" ? "live agent" : "built-in rules") + "</span></div>";
    if (drawChart) drawChart(wrap.querySelector(".chart-slot"));
    var slot = $("answer");
    slot.innerHTML = "";
    slot.appendChild(wrap);
    slot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Draw the explicit chart the agent (or fallback) returned.
  function drawFromChart(chart) {
    return function (slot) {
      if (!chart || !chart.categories || !chart.categories.length) return;
      var fmt = fmtFor(chart.unit);
      if (chart.kind === "variance") {
        slot.appendChild(SC.varianceBars(chart.categories, chart.values,
          { suffix: chart.unit === "pts" ? "pts" : "", height: 260 }));
        slot.insertAdjacentHTML("beforeend", legend("Gained", "Gave up"));
        return;
      }
      var series = chart.series.map(function (s, i) {
        return { values: s.values, color: i === 0 ? ACCENT : GRAY };
      });
      var svg = chart.kind === "line"
        ? SC.lineChart(chart.categories, series, { fmt: fmt, height: 280 })
        : SC.groupedBars(chart.categories, series, { fmt: fmt, height: 300 });
      slot.appendChild(svg);
      if (chart.series.length > 1 || chart.kind === "line") {
        slot.insertAdjacentHTML("beforeend",
          legend(chart.series[0].label, chart.series[1] ? chart.series[1].label : ""));
      }
    };
  }
  function legend(a, b) {
    var one = '<span><i class="bar" style="background:' + ACCENT + '"></i>' + esc(a) + "</span>";
    var two = b ? '<span><i class="bar" style="background:' + GRAY + '"></i>' + esc(b) + "</span>" : "";
    return '<div class="legend">' + one + two + "</div>";
  }

  // ---- expand modal + export ----------------------------------------------
  function wireExtras() {
    $("toggle-all").onclick = function () {
      showAll = !showAll;
      this.textContent = showAll ? "Top 15" : "Show all";
      renderBoard();
    };
    $("export").onclick = exportCsv;
    var maxBtn = document.querySelector('[data-max="trend"]');
    if (maxBtn) maxBtn.onclick = function () {
      $("modal-title").textContent = "Market share trend — top makes";
      var body = $("modal-body"); body.innerHTML = "";
      var host = document.createElement("div");
      body.appendChild(host);
      var series = trendChart(host, 8);
      body.insertAdjacentHTML("beforeend", '<div class="legend">' + series.map(function (s) {
        return '<span><i class="bar" style="background:' + s.color + '"></i>' + esc(s.make || s.label) + "</span>";
      }).join("") + "</div>");
      $("modal").hidden = false;
    };
    $("modal-close").onclick = function () { $("modal").hidden = true; };
    $("modal").onclick = function (e) { if (e.target === $("modal")) $("modal").hidden = true; };
  }
  function exportCsv() {
    var rows = IL.ranking(DATA, "share", LAST, 0);
    var head = ["Rank", "Make", "Registrations (" + DATA.labels[LAST] + ")", "Share"];
    var lines = [head.join(",")];
    rows.forEach(function (r) {
      lines.push([r.rank, '"' + r.make + '"', Math.round(r.units), (r.share * 100).toFixed(2) + "%"].join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "infolink-pontoon-" + DATA.labels[LAST].replace(/[^0-9]/g, "") + ".csv";
    a.click();
  }

  // ---- init ----------------------------------------------------------------
  function wireAsk() {
    $("ask-open").onclick = openAsk;
    $("ask-close").onclick = closeAsk;
    $("ask-scrim").onclick = closeAsk;
    $("ask-go").onclick = submitAsk;
    $("ask").addEventListener("keydown", function (e) { if (e.key === "Enter") submitAsk(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAsk(); });
  }

  renderChrome();
  renderSpotlight();
  renderKpis();
  renderTrend();
  renderBoard();
  renderSuggests();
  wireAsk();
  wireExtras();
})();
