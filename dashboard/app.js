// =============================================================================
// Evotti Dashboard — executive daily briefing
// =============================================================================
// The default landing page: an at-a-glance grid of SUMMARY cards, composed by
// persona. Every card shows its headline numbers immediately (no click to see
// the business) and carries an Expand button that opens the full, filterable
// detail report in a modal.
//
//   Leadership -> Huntington (all dealers) + Yesterday's Sales + Production KPIs
//   Dealer     -> Huntington (their account) + dealer-relevant cards
//
// Huntington data is real (huntington-data.js); Yesterday's Sales is real (from
// the sales app's data.js); Production/etc. are clearly-labelled Sample cards to
// convey the concept. No login — a demo persona switcher stands in.
// =============================================================================

(function () {
  "use strict";

  var HUNT = window.EVOTTI_HUNTINGTON || { asOf: "2026-07-24", units: [] };
  var UNITS = HUNT.units;
  var AS_OF = HUNT.asOf;
  var CUR_MONTH = AS_OF.slice(0, 7);
  var SALES = window.EVOTTI_SALES || null;

  var REGION_OF = {}, DEALERS = [], MODELS = [];
  (function () {
    var ds = {}, ms = {};
    UNITS.forEach(function (u) {
      if (!ds[u.dealer]) { ds[u.dealer] = 1; DEALERS.push(u.dealer); REGION_OF[u.dealer] = u.region; }
      if (!ms[u.model]) { ms[u.model] = 1; MODELS.push(u.model); }
    });
    DEALERS.sort(); MODELS.sort();
  })();

  var PERSONAS = [
    { key: "leadership", name: "Leadership" },
    { key: "sales", name: "Sales" },
    { key: "controller", name: "Controller" },
    { key: "dealer", name: "Dealer" }
  ];
  var persona = "leadership", dealerIdx = 0;
  var dealerFilter = "all", modelFilter = "all";   // detail-modal state

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function pct(v) { return (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; }
  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function niceDay(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function monthName(ym) {
    return new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  function prevWorkday(iso) {
    var d = new Date(iso + "T00:00:00");
    do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return d.toISOString().slice(0, 10);
  }
  function SVG(p) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>";
  }
  function isMtdPayoff(u) {
    return u.status === "paid_off" && u.payoff_date && u.payoff_date.slice(0, 7) === CUR_MONTH;
  }
  function statTiles(rows) {
    return '<div class="kpis">' + rows.map(function (r) {
      return '<div class="kpi ' + (r[3] || "") + '"><div class="k-label">' + r[0] +
        '</div><div class="k-val">' + r[1] + '</div><div class="k-sub">' + r[2] + "</div></div>";
    }).join("") + "</div>";
  }

  // ---- Huntington scope + metrics -----------------------------------------
  function huntScope() {
    return persona === "dealer"
      ? UNITS.filter(function (u) { return u.dealer === DEALERS[dealerIdx]; })
      : UNITS;
  }
  function huntMetrics(us) {
    var m = { paid: 0, np: 0, bal: 0, nf: 0 };
    us.forEach(function (u) {
      if (isMtdPayoff(u)) { m.paid += u.payoff_amount; m.np++; }
      else if (u.status === "on_floor") { m.bal += u.huntington_advance; m.nf++; }
    });
    return m;
  }

  // ==========================================================================
  // CARD REGISTRY
  // ==========================================================================
  var CARDS = {
    huntington: {
      title: "Huntington Floor Plan", color: "#2f6f8f", badge: "live", span: "full",
      icon: SVG('<path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/>'),
      summary: function (el) {
        var m = huntMetrics(huntScope());
        el.innerHTML =
          statTiles([
            ["Receipts to Huntington · MTD", money(m.paid), m.np + " payoff" + (m.np === 1 ? "" : "s") + " cleared", "green"],
            ["Outstanding floor-plan balance", money(m.bal), m.nf + " unit" + (m.nf === 1 ? "" : "s") + " on floor", "amber"]
          ]);
      },
      detail: { title: "Huntington Floor Plan — payoffs & balance", render: renderHuntingtonDetail }
    },

    yesterday_sales: {
      title: "Yesterday's Sales", color: "#17786b", badge: "live", span: "half",
      icon: SVG('<path d="M4 4v16h16"/><rect x="7" y="11" width="2.6" height="6" rx="0.6"/><rect x="11.7" y="7.5" width="2.6" height="9.5" rx="0.6"/><rect x="16.4" y="13.5" width="2.6" height="3.5" rx="0.6"/>'),
      summary: renderYesterdaySummary,
      detail: SALES ? { title: "Yesterday's sales by region", render: renderYesterdayDetail } : null
    },

    production: {
      title: "Production KPIs", color: "#5a54c9", badge: "sample", span: "half",
      icon: SVG('<path d="M3 20h18"/><path d="M4 20V10l5 3V9l5 3V9l5 3v8"/>'),
      summary: function (el) {
        el.innerHTML =
          statTiles([
            ["Hulls completed · MTD", "92", "94% on-time", ""],
            ["Avg build cycle", "38 days", "target 40", ""]
          ]) +
          '<p class="ph-note">Sample figures — wires up to the production floor system.</p>';
      },
      detail: null
    },

    inventory_aging: {
      title: "Inventory Aging", color: "#b5761f", badge: "sample", span: "half",
      icon: SVG('<rect x="3" y="8" width="8" height="8" rx="1"/><circle cx="17" cy="14" r="4"/><path d="M17 12.4V14l1.2 1"/>'),
      summary: function (el) {
        el.innerHTML =
          statTiles([
            ["Units &gt; 120 days", "3", "approaching curtailment", "amber"],
            ["Oldest unit", "168 days", "320 Flagship", ""]
          ]) +
          '<p class="ph-note">Sample figures — the aging &amp; curtailment view lands next.</p>';
      },
      detail: null
    },

    open_claims: {
      title: "Warranty & Service", color: "#3f7d54", badge: "sample", span: "half",
      icon: SVG('<path d="M12 3.2 19 6v5.5c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6z"/><path d="M9 12l2.1 2.1L15.2 10"/>'),
      summary: function (el) {
        el.innerHTML =
          statTiles([
            ["Open claims", "2", "avg 4 days to resolve", ""],
            ["Awaiting parts", "1", "no aging alerts", ""]
          ]) +
          '<p class="ph-note">Sample figures — connects to the warranty app.</p>';
      },
      detail: null
    },

    sales_mtd: {
      title: "Sales vs Plan · Month to Date", color: "#17786b", badge: "live", span: "full",
      icon: SVG('<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7.5 14l3.2-3.6 3 2.4L20 7"/>'),
      summary: function (el) {
        if (!SALES) { el.innerHTML = '<p class="ph-note">Sales data unavailable.</p>'; return; }
        var a = mtdAgg();
        var vpr = a.rf ? (a.ra - a.rf) / a.rf * 100 : 0;
        var vpu = a.uf ? (a.ua - a.uf) / a.uf * 100 : 0;
        el.innerHTML = statTiles([
          ["Revenue · MTD", money(a.ra), pct(vpr) + " vs plan", vpr >= 0 ? "green" : "amber"],
          ["Boats delivered · MTD", String(a.ua), pct(vpu) + " vs plan (" + Math.round(a.uf) + ")", vpu >= 0 ? "green" : "amber"]
        ]);
      },
      detail: SALES ? { title: "Sales vs plan by region · month to date", render: renderMtdDetail } : null
    },

    pipeline: {
      title: "Pipeline & Leads", color: "#a83435", badge: "sample", span: "half",
      icon: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3.6 19.5a5.4 5.4 0 0 1 10.8 0"/><path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.9"/><path d="M17.8 19.5a5.4 5.4 0 0 0-2.3-4.4"/>'),
      summary: function (el) {
        el.innerHTML =
          statTiles([
            ["Open leads", "34", "8 hot", ""],
            ["Configurator sessions", "128", "+12% wk/wk", ""]
          ]) +
          '<p class="ph-note">Sample figures — connects to the CRM &amp; Boat Builder.</p>';
      },
      detail: null
    },

    cash_position: {
      title: "Cash Position", color: "#3f7d54", badge: "sample", span: "half",
      icon: SVG('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M6 9v6M18 9v6"/>'),
      summary: function (el) {
        el.innerHTML =
          statTiles([
            ["Operating cash", "$4.2M", "across 3 accounts", ""],
            ["AP due · 7 days", "$1.1M", "12 invoices", "amber"]
          ]) +
          '<p class="ph-note">Sample figures — connects to the GL &amp; bank feeds.</p>';
      },
      detail: null
    }
  };

  var LAYOUT = {
    leadership: ["huntington", "yesterday_sales", "production"],
    sales: ["sales_mtd", "yesterday_sales", "pipeline"],
    controller: ["huntington", "yesterday_sales", "cash_position"],
    dealer: ["huntington", "inventory_aging", "open_claims"]
  };

  // ---- Yesterday's Sales (real, from the sales app data) -------------------
  function yesterdayAgg() {
    var y = prevWorkday(SALES.asOf), a = { day: y, ra: 0, rf: 0, ua: 0, uf: 0 };
    SALES.rows.forEach(function (r) {
      if (r.sale_date === y) { a.ra += r.revenue_actual; a.rf += r.revenue_forecast; a.ua += r.units_actual; a.uf += r.units_forecast; }
    });
    return a;
  }
  function renderYesterdaySummary(el) {
    if (!SALES) { el.innerHTML = '<p class="ph-note">Sales data unavailable.</p>'; return; }
    var a = yesterdayAgg();
    var vp = a.rf ? (a.ra - a.rf) / a.rf * 100 : 0;
    el.innerHTML = statTiles([
      ["Revenue · " + niceDay(a.day), money(a.ra), pct(vp) + " vs plan", vp >= 0 ? "green" : "amber"],
      ["Boats delivered", String(a.ua), "vs " + Math.round(a.uf) + " plan", ""]
    ]);
  }
  function renderYesterdayDetail(el) {
    var y = prevWorkday(SALES.asOf), g = {};
    SALES.rows.forEach(function (r) {
      if (r.sale_date === y) {
        var x = g[r.region] || (g[r.region] = { ra: 0, rf: 0, ua: 0 });
        x.ra += r.revenue_actual; x.rf += r.revenue_forecast; x.ua += r.units_actual;
      }
    });
    var rows = Object.keys(g).map(function (k) { return { region: k, x: g[k] }; })
      .sort(function (a, b) { return b.x.ra - a.x.ra; });
    el.innerHTML =
      '<p class="cap dc-scope">Company-wide · ' + niceDay(y) + '</p>' +
      '<div class="tbl-wrap"><table class="tbl htbl"><thead><tr><th>Region</th>' +
      "<th class='num'>Revenue</th><th class='num'>Plan</th><th class='num'>Var</th><th class='num'>Boats</th></tr></thead><tbody>" +
      rows.map(function (o) {
        var vp = o.x.rf ? (o.x.ra - o.x.rf) / o.x.rf * 100 : 0;
        return "<tr><td>" + esc(o.region) + "</td><td class='num'>" + money(o.x.ra) + "</td>" +
          "<td class='num'>" + money(o.x.rf) + "</td>" +
          "<td class='num " + (vp >= 0 ? "up" : "down") + "'>" + pct(vp) + "</td>" +
          "<td class='num'>" + o.x.ua + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  // ---- Sales · month-to-date (real, from the sales app data) --------------
  function mtdAgg() {
    var mo = SALES.asOf.slice(0, 7), a = { ra: 0, rf: 0, ua: 0, uf: 0 };
    SALES.rows.forEach(function (r) {
      if (r.sale_date.slice(0, 7) === mo) { a.ra += r.revenue_actual; a.rf += r.revenue_forecast; a.ua += r.units_actual; a.uf += r.units_forecast; }
    });
    return a;
  }
  function renderMtdDetail(el) {
    var mo = SALES.asOf.slice(0, 7), g = {};
    SALES.rows.forEach(function (r) {
      if (r.sale_date.slice(0, 7) === mo) {
        var x = g[r.region] || (g[r.region] = { ra: 0, rf: 0, ua: 0 });
        x.ra += r.revenue_actual; x.rf += r.revenue_forecast; x.ua += r.units_actual;
      }
    });
    var rows = Object.keys(g).map(function (k) { return { region: k, x: g[k] }; })
      .sort(function (a, b) { return b.x.ra - a.x.ra; });
    el.innerHTML =
      '<p class="cap dc-scope">Company-wide · ' + monthName(mo) + ' MTD</p>' +
      '<div class="tbl-wrap"><table class="tbl htbl"><thead><tr><th>Region</th>' +
      "<th class='num'>Revenue</th><th class='num'>Plan</th><th class='num'>Var</th><th class='num'>Boats</th></tr></thead><tbody>" +
      rows.map(function (o) {
        var vp = o.x.rf ? (o.x.ra - o.x.rf) / o.x.rf * 100 : 0;
        return "<tr><td>" + esc(o.region) + "</td><td class='num'>" + money(o.x.ra) + "</td>" +
          "<td class='num'>" + money(o.x.rf) + "</td><td class='num " + (vp >= 0 ? "up" : "down") + "'>" + pct(vp) + "</td>" +
          "<td class='num'>" + o.x.ua + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  // ---- Huntington detail report (filterable + drill) ----------------------
  function detailScoped() {
    var us = persona === "dealer"
      ? UNITS.filter(function (u) { return u.dealer === DEALERS[dealerIdx]; })
      : (dealerFilter !== "all" ? UNITS.filter(function (u) { return u.dealer === dealerFilter; }) : UNITS);
    if (modelFilter !== "all") us = us.filter(function (u) { return u.model === modelFilter; });
    return us;
  }
  function renderHuntingtonDetail(el) {
    var showByDealer = (persona !== "dealer" && dealerFilter === "all");
    var us = detailScoped();
    var m = huntMetrics(us);
    var scopeName = persona === "dealer" ? DEALERS[dealerIdx] : (dealerFilter !== "all" ? dealerFilter : null);

    el.innerHTML =
      '<p class="cap dc-scope">' + monthName(CUR_MONTH) + " MTD" +
      (showByDealer ? " · all dealers" : (scopeName ? " · " + scopeName + " — unit detail" : "")) + "</p>" +
      statTiles([
        ["Receipts · MTD", money(m.paid), m.np + " payoffs", "green"],
        ["Payoffs · MTD", String(m.np), "boats cleared", ""],
        ["Outstanding balance", money(m.bal), m.nf + " on floor", "amber"],
        ["Units on floor", String(m.nf), "financed inventory", ""]
      ]) +
      '<div class="filters" id="dfilters"></div>' +
      '<div class="tbl-wrap"><table class="tbl htbl" id="dtable"></table></div>';

    renderDetailFilters(el);
    if (showByDealer) renderDetailByDealer(el, us);
    else renderDetailByHin(us);
  }

  function renderDetailFilters(el) {
    var box = $("dfilters"); if (!box) return;
    var html = "";
    if (persona !== "dealer") {
      html += '<span class="flabel">Dealer</span><select id="d-dealer"><option value="all">All dealers</option>' +
        DEALERS.map(function (dn) { return '<option value="' + esc(dn) + '"' + (dealerFilter === dn ? " selected" : "") + ">" + esc(dn) + "</option>"; }).join("") + "</select>";
    }
    html += '<span class="flabel">Model</span><select id="d-model"><option value="all">All models</option>' +
      MODELS.map(function (mn) { return '<option value="' + esc(mn) + '"' + (modelFilter === mn ? " selected" : "") + ">" + esc(mn) + "</option>"; }).join("") + "</select>";
    if (dealerFilter !== "all" || modelFilter !== "all") html += '<button class="linkbtn" id="d-clear">Clear filters</button>';
    box.innerHTML = html;
    if ($("d-dealer")) $("d-dealer").onchange = function () { dealerFilter = this.value; renderHuntingtonDetail(el); };
    $("d-model").onchange = function () { modelFilter = this.value; renderHuntingtonDetail(el); };
    if ($("d-clear")) $("d-clear").onclick = function () { dealerFilter = "all"; modelFilter = "all"; renderHuntingtonDetail(el); };
  }

  function renderDetailByDealer(el, us) {
    var g = {};
    DEALERS.forEach(function (dn) { g[dn] = { paid: 0, np: 0, bal: 0, nf: 0 }; });
    us.forEach(function (u) {
      var x = g[u.dealer]; if (!x) return;
      if (isMtdPayoff(u)) { x.paid += u.payoff_amount; x.np++; }
      else if (u.status === "on_floor") { x.bal += u.huntington_advance; x.nf++; }
    });
    var rows = DEALERS.map(function (dn) { return { dn: dn, r: REGION_OF[dn], x: g[dn] }; })
      .filter(function (o) { return o.x.np || o.x.nf; })
      .sort(function (a, b) { return b.x.paid - a.x.paid; });
    $("dtable").innerHTML =
      "<thead><tr><th>Dealer</th><th class='hide-sm'>Region</th><th class='num'>Paid MTD</th>" +
      "<th class='num'>Payoffs</th><th class='num'>On-floor balance</th><th class='num hide-sm'>On floor</th><th></th></tr></thead><tbody>" +
      rows.map(function (o) {
        return '<tr class="clickrow" data-dealer="' + esc(o.dn) + '"><td><b>' + esc(o.dn) + "</b></td>" +
          "<td class='hide-sm'>" + esc(o.r) + "</td><td class='num'>" + money(o.x.paid) + "</td>" +
          "<td class='num'>" + o.x.np + "</td><td class='num'>" + money(o.x.bal) + "</td>" +
          "<td class='num hide-sm'>" + o.x.nf + "</td><td class='go'>HINs &rarr;</td></tr>";
      }).join("") + "</tbody>";
    Array.prototype.forEach.call(document.querySelectorAll("#dtable .clickrow"), function (tr) {
      tr.onclick = function () { dealerFilter = tr.getAttribute("data-dealer"); renderHuntingtonDetail(el); };
    });
  }

  function renderDetailByHin(us) {
    var payoffs = us.filter(isMtdPayoff).sort(function (a, b) { return b.payoff_amount - a.payoff_amount; });
    var floor = us.filter(function (u) { return u.status === "on_floor"; })
      .sort(function (a, b) { return b.huntington_advance - a.huntington_advance; });
    var body = payoffs.map(function (u) {
      return "<tr><td class='mono'>" + esc(u.hin) + "</td><td>" + esc(u.model) + "</td>" +
        "<td class='hide-sm'>" + fmtDate(u.floored_date) + "</td>" +
        '<td><span class="tagp paid">Paid off</span></td><td>' + fmtDate(u.payoff_date) + "</td>" +
        "<td class='num'><b>" + money(u.payoff_amount) + "</b></td></tr>";
    }).concat(floor.map(function (u) {
      return "<tr><td class='mono'>" + esc(u.hin) + "</td><td>" + esc(u.model) + "</td>" +
        "<td class='hide-sm'>" + fmtDate(u.floored_date) + "</td>" +
        '<td><span class="tagp floor">On floor</span></td><td>—</td>' +
        "<td class='num'>" + money(u.huntington_advance) + "</td></tr>";
    })).join("");
    $("dtable").innerHTML =
      "<thead><tr><th>HIN</th><th>Model</th><th class='hide-sm'>Floored</th><th>Status</th>" +
      "<th>Payoff date</th><th class='num'>Amount</th></tr></thead><tbody>" +
      (body || '<tr><td colspan="6" class="empty">No current-month payoffs or on-floor units.</td></tr>') + "</tbody>";
  }

  // ---- shell ---------------------------------------------------------------
  function renderSwitch() {
    $("switch").innerHTML = PERSONAS.map(function (p) {
      return '<button class="sw-btn' + (p.key === persona ? " active" : "") + '" data-k="' + p.key + '">' + esc(p.name) + "</button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".sw-btn"), function (b) {
      b.onclick = function () { persona = b.getAttribute("data-k"); dealerFilter = "all"; modelFilter = "all"; render(); };
    });
  }

  function render() {
    renderSwitch();
    var d = new Date(AS_OF + "T00:00:00");
    $("greeting").textContent = "Good morning.";
    $("asof").textContent = "As of " + d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    if (persona === "dealer") {
      $("eyebrow").textContent = REGION_OF[DEALERS[dealerIdx]] + " · Dealer view";
      $("dealer-pick").innerHTML =
        '<div class="dealer-pick">Dealer account <select id="dsel">' +
        DEALERS.map(function (dn, i) {
          return '<option value="' + i + '"' + (i === dealerIdx ? " selected" : "") + ">" + esc(dn + " · " + REGION_OF[dn]) + "</option>";
        }).join("") + "</select></div>";
      $("dsel").onchange = function () { dealerIdx = +this.value; render(); };
    } else {
      $("dealer-pick").innerHTML = "";
      var eb = {
        leadership: "Leadership · whole business at a glance",
        sales: "Sales · today's numbers",
        controller: "Controller · financial position"
      };
      $("eyebrow").textContent = eb[persona] || "";
    }

    renderGrid();
  }

  function renderGrid() {
    var ids = LAYOUT[persona];
    $("grid").innerHTML = ids.map(function (id) {
      var c = CARDS[id];
      return '<section class="dash-card' + (c.span === "full" ? " span-full" : "") + '">' +
        '<div class="dc-head"><span class="dc-icon" style="--tc:' + c.color + '">' + c.icon + "</span>" +
        '<h2 class="dc-title">' + esc(c.title) + "</h2>" +
        '<span class="dc-badge ' + c.badge + '">' + (c.badge === "live" ? "Live" : "Sample") + "</span>" +
        (c.detail ? '<button class="dc-expand" data-card="' + id + '" title="Expand to detail" aria-label="Expand">' +
          SVG('<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>') + "</button>" : "") +
        '</div><div class="dc-body" id="body-' + id + '"></div></section>';
    }).join("");
    ids.forEach(function (id) { CARDS[id].summary($("body-" + id)); });
    Array.prototype.forEach.call(document.querySelectorAll(".dc-expand"), function (b) {
      b.onclick = function () { dealerFilter = "all"; modelFilter = "all"; openDetail(b.getAttribute("data-card")); };
    });
  }

  // ---- detail modal --------------------------------------------------------
  function openDetail(id) {
    var c = CARDS[id]; if (!c || !c.detail) return;
    $("modal-title").textContent = c.detail.title;
    c.detail.render($("modal-body"));
    $("modal").hidden = false;
  }
  function closeModal() { $("modal").hidden = true; }

  function init() {
    $("modal-close").onclick = closeModal;
    $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
    render();
  }

  init();
})();
