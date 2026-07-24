// =============================================================================
// Evotti Sales — Voice
// =============================================================================
// Tap the mic, ask a sales question, hear a punchy answer, and see it on screen.
//
// The brain is the SAME agent the dashboard uses:
//   speech -> text  (browser SpeechRecognition)
//   text   -> spec  (POST /.netlify/functions/ask — Claude when the key is set,
//                    the built-in keyword parser otherwise)
//   spec   -> numbers (shared sales/query.js over the bundled sales/data.js)
//   answer -> speech  (browser speechSynthesis) + on-screen KPI/bars
//
// So the spoken number is computed by the exact same deterministic code as the
// dashboard — the model only interprets language, it never does the math.
// =============================================================================

(function () {
  "use strict";

  var SQ = window.SalesQuery;
  var DATA = window.EVOTTI_SALES || { asOf: "2026-07-24", rows: [] };
  var AS_OF = DATA.asOf;
  var $ = function (id) { return document.getElementById(id); };

  var EXAMPLES = [
    "How were sales yesterday?",
    "Give me the regional breakdown",
    "How's the West doing versus plan?",
    "Units this month",
    "Revenue by product line",
    "How was Q2?"
  ];

  // Speech may be unavailable (desktop Firefox, some iOS states). The typed box
  // is always there as a fallback, and speak() no-ops gracefully.
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis || null;
  var rec = null, listening = false, ttsUnlocked = false;

  // ---- helpers -------------------------------------------------------------
  function parseD(s) { return new Date(s + "T00:00:00Z"); }
  function fmtISO(d) { return d.toISOString().slice(0, 10); }
  function isWeekendUTC(d) { var g = d.getUTCDay(); return g === 0 || g === 6; }
  function niceDate(iso) {
    var d = parseD(iso);
    return SQ.MON3[d.getUTCMonth()] + " " + d.getUTCDate();
  }
  function prevWorkday(iso, n) {
    var d = parseD(iso), c = 0;
    while (c < n) { d.setUTCDate(d.getUTCDate() - 1); if (!isWeekendUTC(d)) c++; }
    return fmtISO(d);
  }
  // Mon–Fri window `back` weeks before the week containing `iso` (0 = this week).
  function weekRange(iso, back) {
    var d = parseD(iso), dow = (d.getUTCDay() + 6) % 7;    // Mon = 0
    d.setUTCDate(d.getUTCDate() - dow - back * 7);
    var mon = fmtISO(d);
    d.setUTCDate(d.getUTCDate() + 4);
    var fri = fmtISO(d);
    if (fri > AS_OF) fri = AS_OF;                          // don't run past the data
    return [mon, fri];
  }

  // ---- local interpreter (fallback + pre-key niceties) ---------------------
  // Starts from the shared keyword parser, then layers in voice-idiomatic
  // phrases it doesn't cover: yesterday / today / this & last week, and the
  // words "regional" and "breakdown". When the Anthropic key is live the server
  // returns a Claude-built spec and this is bypassed entirely.
  function localSpec(q) {
    var spec = SQ.interpret(q, { asOf: AS_OF });
    var lc = q.toLowerCase();

    if (/\bregional\b/.test(lc) && !(spec.filters.regions && spec.filters.regions.length)) {
      spec.group_by = "region";
    }
    if (/\bbreakdown\b/.test(lc) && spec.group_by === "month" && !spec.filters.regions) {
      spec.group_by = /product|line|series|model/.test(lc) ? "product_line" : "region";
    }

    var range = null;
    if (/\byesterday\b/.test(lc)) { var y = prevWorkday(AS_OF, 1); range = [y, y]; }
    else if (/\btoday\b/.test(lc)) { range = [AS_OF, AS_OF]; }
    else if (/\bthis week\b/.test(lc)) { range = weekRange(AS_OF, 0); }
    else if (/\blast week\b/.test(lc)) { range = weekRange(AS_OF, 1); }
    if (range) {
      spec.filters.date_from = range[0];
      spec.filters.date_to = range[1];
      delete spec.filters.months;
      if (spec.group_by === "month" || spec.group_by === "week") spec.group_by = "region";
    }
    spec.title = spec.title || "";
    return SQ.normalizeSpec(spec);
  }

  // ---- ask the agent -------------------------------------------------------
  async function resolveSpec(q) {
    try {
      var res = await fetch("/.netlify/functions/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q })
      });
      if (res.ok) {
        var body = await res.json();
        if (body && body.spec && body.source === "live") return SQ.normalizeSpec(body.spec);
      }
    } catch (e) { /* offline / not deployed → fall through to local */ }
    return localSpec(q);   // no key yet, or the call failed: use the local parser
  }

  // ---- phrasing ------------------------------------------------------------
  function spokenMoney(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return trim1(v / 1e6) + " million dollars";
    if (a >= 1e3) return Math.round(v / 1e3) + " thousand dollars";
    return Math.round(v) + " dollars";
  }
  function trim1(n) { var s = n.toFixed(1); return s.replace(/\.0$/, ""); }

  function leadIn(q) {
    var lc = q.toLowerCase();
    if (/\byesterday\b/.test(lc)) return "Yesterday, ";
    if (/\btoday\b/.test(lc)) return "Today, ";
    if (/\bthis week\b/.test(lc)) return "This week, ";
    if (/\blast week\b/.test(lc)) return "Last week, ";
    if (/\bthis month\b|\bmtd\b|month to date\b/.test(lc)) return "This month, ";
    if (/\blast month\b/.test(lc)) return "Last month, ";
    if (/\bthis quarter\b|\bq[1-4]\b/.test(lc)) return "";
    return "";
  }

  function periodLabel(spec) {
    var f = spec.filters || {};
    if (f.date_from && f.date_to) {
      return f.date_from === f.date_to ? niceDate(f.date_from)
        : niceDate(f.date_from) + " – " + niceDate(f.date_to);
    }
    if (f.months && f.months.length === 1) return SQ.monthLabel(f.months[0]);
    if (f.months && f.months.length > 1) {
      return SQ.monthLabel(f.months[0]) + " – " + SQ.monthLabel(f.months[f.months.length - 1]);
    }
    return "Year to date";
  }

  // The punchy spoken sentence (short — for the ear). The screen shows the detail.
  function spokenAnswer(q, spec, result) {
    var isUnits = spec.metric === "units";
    var t = result.totals;
    var a = isUnits ? t.unitsActual : t.revActual;
    var vp = isUnits ? t.unitsVariancePct : t.revVariancePct;
    var val = isUnits ? SQ.num(a) + (Math.round(a) === 1 ? " boat" : " boats") : spokenMoney(a);
    var dir = vp >= 0 ? "ahead of plan" : "behind plan";
    var mag = Math.abs(vp) < 0.5 ? "right on plan" : Math.round(Math.abs(vp)) + " percent " + dir;
    var s = cap(leadIn(q)) + (leadIn(q) ? lower(val) : val) + ", " + mag + ".";

    // standout when broken out by region or product line
    if (result.buckets.length > 1 && (spec.group_by === "region" || spec.group_by === "product_line")) {
      var key = isUnits ? "unitsVariancePct" : "revVariancePct";
      var sorted = result.buckets.slice().sort(function (x, y) { return y[key] - x[key]; });
      var top = sorted[0], bot = sorted[sorted.length - 1];
      if (top && bot && top.label !== bot.label) {
        s += " " + top.label + " led; " + bot.label + " lagged.";
      }
    }
    return s;
  }
  function cap(s) { return s; }
  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  // ---- speech --------------------------------------------------------------
  // iOS needs speech kicked off from a user gesture. We warm it up on the first
  // tap with a silent utterance so the later (post-fetch) speak() is allowed.
  function unlockTTS() {
    if (ttsUnlocked || !synth) return;
    try { var u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); ttsUnlocked = true; } catch (e) {}
  }
  function speak(text) {
    if (!synth) return;
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 1.03; u.pitch = 1.0;
      synth.speak(u);
    } catch (e) {}
  }

  // ---- render --------------------------------------------------------------
  function render(spec, result, saidText) {
    var isUnits = spec.metric === "units";
    var t = result.totals;
    var a = isUnits ? t.unitsActual : t.revActual;
    var fc = isUnits ? t.unitsForecast : t.revForecast;
    var vp = isUnits ? t.unitsVariancePct : t.revVariancePct;
    var fmt = isUnits ? SQ.num : SQ.money;

    $("a-period").textContent = periodLabel(spec) + " · " + (isUnits ? "Units" : "Revenue");
    $("a-big").textContent = isUnits ? SQ.num(a) : SQ.money(a);
    var vEl = $("a-var");
    var cls = Math.abs(vp) < 0.5 ? "flat" : (vp >= 0 ? "up" : "down");
    vEl.className = "a-var " + cls;
    vEl.textContent = (Math.abs(vp) < 0.5 ? "on plan" : SQ.pct(vp)) + " vs plan";
    $("a-sub").textContent = "vs " + fmt(fc) + " plan" +
      (isUnits ? "" : "  ·  " + SQ.num(t.unitsActual) + " boats");

    // breakdown bars (only when there's more than one bucket)
    var bars = "";
    if (result.buckets.length > 1) {
      var valKey = isUnits ? "unitsActual" : "revActual";
      var vpKey = isUnits ? "unitsVariancePct" : "revVariancePct";
      var rows = result.buckets.slice();
      var timeGrouped = spec.group_by === "day" || spec.group_by === "week" || spec.group_by === "month";
      if (!timeGrouped) rows.sort(function (x, y) { return y[valKey] - x[valKey]; });
      rows = rows.slice(0, 8);
      var max = rows.reduce(function (m, b) { return Math.max(m, b[valKey]); }, 1);
      bars = rows.map(function (b) {
        var w = Math.max(3, Math.round(b[valKey] / max * 100));
        var vpc = b[vpKey];
        var vcls = Math.abs(vpc) < 0.5 ? "" : (vpc >= 0 ? "up" : "down");
        return '<div class="bar-row">' +
          '<span class="bl">' + esc(b.label) + "</span>" +
          '<span class="bar-track"><span class="bar-fill" style="width:' + w + '%"></span></span>' +
          '<span class="bv"><b>' + esc(fmt(b[valKey])) + "</b>" +
          '<span class="vp ' + vcls + '">' + esc(SQ.pct(vpc)) + "</span></span></div>";
      }).join("");
    }
    $("a-bars").innerHTML = bars;

    $("a-said").textContent = saidText;
    $("answer").hidden = false;
  }

  // ---- run one question ----------------------------------------------------
  var busy = false;
  async function run(q) {
    q = (q || "").trim();
    if (!q || busy) return;
    busy = true;
    setHeard(q, false);
    setMic("thinking");
    setHint("");
    try {
      var spec = await resolveSpec(q);
      var result = SQ.runQuery(DATA, spec);
      var said = spokenAnswer(q, spec, result);
      render(spec, result, said);
      speak(said);
    } catch (e) {
      setHint("Couldn't answer that one — try rephrasing.", true);
    } finally {
      busy = false;
      setMic("idle");
    }
  }

  // ---- UI state ------------------------------------------------------------
  function setMic(mode) {
    var m = $("mic");
    m.classList.remove("listening", "thinking");
    if (mode === "listening") { m.classList.add("listening"); $("prompt").textContent = "Listening…"; }
    else if (mode === "thinking") { m.classList.add("thinking"); $("prompt").textContent = "Thinking…"; }
    else { $("prompt").textContent = "Tap and ask about sales"; }
  }
  function setHeard(text, interim) {
    var h = $("heard");
    h.textContent = text || " ";
    h.classList.toggle("interim", !!interim);
  }
  function setHint(text, warn) {
    var h = $("hint");
    h.textContent = text || "";
    h.classList.toggle("warn", !!warn);
  }

  // ---- speech recognition wiring -------------------------------------------
  function startListening() {
    unlockTTS();
    if (busy) return;
    if (!Recognition) {   // no mic API — focus the typed box instead
      setHint("Voice input isn't supported in this browser — type your question below.", false);
      $("q").focus();
      return;
    }
    if (listening) { try { rec.stop(); } catch (e) {} return; }

    rec = new Recognition();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    var finalText = "";
    rec.onstart = function () { listening = true; setMic("listening"); setHeard("", false); };
    rec.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setHeard(finalText || interim, !finalText);
    };
    rec.onerror = function (e) {
      listening = false; setMic("idle");
      if (e && e.error === "not-allowed") setHint("Microphone blocked — allow mic access, or type below.", true);
      else if (e && e.error === "no-speech") setHint("Didn't catch that — tap and try again.", false);
    };
    rec.onend = function () {
      listening = false; setMic("idle");
      var q = finalText.trim();
      if (q) run(q);
    };
    try { rec.start(); } catch (e) { setHint("Couldn't start the mic — type your question below.", true); }
  }

  // ---- init ----------------------------------------------------------------
  function init() {
    $("ex-chips").innerHTML = EXAMPLES.map(function (x) {
      return '<button class="chip" type="button">' + esc(x) + "</button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (b) {
      b.addEventListener("click", function () { unlockTTS(); run(b.textContent); });
    });

    $("mic").addEventListener("click", startListening);
    $("typed").addEventListener("submit", function (e) {
      e.preventDefault();
      unlockTTS();
      var q = $("q").value.trim();
      if (q) { run(q); $("q").blur(); }
    });

    if (!Recognition) {
      setHint("Tip: voice input works best in Chrome. You can always type below.", false);
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  init();
})();
