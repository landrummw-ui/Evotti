// =============================================================================
// Evotti InfoLink — U.S. state tile-grid choropleth (pontoon registrations)
// =============================================================================
// Hand-rolled inline SVG, no map library: each state is a tile placed in its
// geographic position, shaded by registration volume for the SELECTED trailing-
// 12-month period. Pick a year → the map recolors (one year at a time). Hover
// or tap a state → detail + county drill. Data: window.EVOTTI_INFOLINK_GEO
// (all five TTM periods, all makes), generated from the InfoLink location tab.
// =============================================================================
(function () {
  "use strict";
  var G = window.EVOTTI_INFOLINK_GEO;
  var host = document.getElementById("usmap");
  if (!G || !host) return;

  // Geographic tile layout (row, col) — standard U.S. state grid, 8×11.
  var POS = {
    AK:[0,0], ME:[0,10],
    VT:[1,9], NH:[1,10],
    WA:[2,0], ID:[2,1], MT:[2,2], ND:[2,3], MN:[2,4], IL:[2,5], WI:[2,6], MI:[2,7], NY:[2,9], MA:[2,10],
    OR:[3,0], NV:[3,1], WY:[3,2], SD:[3,3], IA:[3,4], IN:[3,5], OH:[3,6], PA:[3,7], NJ:[3,8], CT:[3,9], RI:[3,10],
    CA:[4,0], UT:[4,1], CO:[4,2], NE:[4,3], MO:[4,4], KY:[4,5], WV:[4,6], VA:[4,7], MD:[4,8], DE:[4,9],
    AZ:[5,0], NM:[5,1], KS:[5,2], AR:[5,3], TN:[5,4], NC:[5,5], SC:[5,6], DC:[5,7],
    OK:[6,2], LA:[6,3], MS:[6,4], AL:[6,5], GA:[6,6],
    HI:[7,0], TX:[7,2], FL:[7,6]
  };
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
  var SHADES = ["#dbeaed", "#a7d0d8", "#6fb0bc", "#3f8b99", "#1f5f6b"];
  var NODATA = "#eceef1", INK = "#16181c", MUTE = "#5c616b";
  var NS = "http://www.w3.org/2000/svg";

  var byCode = {};
  G.states.forEach(function (s) { byCode[s.st] = s; });
  var P = G.labels.length - 1;          // selected period index (default latest)
  var selected = null;                   // selected state code

  function num(v) { return Math.round(v || 0).toLocaleString("en-US"); }
  function val(code) { var s = byCode[code]; return s ? (s.units[P] || 0) : 0; }

  // Quantile thresholds over states with data, for 5-bin coloring.
  function thresholds() {
    var vals = G.states.map(function (s) { return s.units[P] || 0; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
    var q = [];
    [0.2, 0.4, 0.6, 0.8].forEach(function (p) { q.push(vals[Math.floor(p * (vals.length - 1))]); });
    return q;
  }
  function colorFor(v, th) {
    if (!v || v <= 0) return NODATA;
    var b = 0; for (var i = 0; i < th.length; i++) if (v > th[i]) b = i + 1;
    return SHADES[b];
  }

  // ---- build DOM shell -----------------------------------------------------
  host.innerHTML =
    '<div class="um-controls"><span class="um-lbl">Trailing 12 months ending</span>' +
    '<div class="um-periods" id="um-periods"></div></div>' +
    '<div class="um-wrap">' +
      '<div class="um-mapcol"><div id="um-svg"></div>' +
        '<div class="um-legend" id="um-legend"></div></div>' +
      '<div class="um-side"><div class="um-detail" id="um-detail"></div>' +
        '<div class="um-toplabel">Top states</div><ol class="um-top" id="um-top"></ol></div>' +
    '</div>';

  // period buttons
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

  // ---- SVG map -------------------------------------------------------------
  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function drawMap() {
    var COLS = 11, ROWS = 8, CELL = 64, T = 58;
    var W = COLS * CELL, H = ROWS * CELL;
    var th = thresholds();
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img",
      "aria-label": "U.S. pontoon registrations by state" });
    svg.style.height = "auto"; svg.style.display = "block";
    Object.keys(POS).forEach(function (code) {
      var r = POS[code][0], c = POS[code][1];
      var x = c * CELL, y = r * CELL, v = val(code);
      var fill = colorFor(v, th);
      var dark = fill === SHADES[3] || fill === SHADES[4];
      var g = el("g", { transform: "translate(" + x + "," + y + ")", cursor: "pointer", "data-st": code });
      g.appendChild(el("rect", { width: T, height: T, rx: 8, fill: fill,
        stroke: code === selected ? "#a83435" : "#ffffff", "stroke-width": code === selected ? 3 : 1.5 }));
      g.appendChild(el("text", { x: T / 2, y: 25, "text-anchor": "middle", "font-size": 15,
        "font-weight": 700, fill: dark ? "#fff" : INK }, code));
      g.appendChild(el("text", { x: T / 2, y: 42, "text-anchor": "middle", "font-size": 11,
        fill: dark ? "rgba(255,255,255,.85)" : MUTE }, v > 0 ? num(v) : "–"));
      g.addEventListener("mouseenter", function () { selectState(code); });
      g.addEventListener("click", function () { selectState(code); });
      svg.appendChild(g);
    });
    var slot = document.getElementById("um-svg");
    slot.innerHTML = ""; slot.appendChild(svg);
  }

  function drawLegend() {
    var th = thresholds();
    var edges = [0].concat(th);
    var items = SHADES.map(function (sh, i) {
      var lo = i === 0 ? 1 : Math.round(edges[i]) + 1;
      var hi = i < th.length ? Math.round(th[i]) : null;
      var rng = i === SHADES.length - 1 ? Math.round(edges[edges.length - 1]) + "+" : lo + "–" + hi;
      return '<span class="um-sw"><i style="background:' + sh + '"></i>' + rng + "</span>";
    }).join("");
    document.getElementById("um-legend").innerHTML =
      '<span class="um-sw"><i style="background:' + NODATA + '"></i>none</span>' + items +
      '<span class="um-unit">registrations</span>';
  }

  // ---- detail + top list ---------------------------------------------------
  function selectState(code) {
    selected = code;
    drawMap();       // redraw to move the selection outline
    drawDetail();
  }
  function drawDetail() {
    var box = document.getElementById("um-detail");
    var code = selected || topStates(1)[0].st;
    selected = code;
    var s = byCode[code];
    var v = s.units[P] || 0;
    var natl = G.national[P] || 1;
    var rank = topStates(0).findIndex(function (x) { return x.st === code; }) + 1;
    var counties = (s.counties || []).slice()
      .map(function (c) { return { c: c.c, u: c.units[P] || 0 }; })
      .filter(function (c) { return c.u > 0; })
      .sort(function (a, b) { return b.u - a.u; }).slice(0, 6);
    var cmax = counties.length ? counties[0].u : 1;
    var cHtml = counties.length
      ? counties.map(function (c) {
          return '<div class="um-cty"><span class="cn">' + esc(c.c) + '</span>' +
            '<span class="cbar"><i style="width:' + Math.max(4, Math.round(c.u / cmax * 100)) + '%"></i></span>' +
            '<span class="cv">' + num(c.u) + "</span></div>";
        }).join("")
      : '<div class="um-none">No county detail for this period.</div>';
    box.innerHTML =
      '<div class="um-dname">' + esc(NAME[code] || code) + '</div>' +
      '<div class="um-dfigs"><span class="v">' + num(v) + '</span><span class="l">registrations · ' +
        G.labels[P] + '</span></div>' +
      '<div class="um-dsub">' + (v / natl * 100).toFixed(1) + '% of U.S.' +
        (rank ? ' · #' + rank + ' of ' + G.states.length : "") + '</div>' +
      '<div class="um-ctitle">Top counties</div>' + cHtml;
  }
  function topStates(n) {
    var arr = G.states.slice().sort(function (a, b) { return (b.units[P] || 0) - (a.units[P] || 0); });
    return n ? arr.slice(0, n) : arr;
  }
  function drawTop() {
    var top = topStates(10);
    document.getElementById("um-top").innerHTML = top.map(function (s) {
      return '<li data-st="' + s.st + '" class="' + (s.st === selected ? "on" : "") + '">' +
        '<span class="tn">' + esc(NAME[s.st] || s.st) + '</span>' +
        '<span class="tv">' + num(s.units[P] || 0) + "</span></li>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#um-top li"), function (li) {
      li.onclick = function () { selectState(li.getAttribute("data-st")); drawTop(); };
    });
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]; }); }

  function draw() { drawMap(); drawLegend(); drawDetail(); drawTop(); }
  draw();
})();
