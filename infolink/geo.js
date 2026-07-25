// =============================================================================
// Evotti InfoLink — U.S. bubble (heat) map of pontoon registrations
// =============================================================================
// Real geographic U.S. map (Albers USA, from us-atlas, projected offline into
// infolink/usmap-geo.js) with a proportional "heat bubble" per state — radius
// and opacity encode registration volume for the SELECTED trailing-12-month
// period. Pick a year → the bubbles resize (one year at a time). Hover/tap a
// state for its share, rank, and top-county drill. No map library, no runtime
// fetches. Data: window.EVOTTI_INFOLINK_GEO + window.EVOTTI_USMAP.
// =============================================================================
(function () {
  "use strict";
  var G = window.EVOTTI_INFOLINK_GEO;
  var U = window.EVOTTI_USMAP;
  var host = document.getElementById("usmap");
  if (!G || !U || !host) return;

  var NAME = {
    AK:"Alaska",AL:"Alabama",AR:"Arkansas",AZ:"Arizona",CA:"California",CO:"Colorado",CT:"Connecticut",
    DC:"D.C.",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",IA:"Iowa",ID:"Idaho",IL:"Illinois",
    IN:"Indiana",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",MA:"Massachusetts",MD:"Maryland",ME:"Maine",
    MI:"Michigan",MN:"Minnesota",MO:"Missouri",MS:"Mississippi",MT:"Montana",NC:"North Carolina",
    ND:"North Dakota",NE:"Nebraska",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NV:"Nevada",
    NY:"New York",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",
    SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VA:"Virginia",
    VT:"Vermont",WA:"Washington",WI:"Wisconsin",WV:"West Virginia",WY:"Wyoming"
  };
  var LAND = "#eef2f4", LAND_ST = "#d5dae0", INK = "#16181c", MUTE = "#5c616b";
  var NS = "http://www.w3.org/2000/svg";
  var MAXR = 34;
  // Warm heat ramp (YlOrRd): pale yellow (low) -> deep red (high).
  var HEAT = [[255,237,160], [254,178,76], [240,110,40], [189,0,38]];
  var HEAT_CSS = "linear-gradient(90deg,#ffeda0,#feb24c,#f06e28,#bd0026)";
  function heat(t) {
    t = Math.max(0, Math.min(1, t));
    var n = HEAT.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i;
    var a = HEAT[i], b = HEAT[i + 1];
    return "rgb(" + Math.round(a[0] + (b[0]-a[0])*f) + "," + Math.round(a[1] + (b[1]-a[1])*f) + "," + Math.round(a[2] + (b[2]-a[2])*f) + ")";
  }

  var byCode = {};   G.states.forEach(function (s) { byCode[s.st] = s; });
  var usByCode = {}; U.states.forEach(function (s) { usByCode[s.code] = s; });
  var P = G.labels.length - 1;   // selected period (default latest)
  var selected = null;

  function num(v) { return Math.round(v || 0).toLocaleString("en-US"); }
  function val(code) { var s = byCode[code]; return s ? (s.units[P] || 0) : 0; }
  // Global max across ALL periods, so bubbles are comparable year-to-year —
  // flip the year and you can see the whole market shrink.
  var GMAX = Math.max.apply(null, G.states.map(function (s) { return Math.max.apply(null, s.units); }));
  function maxVal() { return GMAX; }
  function rOf(v, mx) { return v > 0 ? Math.max(2.5, Math.sqrt(v / mx) * MAXR) : 0; }
  function opOf(v, mx) { return 0.42 + 0.4 * Math.sqrt(v / mx); }
  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]; }); }

  // ---- shell ---------------------------------------------------------------
  host.innerHTML =
    '<div class="um-controls"><span class="um-lbl">Trailing 12 months ending</span>' +
    '<div class="um-periods" id="um-periods"></div></div>' +
    '<div class="um-wrap">' +
      '<div class="um-mapcol"><div id="um-svg"></div>' +
        '<div class="um-legend" id="um-legend"></div></div>' +
      '<div class="um-side"><div class="um-detail" id="um-detail"></div>' +
        '<div class="um-toplabel">Top states</div><ol class="um-top" id="um-top"></ol></div>' +
    '</div>';

  document.getElementById("um-periods").innerHTML = G.labels.map(function (l, i) {
    return '<button class="um-pill' + (i === P ? " active" : "") + '" data-p="' + i + '">' + l.replace("TTM ", "") + "</button>";
  }).join("");
  Array.prototype.forEach.call(host.querySelectorAll(".um-pill"), function (b) {
    b.onclick = function () {
      P = +b.getAttribute("data-p");
      Array.prototype.forEach.call(host.querySelectorAll(".um-pill"), function (x) { x.classList.toggle("active", x === b); });
      draw();
    };
  });

  // ---- the map -------------------------------------------------------------
  function drawMap() {
    var svg = el("svg", { viewBox: U.viewBox, width: "100%", role: "img",
      "aria-label": "U.S. pontoon registrations by state" });
    svg.style.height = "auto"; svg.style.display = "block";

    // base land: state polygons
    var land = el("g", {});
    U.states.forEach(function (s) {
      var p = el("path", { d: s.d, fill: LAND, stroke: LAND_ST, "stroke-width": 0.6,
        cursor: "pointer", "data-st": s.code });
      p.addEventListener("mouseenter", function () { selectState(s.code); });
      p.addEventListener("click", function () { selectState(s.code); });
      land.appendChild(p);
    });
    svg.appendChild(land);

    // heat bubbles, largest first so small ones stay clickable on top
    var mx = maxVal();
    var bub = el("g", {});
    U.states.slice().map(function (s) { return { s: s, v: val(s.code) }; })
      .sort(function (a, b) { return b.v - a.v; })
      .forEach(function (o) {
        if (o.v <= 0) return;
        var s = o.s, sel = s.code === selected;
        var c = el("circle", { cx: s.cx, cy: s.cy, r: rOf(o.v, mx),
          fill: heat(Math.sqrt(o.v / mx)), "fill-opacity": 0.82,
          stroke: sel ? INK : "#ffffff", "stroke-width": sel ? 2.5 : 0.7,
          cursor: "pointer", "data-st": s.code });
        c.addEventListener("mouseenter", function () { selectState(s.code); });
        c.addEventListener("click", function () { selectState(s.code); });
        bub.appendChild(c);
      });
    svg.appendChild(bub);

    var slot = document.getElementById("um-svg");
    slot.innerHTML = ""; slot.appendChild(svg);
  }

  function drawLegend() {
    var mx = maxVal();
    function nice(v) { var m = Math.pow(10, Math.floor(Math.log10(v))); return Math.round(v / m) * m; }
    var refs = [nice(mx), nice(mx / 4), nice(mx / 16)].filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; });
    var maxR = rOf(refs[0], mx);
    var W = maxR * 2 + 8, H = maxR * 2 + 14;
    var s = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H });
    refs.forEach(function (v) {
      var r = rOf(v, mx), cx = W / 2, cy = H - 6 - r;
      s.appendChild(el("circle", { cx: cx, cy: cy, r: r, fill: "none", stroke: "#9aa0a8", "stroke-width": 1 }));
      s.appendChild(el("text", { x: cx, y: H - 6 - 2 * r + 10, "text-anchor": "middle", "font-size": 9, fill: MUTE }, num(v)));
    });
    var wrap = document.getElementById("um-legend");
    wrap.innerHTML = "";
    var sizeLab = document.createElement("span");
    sizeLab.className = "um-unit"; sizeLab.textContent = "size = registrations";
    var ramp = document.createElement("span");
    ramp.className = "um-ramp";
    ramp.innerHTML = '<span class="rl">fewer</span><i style="background:' + HEAT_CSS + '"></i><span class="rl">more</span>';
    wrap.appendChild(s); wrap.appendChild(sizeLab); wrap.appendChild(ramp);
  }

  // ---- detail + top list (shared with prior version) -----------------------
  function selectState(code) { selected = code; drawMap(); drawDetail(); markTop(); }
  function topStates(n) {
    var arr = G.states.slice().sort(function (a, b) { return (b.units[P] || 0) - (a.units[P] || 0); });
    return n ? arr.slice(0, n) : arr;
  }
  function drawDetail() {
    var code = selected || topStates(1)[0].st; selected = code;
    var s = byCode[code], v = s.units[P] || 0, natl = G.national[P] || 1;
    var rank = topStates(0).findIndex(function (x) { return x.st === code; }) + 1;
    var counties = (s.counties || []).map(function (c) { return { c: c.c, u: c.units[P] || 0 }; })
      .filter(function (c) { return c.u > 0; }).sort(function (a, b) { return b.u - a.u; }).slice(0, 6);
    var cmax = counties.length ? counties[0].u : 1;
    var cHtml = counties.length
      ? counties.map(function (c) {
          return '<div class="um-cty"><span class="cn">' + esc(c.c) + '</span>' +
            '<span class="cbar"><i style="width:' + Math.max(4, Math.round(c.u / cmax * 100)) + '%"></i></span>' +
            '<span class="cv">' + num(c.u) + "</span></div>";
        }).join("")
      : '<div class="um-none">No county detail for this period.</div>';
    document.getElementById("um-detail").innerHTML =
      '<div class="um-dname">' + esc(NAME[code] || code) + '</div>' +
      '<div class="um-dfigs"><span class="v">' + num(v) + '</span><span class="l">registrations · ' + G.labels[P] + '</span></div>' +
      '<div class="um-dsub">' + (v / natl * 100).toFixed(1) + '% of U.S.' + (rank ? ' · #' + rank + ' of ' + G.states.length : "") + '</div>' +
      '<div class="um-ctitle">Top counties</div>' + cHtml;
  }
  function drawTop() {
    document.getElementById("um-top").innerHTML = topStates(10).map(function (s) {
      return '<li data-st="' + s.st + '" class="' + (s.st === selected ? "on" : "") + '">' +
        '<span class="tn">' + esc(NAME[s.st] || s.st) + '</span>' +
        '<span class="tv">' + num(s.units[P] || 0) + "</span></li>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#um-top li"), function (li) {
      li.onclick = function () { selectState(li.getAttribute("data-st")); };
    });
  }
  function markTop() {
    Array.prototype.forEach.call(document.querySelectorAll("#um-top li"), function (li) {
      li.classList.toggle("on", li.getAttribute("data-st") === selected);
    });
  }

  function draw() { drawMap(); drawLegend(); drawDetail(); drawTop(); }
  draw();
})();
