// =============================================================================
// Evotti Sales Analysis — chart helpers
// =============================================================================
// Hand-rolled inline SVG: line, grouped bars, and variance bars. No external
// library, so there's nothing to fail to load during a demo. Each builder
// returns an <svg> element with a fixed viewBox and width:100%, so it scales
// to whatever card holds it.
// =============================================================================

(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var INK = "#16181c", MUTE = "#5c616b", FAINT = "#9297a1";
  var GRID = "#eef0f3", AXIS = "#cbced6";
  var CRIMSON = "#a83435", GRAY = "#c3c7cf";

  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function svgRoot(w, h) {
    var s = el("svg", { viewBox: "0 0 " + w + " " + h, width: "100%",
      preserveAspectRatio: "xMidYMid meet", role: "img" });
    s.style.height = "auto";
    s.style.display = "block";
    return s;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  }
  function sparseIdx(n, target) {
    if (n <= target) { var all = []; for (var i = 0; i < n; i++) all.push(i); return all; }
    var out = [], step = (n - 1) / (target - 1);
    for (var j = 0; j < target; j++) out.push(Math.round(j * step));
    return out;
  }

  // ---- line chart (one or more series) -------------------------------------
  function lineChart(categories, series, opts) {
    opts = opts || {};
    var W = 960, H = opts.height || 300;
    var padL = 56, padR = 14, padT = 14, padB = 28;
    var fmt = opts.fmt || function (v) { return v; };
    var max = niceMax(Math.max.apply(null, [1].concat(
      series.reduce(function (a, s) { return a.concat(s.values); }, []))) * 1.02);
    var n = categories.length;
    var s = svgRoot(W, H);
    var x = function (i) { return padL + (n <= 1 ? 0 : i * (W - padL - padR) / (n - 1)); };
    var y = function (v) { return H - padB - v / max * (H - padT - padB); };

    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4;
      s.appendChild(el("line", { x1: padL, y1: y(gv), x2: W - padR, y2: y(gv),
        stroke: GRID, "stroke-width": 1 }));
      s.appendChild(el("text", { x: padL - 8, y: y(gv) + 4, "text-anchor": "end",
        "font-size": 11, fill: FAINT }, fmt(gv)));
    }
    sparseIdx(n, 8).forEach(function (i) {
      s.appendChild(el("text", { x: x(i), y: H - 8, "text-anchor": "middle",
        "font-size": 11, fill: MUTE }, categories[i]));
    });
    series.forEach(function (ser) {
      var d = "";
      ser.values.forEach(function (v, i) { d += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); });
      s.appendChild(el("path", { d: d, fill: "none", stroke: ser.color || CRIMSON,
        "stroke-width": ser.width || 2, "stroke-dasharray": ser.dashed ? "5 4" : "0",
        "stroke-linejoin": "round" }));
      if (n <= 14) ser.values.forEach(function (v, i) {
        s.appendChild(el("circle", { cx: x(i), cy: y(v), r: 3, fill: ser.color || CRIMSON }));
      });
    });
    return s;
  }

  // ---- grouped bar chart (one or two series) -------------------------------
  function groupedBars(categories, series, opts) {
    opts = opts || {};
    var W = 960, H = opts.height || 300;
    var padL = 56, padR = 14, padT = 22, padB = 34;
    var fmt = opts.fmt || function (v) { return v; };
    var max = niceMax(Math.max.apply(null, [1].concat(
      series.reduce(function (a, s) { return a.concat(s.values); }, []))) * 1.08);
    var n = categories.length, m = series.length;
    var s = svgRoot(W, H);
    var y = function (v) { return H - padB - v / max * (H - padT - padB); };
    var slot = (W - padL - padR) / n;
    var groupW = Math.min(slot * 0.7, 120);
    var barW = groupW / m;

    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4;
      s.appendChild(el("line", { x1: padL, y1: y(gv), x2: W - padR, y2: y(gv),
        stroke: GRID, "stroke-width": 1 }));
      s.appendChild(el("text", { x: padL - 8, y: y(gv) + 4, "text-anchor": "end",
        "font-size": 11, fill: FAINT }, fmt(gv)));
    }
    categories.forEach(function (cat, i) {
      var cx = padL + slot * i + slot / 2;
      series.forEach(function (ser, j) {
        var v = ser.values[i];
        var bx = cx - groupW / 2 + j * barW;
        s.appendChild(el("rect", { x: bx, y: y(v), width: Math.max(barW - 3, 2),
          height: Math.max(H - padB - y(v), 0), rx: 3, fill: ser.color || CRIMSON }));
      });
      if (n <= 8) {
        var top = Math.min.apply(null, series.map(function (ser) { return y(ser.values[i]); }));
        s.appendChild(el("text", { x: cx, y: top - 7, "text-anchor": "middle",
          "font-size": 11, "font-weight": 600, fill: MUTE }, fmt(series[0].values[i])));
      }
      s.appendChild(el("text", { x: cx, y: H - 10, "text-anchor": "middle",
        "font-size": 11, fill: MUTE }, cat));
    });
    return s;
  }

  // ---- variance bars (signed %, crimson up / gray down) --------------------
  function varianceBars(categories, values, opts) {
    opts = opts || {};
    var W = 960, H = opts.height || 220;
    var padL = 20, padR = 14, padB = 26;
    var suffix = opts.suffix != null ? opts.suffix : "%";
    var max = Math.max(1, Math.max.apply(null, values.map(function (v) { return Math.abs(v); })) * 1.25);
    var n = values.length;
    var s = svgRoot(W, H);
    var zero = (H - padB) / 2 + 8;
    var half = (H - padB) / 2 - 6;
    var y = function (v) { return zero - v / max * half; };
    s.appendChild(el("line", { x1: padL, y1: zero, x2: W - padR, y2: zero,
      stroke: AXIS, "stroke-width": 1 }));
    var slot = (W - padL - padR) / n;
    var bw = Math.min(slot * 0.5, 64);
    values.forEach(function (v, i) {
      var cx = padL + slot * i + slot / 2;
      var yy = v >= 0 ? y(v) : zero;
      s.appendChild(el("rect", { x: cx - bw / 2, y: yy, width: bw,
        height: Math.max(Math.abs(y(v) - zero), 1), rx: 3,
        fill: v >= 0 ? CRIMSON : GRAY }));
      s.appendChild(el("text", { x: cx, y: v >= 0 ? y(v) - 7 : y(v) + 16,
        "text-anchor": "middle", "font-size": 12, "font-weight": 600,
        fill: v >= 0 ? CRIMSON : MUTE },
        (v >= 0 ? "+" : "") + v.toFixed(1) + suffix));
      s.appendChild(el("text", { x: cx, y: H - 7, "text-anchor": "middle",
        "font-size": 11, fill: MUTE }, categories[i]));
    });
    return s;
  }

  root.SalesCharts = { lineChart: lineChart, groupedBars: groupedBars,
    varianceBars: varianceBars, colors: { crimson: CRIMSON, gray: GRAY } };
})(typeof self !== "undefined" ? self : this);
