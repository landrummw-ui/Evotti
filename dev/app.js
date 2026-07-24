// =============================================================================
// Evotti — AI App & Agent Development (Kanban)
// =============================================================================
// A dynamic Kanban for the delivery lifecycle of AI apps and agents. Cards move
// through stages via drag-and-drop (between columns = stage change, up/down =
// priority). Each stage has a business-day SLA; the card's due date is computed
// from when it entered the current stage, and the card is colored green / pale
// yellow / red accordingly. On-Hold and Rejected are supported.
//
// State is shared in Supabase (table `dev_cards`) so everyone sees the same
// board. Reads/writes use the publishable key in /platform/config.js. The board
// polls every few seconds so a change one person makes shows up for the others.
// Run supabase/dev_schema.sql once to create + seed the table.
// =============================================================================

(function () {
  "use strict";

  // ---- config --------------------------------------------------------------
  // Stage SLAs in BUSINESS DAYS. Editable here now; admin-editable later.
  var STAGES = [
    { key: "requests",     label: "Requests",          sla: 3 },
    { key: "requirements", label: "Requirements",      sla: 5 },
    { key: "ready_dev",    label: "Ready for Dev",     sla: 3 },
    { key: "in_dev",       label: "In Development",    sla: 10 },
    { key: "qa",           label: "QA Smoke Testing",  sla: 4 },
    { key: "uat",          label: "UAT",               sla: 5 },
    { key: "ready_deploy", label: "Ready to Deploy",   sla: 2 },
    { key: "golive",       label: "Go-Live",           sla: 0 }   // terminal, no SLA
  ];
  var REJECTED = "rejected";
  var STAGE = {}; STAGES.forEach(function (s) { STAGE[s.key] = s; });
  var CURRENT_USER = "Mark Landrum";
  var POLL_MS = 6000;          // refresh cadence for the shared board
  var WRITE_QUIET_MS = 4000;   // skip a poll this long after a local write

  var state = { cards: {}, order: {} };
  var filter = { q: "", type: "all" };
  var showRejected = false;
  var dragId = null;
  var sb = null;               // Supabase client
  var lastWrite = 0;
  var ready = false;

  var $ = function (id) { return document.getElementById(id); };

  // ---- date / business-day helpers -----------------------------------------
  function nowISO() { return new Date().toISOString(); }
  function todayISODate() { return new Date().toISOString().slice(0, 10); }
  function dayStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function isWeekend(d) { var g = d.getDay(); return g === 0 || g === 6; }

  function addBusinessDays(from, n) {
    var d = dayStart(from), added = 0;
    if (n <= 0) return d;
    while (added < n) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) added++; }
    return d;
  }
  function subBusinessDays(from, n) {
    var d = dayStart(from), removed = 0;
    while (removed < n) { d.setDate(d.getDate() - 1); if (!isWeekend(d)) removed++; }
    return d;
  }
  // Signed business days from a to b (positive if b is after a).
  function businessDaysBetween(a, b) {
    var s = dayStart(a), e = dayStart(b), sign = 1;
    if (e < s) { var t = s; s = e; e = t; sign = -1; }
    var n = 0, d = new Date(s);
    while (d < e) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) n++; }
    return sign * n;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  // ---- SLA status ----------------------------------------------------------
  // Returns { status: green|yellow|red|neutral, due: Date|null, label }.
  function slaStatus(card) {
    if (card.stage === REJECTED) return { status: "neutral", due: null, label: "Rejected" };
    var st = STAGE[card.stage];
    if (!st || st.sla <= 0) return { status: "neutral", due: null, label: "Delivered" };
    var due = addBusinessDays(card.stage_entered_at, st.sla);
    var bd = businessDaysBetween(new Date(), due);   // >0 future, <0 past
    if (dayStart(new Date()) > dayStart(due)) {
      return { status: "red", due: due, label: Math.abs(bd) + "d over" };
    }
    if (bd <= 2) return { status: "yellow", due: due, label: bd === 0 ? "due today" : "due in " + bd + "d" };
    return { status: "green", due: due, label: "on track" };
  }

  function genId() {
    return "C" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  }

  // Normalize a card with all model fields.
  function card(c) {
    return {
      id: c.id, type: c.type || "app", title: c.title || "Untitled",
      user_story: c.user_story || "", description: c.description || "",
      requester: c.requester || CURRENT_USER, owner: c.owner || "",
      request_date: c.request_date || todayISODate(),
      completion_date: c.completion_date || "",
      stage: c.stage || "requests", stage_entered_at: c.stage_entered_at || nowISO(),
      on_hold: !!c.on_hold, rejected: !!c.rejected, rejection_reason: c.rejection_reason || "",
      tags: c.tags || [], comments: c.comments || [], attachments: c.attachments || [],
      history: c.history || [{ stage: c.stage || "requests", at: nowISO() }]
    };
  }

  // ---- Supabase persistence ------------------------------------------------
  // The order arrays are the source of truth for position; a card's `position`
  // column is just its index within its column, reindexed whenever the column
  // changes. Writes are optimistic: we render immediately, then upsert.

  function indexIn(stage, id) {
    var a = state.order[stage] || [];
    var i = a.indexOf(id);
    return i < 0 ? 0 : i;
  }

  function toRow(c) {
    return {
      id: c.id, type: c.type, title: c.title,
      user_story: c.user_story || "", description: c.description || "",
      requester: c.requester || "", owner: c.owner || "",
      request_date: c.request_date ? String(c.request_date).slice(0, 10) : null,
      completion_date: c.completion_date ? String(c.completion_date).slice(0, 10) : null,
      stage: c.stage, stage_entered_at: c.stage_entered_at,
      on_hold: !!c.on_hold, rejected: !!c.rejected, rejection_reason: c.rejection_reason || "",
      tags: c.tags || [], comments: c.comments || [], attachments: c.attachments || [],
      history: c.history || [], position: indexIn(c.stage, c.id),
      updated_at: nowISO()
    };
  }

  function fromRow(r) {
    return card({
      id: r.id, type: r.type, title: r.title, user_story: r.user_story,
      description: r.description, requester: r.requester, owner: r.owner,
      request_date: r.request_date ? String(r.request_date).slice(0, 10) : "",
      completion_date: r.completion_date ? String(r.completion_date).slice(0, 10) : "",
      stage: r.stage, stage_entered_at: r.stage_entered_at,
      on_hold: r.on_hold, rejected: r.rejected, rejection_reason: r.rejection_reason,
      tags: r.tags, comments: r.comments, attachments: r.attachments, history: r.history
    });
  }

  function isMissingTable(err) {
    if (!err) return false;
    var code = err.code || "";
    return code === "42P01" || code === "PGRST205" ||
      /could not find the table|relation .*does not exist/i.test(err.message || "");
  }

  function noteWrite() { lastWrite = Date.now(); }
  function onWriteErr(res) {
    if (res && res.error) {
      // eslint-disable-next-line no-console
      console.error("[dev board] save failed:", res.error.message || res.error);
    }
  }

  // Upsert a single card (field-only changes).
  function saveCard(id) {
    var c = state.cards[id]; if (!c || !sb) return;
    noteWrite();
    sb.from("dev_cards").upsert(toRow(c)).then(onWriteErr);
  }
  // Reindex + upsert every card in the given columns (structural changes).
  function saveColumns() {
    if (!sb) return;
    var stages = Array.prototype.slice.call(arguments);
    var rows = [];
    stages.forEach(function (stage) {
      (state.order[stage] || []).forEach(function (id) {
        if (state.cards[id]) rows.push(toRow(state.cards[id]));
      });
    });
    if (!rows.length) return;
    noteWrite();
    sb.from("dev_cards").upsert(rows).then(onWriteErr);
  }

  async function loadFromDB() {
    if (!sb) return false;
    var res = await sb.from("dev_cards").select("*").order("position", { ascending: true });
    if (res.error) {
      if (isMissingTable(res.error)) showSetupNotice();
      else showErrorNotice(res.error.message || "Could not load the board.");
      return false;
    }
    var st = { cards: {}, order: {} };
    STAGES.forEach(function (s) { st.order[s.key] = []; });
    st.order[REJECTED] = [];
    (res.data || []).forEach(function (r) {
      var c = fromRow(r);
      st.cards[c.id] = c;
      (st.order[c.stage] || (st.order[c.stage] = [])).push(c.id);
    });
    state = st;
    ready = true;
    return true;
  }

  function showSetupNotice() {
    $("board").innerHTML =
      '<div class="board-notice">' +
      "<h2>One-time setup needed</h2>" +
      "<p>The shared board table isn't in Supabase yet. In the Supabase SQL Editor " +
      "(same project as the CRM), run <code>supabase/dev_schema.sql</code> once. " +
      "It creates the <code>dev_cards</code> table and loads the demo cards.</p>" +
      "<p>Reload this page after running it and the board goes live for everyone.</p>" +
      "</div>";
    $("summary").textContent = "Waiting on Supabase setup";
  }
  function showErrorNotice(msg) {
    $("board").innerHTML =
      '<div class="board-notice"><h2>Couldn\'t reach the board</h2><p>' + esc(msg) + "</p>" +
      "<p>Check your connection and reload.</p></div>";
    $("summary").textContent = "Offline";
  }

  // ---- order helpers -------------------------------------------------------
  function removeFrom(stage, id) {
    var a = state.order[stage]; if (!a) return;
    var i = a.indexOf(id); if (i >= 0) a.splice(i, 1);
  }
  function insertInto(stage, id, beforeId) {
    var a = state.order[stage] || (state.order[stage] = []);
    if (beforeId && a.indexOf(beforeId) >= 0) a.splice(a.indexOf(beforeId), 0, id);
    else a.push(id);
  }

  function moveCard(id, stage, beforeId) {
    var c = state.cards[id]; if (!c) return;
    var from = c.stage;
    removeFrom(from, id);
    if (from !== stage) {
      c.stage = stage;
      c.stage_entered_at = nowISO();
      c.history.push({ stage: stage, at: c.stage_entered_at });
      c.rejected = (stage === REJECTED);            // moving in/out of Rejected keeps the flag honest
    }
    insertInto(stage, id, beforeId);
    render();
    if (from !== stage) saveColumns(from, stage);
    else saveColumns(stage);
  }

  // ---- rendering -----------------------------------------------------------
  function matches(c) {
    if (filter.type !== "all" && c.type !== filter.type) return false;
    if (filter.q) {
      var q = filter.q.toLowerCase();
      var hay = [c.title, c.requester, c.owner, c.user_story, (c.tags || []).join(" ")].join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function render() {
    if (!ready) return;
    renderControls();
    var cols = STAGES.slice();
    if (showRejected) cols.push({ key: REJECTED, label: "Rejected", sla: null });

    $("board").innerHTML = cols.map(function (s) {
      var ids = (state.order[s.key] || []).filter(function (id) { return state.cards[id] && matches(state.cards[id]); });
      var sla = s.sla == null ? "" : (s.sla > 0 ? s.sla + " biz days" : "final");
      var cards = ids.length
        ? ids.map(function (id) { return cardHtml(state.cards[id]); }).join("")
        : '<div class="empty-col">Drop cards here</div>';
      return '<div class="column' + (s.key === REJECTED ? " rejected" : "") + '">' +
        '<div class="col-head"><h2>' + esc(s.label) + '</h2>' +
        '<span class="count">' + ids.length + "</span>" +
        '<span class="sla">' + sla + "</span></div>" +
        '<div class="cards" data-stage="' + s.key + '">' + cards + "</div></div>";
    }).join("");

    wireDnD();
    var total = Object.keys(state.cards).length;
    var active = Object.keys(state.cards).filter(function (id) { return state.cards[id].stage !== REJECTED; }).length;
    $("summary").textContent = active + " active card" + (active === 1 ? "" : "s") +
      " across " + STAGES.length + " stages · " + total + " total";
  }

  function cardHtml(c) {
    var s = slaStatus(c);
    var statusClass = c.on_hold ? "" : "status-" + s.status;
    var dueChip = c.stage === REJECTED ? "" :
      '<span class="k-due ' + s.status + '">' + esc(s.label) + "</span>";
    var holdFlag = c.on_hold ? '<span class="k-flag hold">On hold</span>' : "";
    var rejFlag = c.stage === REJECTED ? '<span class="k-flag rej">Rejected</span>' : "";
    var dueDate = s.due ? '<span class="k-meta" style="margin-left:auto">Due ' + esc(fmtDate(s.due.toISOString())) + "</span>" : "";
    return '<div class="kcard ' + c.type + " " + statusClass +
      (c.on_hold ? " hold" : "") + '" draggable="true" data-id="' + c.id + '">' +
      '<div class="k-top"><span class="k-type ' + c.type + '">' +
      (c.type === "agent" ? "Agent" : "App") + "</span>" + dueDate + "</div>" +
      "<h3>" + esc(c.title) + "</h3>" +
      '<div class="k-meta">' + esc(c.requester || "—") +
      (c.owner ? ' &rarr; <b>' + esc(c.owner) + "</b>" : "") + "</div>" +
      '<div class="k-badges">' + dueChip + holdFlag + rejFlag + "</div>" +
      '<div class="k-actions">' +
      '<button class="btn sm ghost" data-act="hold" data-id="' + c.id + '">' + (c.on_hold ? "Resume" : "Hold") + "</button>" +
      (c.stage === REJECTED
        ? '<button class="btn sm ghost" data-act="restore" data-id="' + c.id + '">Restore</button>'
        : '<button class="btn sm danger" data-act="reject" data-id="' + c.id + '">Reject</button>') +
      "</div></div>";
  }

  function renderControls() {
    $("typefilter").innerHTML =
      [["all", "All"], ["app", "Apps"], ["agent", "Agents"]].map(function (t) {
        return '<button class="tf' + (filter.type === t[0] ? " active" : "") + '" data-type="' + t[0] + '">' + t[1] + "</button>";
      }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".tf"), function (b) {
      b.onclick = function () { filter.type = b.getAttribute("data-type"); render(); };
    });
  }

  // ---- drag and drop -------------------------------------------------------
  function wireDnD() {
    Array.prototype.forEach.call(document.querySelectorAll(".kcard"), function (el) {
      el.addEventListener("dragstart", function (e) {
        dragId = el.getAttribute("data-id"); el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {}
      });
      el.addEventListener("dragend", function () { el.classList.remove("dragging"); dragId = null; });
      // clicking a card (not a button) opens the detail panel
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-act]")) return;
        openDetail(el.getAttribute("data-id"));
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-act]"), function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
        if (act === "hold") { state.cards[id].on_hold = !state.cards[id].on_hold; render(); saveCard(id); }
        else if (act === "reject") openReject(id);
        else if (act === "restore") restore(id);
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll(".cards"), function (list) {
      list.addEventListener("dragover", function (e) { e.preventDefault(); list.classList.add("dragover"); });
      list.addEventListener("dragleave", function () { list.classList.remove("dragover"); });
      list.addEventListener("drop", function (e) {
        e.preventDefault(); list.classList.remove("dragover");
        if (!dragId) return;
        var stage = list.getAttribute("data-stage");
        var before = beforeIdForY(list, e.clientY);
        moveCard(dragId, stage, before);
      });
    });
  }

  function beforeIdForY(list, y) {
    var cards = list.querySelectorAll(".kcard:not(.dragging)");
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return cards[i].getAttribute("data-id");
    }
    return null;
  }

  // ---- reject / restore ----------------------------------------------------
  function openReject(id) {
    var c = state.cards[id];
    $("reject-body").innerHTML =
      '<div class="modal-head"><h2>Reject request</h2></div>' +
      '<p class="cap" style="color:var(--muted);font-size:14px;margin:0 0 14px">' +
      "Move <b>" + esc(c.title) + "</b> to the Rejected column.</p>" +
      "<label>Reason (required)<textarea id=\"rej-reason\" placeholder=\"Why is this being rejected?\"></textarea></label>" +
      '<div class="form-actions"><button class="btn" id="rej-cancel">Cancel</button>' +
      '<button class="btn primary" id="rej-go">Reject</button></div>';
    open("modal-reject");
    $("rej-cancel").onclick = function () { close("modal-reject"); };
    $("rej-go").onclick = function () {
      var reason = $("rej-reason").value.trim();
      if (!reason) { $("rej-reason").focus(); return; }
      var from = c.stage;
      removeFrom(from, id);
      c.stage = REJECTED; c.rejected = true; c.rejection_reason = reason;
      c.stage_entered_at = nowISO(); c.history.push({ stage: REJECTED, at: c.stage_entered_at });
      state.order[REJECTED].unshift(id);
      showRejected = true; $("show-rejected").checked = true;
      close("modal-reject"); render();
      saveColumns(from, REJECTED);
    };
  }

  function restore(id) {
    var c = state.cards[id];
    removeFrom(REJECTED, id);
    c.stage = "requests"; c.rejected = false; c.rejection_reason = "";
    c.stage_entered_at = nowISO(); c.history.push({ stage: "requests", at: c.stage_entered_at });
    state.order.requests.unshift(id);
    render();
    saveColumns(REJECTED, "requests");
  }

  // ---- new request ---------------------------------------------------------
  function openNew() {
    $("new-body").innerHTML =
      '<div class="modal-head"><h2>New request</h2></div>' +
      '<div class="form-grid">' +
      '<label>Type *<select id="n-type"><option value="app">Application</option><option value="agent">Agent</option></select></label>' +
      '<label>Requester<input id="n-requester" value="' + esc(CURRENT_USER) + '"></label>' +
      '<label class="full">Title *<input id="n-title" placeholder="e.g. Warranty Claim Triage Agent"></label>' +
      '<label class="full">User story *<textarea id="n-story" placeholder="As a [persona], I want [capability] so that [benefit]."></textarea>' +
      '<span class="help">A good user story reads: “As a [persona], I want [capability] so that [benefit].” Add acceptance criteria if known.</span></label>' +
      '<label>Owner<input id="n-owner" placeholder="Optional"></label>' +
      '<label>Request date<input id="n-reqdate" type="date" value="' + todayISODate() + '"></label>' +
      '<label>Requested go-live<input id="n-golive" type="date"></label>' +
      '<label>Tags<input id="n-tags" placeholder="comma, separated"></label>' +
      '<label class="full">Description<textarea id="n-desc" placeholder="Any extra context"></textarea></label>' +
      "</div>" +
      '<div class="form-actions"><span class="formmsg err" id="n-msg"></span>' +
      '<button class="btn" id="n-cancel">Cancel</button>' +
      '<button class="btn primary" id="n-go">Create request</button></div>';
    open("modal-new");
    $("n-cancel").onclick = function () { close("modal-new"); };
    $("n-go").onclick = submitNew;
  }

  function submitNew() {
    var title = $("n-title").value.trim(), story = $("n-story").value.trim();
    if (!title || !story) { $("n-msg").textContent = "Title and user story are required."; return; }
    var id = genId();
    state.cards[id] = card({
      id: id, type: $("n-type").value, title: title, user_story: story,
      requester: $("n-requester").value.trim() || CURRENT_USER,
      owner: $("n-owner").value.trim(),
      request_date: $("n-reqdate").value || todayISODate(),
      completion_date: $("n-golive").value || "",
      description: $("n-desc").value.trim(),
      tags: $("n-tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean),
      stage: "requests", stage_entered_at: nowISO()
    });
    state.order.requests.unshift(id);
    close("modal-new"); render();
    saveColumns("requests");
  }

  // ---- detail panel --------------------------------------------------------
  function openDetail(id) {
    var c = state.cards[id]; if (!c) return;
    var s = slaStatus(c);
    var comments = c.comments.length
      ? c.comments.map(function (m) {
          return '<div class="comment"><div class="c-meta">' + esc(m.author) + " · " + esc(fmtDateTime(m.at)) +
            '</div><div class="c-text">' + esc(m.text) + "</div></div>";
        }).join("")
      : '<p style="color:var(--faint);font-size:13px">No comments yet.</p>';
    var attachments = c.attachments.length
      ? c.attachments.map(function (a, i) {
          return '<div class="attach">&#128206; <a href="' + esc(a.url || "#") + '" target="_blank" rel="noopener">' +
            esc(a.name) + "</a> <button class=\"btn sm ghost\" data-rmatt=\"" + i + "\">remove</button></div>";
        }).join("")
      : '<p style="color:var(--faint);font-size:13px">None.</p>';
    var timeline = c.history.slice().reverse().map(function (h) {
      var lbl = h.stage === REJECTED ? "Rejected" : (STAGE[h.stage] ? STAGE[h.stage].label : h.stage);
      return '<div class="tl"><span class="tl-stage">' + esc(lbl) + '</span><span class="tl-at">' + esc(fmtDateTime(h.at)) + "</span></div>";
    }).join("");

    $("detail-body").innerHTML =
      '<div class="modal-head">' +
      '<span class="k-type ' + c.type + '">' + (c.type === "agent" ? "Agent" : "App") + "</span>" +
      "<h2>" + esc(c.title) + "</h2>" +
      (c.on_hold ? ' <span class="chip-hold">On hold</span>' : "") +
      (c.stage === REJECTED ? ' <span class="chip-rej">Rejected</span>' : "") +
      '<span class="spacer"></span><button class="btn sm" id="d-close">Close</button></div>' +

      '<div class="form-grid" style="margin-top:8px">' +
      '<label>Type<select id="d-type"><option value="app"' + (c.type === "app" ? " selected" : "") + ">Application</option>" +
      '<option value="agent"' + (c.type === "agent" ? " selected" : "") + ">Agent</option></select></label>" +
      '<label>Stage<input value="' + esc(c.stage === REJECTED ? "Rejected" : STAGE[c.stage].label) + '" disabled></label>' +
      '<label class="full">Title<input id="d-title" value="' + esc(c.title) + '"></label>' +
      '<label class="full">User story<textarea id="d-story">' + esc(c.user_story) + "</textarea></label>" +
      '<label>Requester<input id="d-requester" value="' + esc(c.requester) + '"></label>' +
      '<label>Owner<input id="d-owner" value="' + esc(c.owner) + '"></label>' +
      '<label>Request date<input id="d-reqdate" type="date" value="' + esc((c.request_date || "").slice(0, 10)) + '"></label>' +
      '<label>Requested go-live<input id="d-golive" type="date" value="' + esc((c.completion_date || "").slice(0, 10)) + '"></label>' +
      '<label>Stage due date<input value="' + esc(s.due ? fmtDate(s.due.toISOString()) : "—") + '" disabled></label>' +
      '<label>Tags<input id="d-tags" value="' + esc((c.tags || []).join(", ")) + '"></label>' +
      '<label class="full">Description<textarea id="d-desc">' + esc(c.description) + "</textarea></label>" +
      "</div>" +
      (c.stage === REJECTED && c.rejection_reason
        ? '<p style="color:var(--accent);font-size:13px;margin:4px 0 0">Rejection reason: ' + esc(c.rejection_reason) + "</p>" : "") +

      '<div class="d-section"><h4>Attachments</h4>' + attachments +
      '<div class="d-row" style="margin-top:8px"><input id="att-name" placeholder="name" style="max-width:180px">' +
      '<input id="att-url" placeholder="https://…" style="max-width:220px">' +
      '<button class="btn sm" id="att-add">Add</button></div></div>' +

      '<div class="d-section"><h4>Activity</h4><div class="timeline">' + timeline + "</div></div>" +

      '<div class="d-section"><h4>Comments</h4>' + comments +
      '<div class="d-row" style="margin-top:8px"><textarea id="cmt" placeholder="Add a comment…" style="min-height:52px"></textarea></div>' +
      '<div style="margin-top:8px"><button class="btn sm" id="cmt-add">Comment</button></div></div>' +

      '<div class="form-actions">' +
      '<button class="btn ' + (c.on_hold ? "" : "") + ' left" id="d-hold">' + (c.on_hold ? "Resume" : "Put on hold") + "</button>" +
      (c.stage === REJECTED
        ? '<button class="btn" id="d-restore">Restore</button>'
        : '<button class="btn danger" id="d-reject">Reject</button>') +
      '<button class="btn primary" id="d-save">Save changes</button></div>';

    open("modal-detail");
    $("d-close").onclick = function () { close("modal-detail"); };
    $("d-hold").onclick = function () { c.on_hold = !c.on_hold; close("modal-detail"); render(); saveCard(id); };
    if ($("d-reject")) $("d-reject").onclick = function () { close("modal-detail"); openReject(id); };
    if ($("d-restore")) $("d-restore").onclick = function () { restore(id); close("modal-detail"); };
    $("d-save").onclick = function () {
      c.type = $("d-type").value; c.title = $("d-title").value.trim() || c.title;
      c.user_story = $("d-story").value; c.requester = $("d-requester").value.trim();
      c.owner = $("d-owner").value.trim(); c.request_date = $("d-reqdate").value;
      c.completion_date = $("d-golive").value; c.description = $("d-desc").value;
      c.tags = $("d-tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
      close("modal-detail"); render(); saveCard(id);
    };
    $("att-add").onclick = function () {
      var n = $("att-name").value.trim(); if (!n) return;
      c.attachments.push({ name: n, url: $("att-url").value.trim() });
      saveCard(id); openDetail(id);
    };
    Array.prototype.forEach.call(document.querySelectorAll("[data-rmatt]"), function (b) {
      b.onclick = function () { c.attachments.splice(+b.getAttribute("data-rmatt"), 1); saveCard(id); openDetail(id); };
    });
    $("cmt-add").onclick = function () {
      var t = $("cmt").value.trim(); if (!t) return;
      c.comments.push({ author: CURRENT_USER, at: nowISO(), text: t });
      saveCard(id); openDetail(id);
    };
  }

  // ---- modal helpers -------------------------------------------------------
  function open(id) { $(id).hidden = false; }
  function close(id) { $(id).hidden = true; }
  function backdropClose(id) {
    $(id).addEventListener("click", function (e) { if (e.target === $(id)) close(id); });
  }
  function anyModalOpen() {
    return ["modal-detail", "modal-new", "modal-reject"].some(function (id) {
      return $(id) && !$(id).hidden;
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- polling: keep everyone's board in sync ------------------------------
  function startPolling() {
    setInterval(function () {
      if (dragId || anyModalOpen()) return;                 // don't yank the UI mid-interaction
      if (Date.now() - lastWrite < WRITE_QUIET_MS) return;  // let our own write settle first
      loadFromDB().then(function (ok) { if (ok) render(); });
    }, POLL_MS);
  }

  // ---- init ----------------------------------------------------------------
  async function init() {
    $("new").onclick = openNew;
    $("search").addEventListener("input", function () { filter.q = this.value; render(); });
    $("show-rejected").addEventListener("change", function () { showRejected = this.checked; render(); });
    ["modal-detail", "modal-new", "modal-reject"].forEach(backdropClose);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") ["modal-detail", "modal-new", "modal-reject"].forEach(close);
    });

    var cfg = window.EVOTTI_CONFIG;
    if (!window.supabase || !cfg || !cfg.supabaseUrl || !cfg.supabaseKey) {
      showErrorNotice("Supabase client didn't load. Check /platform/config.js and the supabase-js script tag.");
      return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

    var ok = await loadFromDB();
    if (!ok) return;   // setup / error notice already shown
    render();
    startPolling();
  }

  init();
})();
