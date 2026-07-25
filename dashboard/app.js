// =============================================================================
// Evotti Dashboard — daily briefing (Huntington floor-plan payoffs & balance)
// =============================================================================
// Persona-aware, no login (demo switcher):
//   Leadership -> all dealers, with dealer + model filters; click a dealer to
//                 drill into its unit (HIN) detail.
//   Dealer     -> a single dealer's own account only (pick which for the demo).
//
// "Current month" = the data's as-of month (July 2026, MTD). We show payoffs the
// dealer made to Huntington this month and the outstanding floor-plan balance
// (units still on floor). Data is bundled in huntington-data.js.
// =============================================================================

(function () {
  "use strict";

  var DATA = window.EVOTTI_HUNTINGTON || { asOf: "2026-07-24", units: [] };
  var UNITS = DATA.units;
  var AS_OF = DATA.asOf;
  var CUR_MONTH = AS_OF.slice(0, 7);

  var REGION_OF = {}, DEALERS = [], MODELS = [];
  (function () {
    var ds = {}, ms = {};
    UNITS.forEach(function (u) {
      if (!ds[u.dealer]) { ds[u.dealer] = 1; DEALERS.push(u.dealer); REGION_OF[u.dealer] = u.region; }
      if (!ms[u.model]) { ms[u.model] = 1; MODELS.push(u.model); }
    });
    DEALERS.sort();
    MODELS.sort();
  })();

  var PERSONAS = [{ key: "leadership", name: "Leadership" }, { key: "dealer", name: "Dealer" }];
  var persona = "leadership", dealerIdx = 0;
  var dealerFilter = "all", modelFilter = "all";

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function monthName(ym) {
    return new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  function isMtdPayoff(u) {
    return u.status === "paid_off" && u.payoff_date && u.payoff_date.slice(0, 7) === CUR_MONTH;
  }

  // ---- scope + metrics -----------------------------------------------------
  function scopedUnits() {
    if (persona === "dealer") {
      var dn = DEALERS[dealerIdx];
      return UNITS.filter(function (u) { return u.dealer === dn; });
    }
    var us = UNITS;
    if (dealerFilter !== "all") us = us.filter(function (u) { return u.dealer === dealerFilter; });
    if (modelFilter !== "all") us = us.filter(function (u) { return u.model === modelFilter; });
    return us;
  }
  function metrics(us) {
    var m = { paid: 0, np: 0, bal: 0, nf: 0 };
    us.forEach(function (u) {
      if (isMtdPayoff(u)) { m.paid += u.payoff_amount; m.np++; }
      else if (u.status === "on_floor") { m.bal += u.huntington_advance; m.nf++; }
    });
    return m;
  }

  // ---- render --------------------------------------------------------------
  function renderSwitch() {
    $("switch").innerHTML = PERSONAS.map(function (p) {
      return '<button class="sw-btn' + (p.key === persona ? " active" : "") +
        '" data-k="' + p.key + '">' + esc(p.name) + "</button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".sw-btn"), function (b) {
      b.onclick = function () {
        persona = b.getAttribute("data-k");
        dealerFilter = "all"; modelFilter = "all";
        render();
      };
    });
  }

  function render() {
    renderSwitch();

    var d = new Date(AS_OF + "T00:00:00");
    $("greeting").textContent = "Good morning.";
    $("asof").textContent = "As of " + d.toLocaleDateString("en-US",
      { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    if (persona === "dealer") {
      $("eyebrow").textContent = REGION_OF[DEALERS[dealerIdx]] + " · Dealer view";
      $("dealer-pick").innerHTML =
        '<div class="dealer-pick">Dealer account <select id="dsel">' +
        DEALERS.map(function (dn, i) {
          return '<option value="' + i + '"' + (i === dealerIdx ? " selected" : "") + ">" +
            esc(dn + " · " + REGION_OF[dn]) + "</option>";
        }).join("") + "</select></div>";
      $("dsel").onchange = function () { dealerIdx = +this.value; render(); };
    } else {
      $("eyebrow").textContent = "Leadership · all dealers";
      $("dealer-pick").innerHTML = "";
    }

    var us = scopedUnits();
    var m = metrics(us);
    var showByDealer = (persona === "leadership" && dealerFilter === "all");
    var scopeName = persona === "dealer" ? DEALERS[dealerIdx] : (dealerFilter !== "all" ? dealerFilter : null);

    $("hcap").textContent = "Payoffs to Huntington & outstanding floor-plan balance · " +
      monthName(CUR_MONTH) + " MTD" +
      (showByDealer ? " · all dealers" : (scopeName ? " · " + scopeName + " — unit detail" : ""));

    $("kpis").innerHTML = [
      kpi("Paid to Huntington · MTD", money(m.paid), m.np + " payoff" + (m.np === 1 ? "" : "s"), "green"),
      kpi("Payoffs · MTD", String(m.np), "boats retailed &amp; cleared", ""),
      kpi("Outstanding balance", money(m.bal), m.nf + " unit" + (m.nf === 1 ? "" : "s") + " on floor", "amber"),
      kpi("Units on floor", String(m.nf), "financed inventory", "")
    ].join("");

    renderFilters();
    if (showByDealer) renderByDealer(us);
    else renderByHin(us);
  }

  function kpi(label, val, sub, tone) {
    return '<div class="kpi ' + (tone || "") + '"><div class="k-label">' + label +
      '</div><div class="k-val">' + val + '</div><div class="k-sub">' + sub + "</div></div>";
  }

  function renderFilters() {
    if (persona !== "leadership") { $("filters").innerHTML = ""; return; }
    $("filters").innerHTML =
      '<span class="flabel">Dealer</span><select id="f-dealer"><option value="all">All dealers</option>' +
      DEALERS.map(function (dn) {
        return '<option value="' + esc(dn) + '"' + (dealerFilter === dn ? " selected" : "") + ">" + esc(dn) + "</option>";
      }).join("") + "</select>" +
      '<span class="flabel">Model</span><select id="f-model"><option value="all">All models</option>' +
      MODELS.map(function (mn) {
        return '<option value="' + esc(mn) + '"' + (modelFilter === mn ? " selected" : "") + ">" + esc(mn) + "</option>";
      }).join("") + "</select>" +
      ((dealerFilter !== "all" || modelFilter !== "all") ? '<button class="linkbtn" id="f-clear">Clear filters</button>' : "");
    $("f-dealer").onchange = function () { dealerFilter = this.value; render(); };
    $("f-model").onchange = function () { modelFilter = this.value; render(); };
    if ($("f-clear")) $("f-clear").onclick = function () { dealerFilter = "all"; modelFilter = "all"; render(); };
  }

  function renderByDealer(us) {
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

    $("htable").innerHTML =
      "<thead><tr><th>Dealer</th><th class='hide-sm'>Region</th><th class='num'>Paid MTD</th>" +
      "<th class='num'>Payoffs</th><th class='num'>On-floor balance</th><th class='num hide-sm'>On floor</th><th></th></tr></thead><tbody>" +
      rows.map(function (o) {
        return '<tr class="clickrow" data-dealer="' + esc(o.dn) + '">' +
          "<td><b>" + esc(o.dn) + "</b></td><td class='hide-sm'>" + esc(o.r) + "</td>" +
          '<td class="num">' + money(o.x.paid) + "</td><td class='num'>" + o.x.np + "</td>" +
          '<td class="num">' + money(o.x.bal) + "</td><td class='num hide-sm'>" + o.x.nf + "</td>" +
          '<td class="go">HINs &rarr;</td></tr>';
      }).join("") + "</tbody>";

    Array.prototype.forEach.call(document.querySelectorAll(".clickrow"), function (tr) {
      tr.onclick = function () { dealerFilter = tr.getAttribute("data-dealer"); render(); };
    });
  }

  function renderByHin(us) {
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

    $("htable").innerHTML =
      "<thead><tr><th>HIN</th><th>Model</th><th class='hide-sm'>Floored</th><th>Status</th>" +
      "<th>Payoff date</th><th class='num'>Amount</th></tr></thead><tbody>" +
      (body || '<tr><td colspan="6" class="empty">No current-month payoffs or on-floor units for this selection.</td></tr>') +
      "</tbody>";
  }

  render();
})();
