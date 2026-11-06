import { MODES, MODE_KEYS, FORMATS, PHASE, PHASES, steps, newState, apply, currentStep, openMaps, randomAct, cleanMeta, cleanMapName, defaultPool, modePlan, poolProblems, MAX_MAPS, mapSlug, TURN_MS, isCode } from "./veto-engine.js";

const PREVIEW = !!window.VETO_PREVIEW;          // set only in the Claude preview build
const REALTIME_SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtCode = c => (c ? c.slice(0, 3) + " " + c.slice(3) : "");
const cleanCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const icon = id => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const STROKE = `<svg class="stroke" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M1 6.5C22 3.5 48 8.5 72 5S94 4 99 6"/></svg>`;
const STRIKE = `<svg class="strike" viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden="true"><path d="M3 52C26 43 60 25 97 9"/></svg>`;

const store = {
  get: k => { try { return JSON.parse(localStorage.getItem("codm-veto:" + k) || "null"); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem("codm-veto:" + k, JSON.stringify(v)); } catch {} }
};

async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || "GET", headers: { "Content-Type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw { status: r.status, message: j.error || "Something went wrong. Try again" };
  return j;
}

// ---------- state ----------
let server = { rooms: false, realtime: null, checked: false };
let view = "home";                        // home | create | local | room
let META = null, ST = null, HIST = [], SEATS = { t1: null, t2: null }, REV = 0, CODE = null, turnAt = Date.now();
let mine = {};                            // {hostKey, k1, k1At, k2, k2At} for the open room
let pending = false, selected = null, override = false, sentTimeout = -1;
let sb = null, channel = null, live = false, pollT = null, seatName = store.get("name") || "";
let lastSeats = "", lastHost = "";

const team = t => META[t === 1 ? "t1" : "t2"];
const cur = () => (ST ? currentStep(ST, META) : null);
const isHost = () => view === "room" && !!mine.hostKey;
const holdsSeat = t => !!(mine["k" + t] && SEATS["t" + t] && SEATS["t" + t].at === mine["k" + t + "At"]);
function myTeams() {
  if (view === "local") return [1, 2];
  if (isHost() && override) return [1, 2];
  return [1, 2].filter(holdsSeat);
}
const canActNow = () => { const s = cur(); return !!s && !pending && myTeams().includes(s.team); };

// ---------- moves ----------
async function dispatch(act) {
  if (!canActNow()) return;
  const st = cur();
  if (view === "local") {
    const next = apply(ST, META, act); if (!next) return;
    HIST.push(ST); ST = next; turnAt = Date.now(); sentTimeout = -1; selected = null; render(); return;
  }
  const seat = holdsSeat(st.team);
  await post({ op: "act", i: ST.i, act, key: seat ? mine["k" + st.team] : mine.hostKey, asHost: !seat });
  selected = null; render();
}
async function post(body) {
  pending = true; render();
  try { const r = await api(`/api/rooms/${CODE}`, { method: "POST", body }); applyRoom(r.rev, r.data); return r; }
  catch (e) { toast(e.message); refresh(); return null; }
  finally { pending = false; render(); }
}
function undo() {
  if (view === "local") { if (!HIST.length) return; ST = HIST.pop(); turnAt = Date.now(); selected = null; render(); return; }
  if (isHost()) post({ op: "undo", key: mine.hostKey });
}
function restart() {
  if (view === "local") { ST = newState(META); HIST = []; turnAt = Date.now(); selected = null; render(); return; }
  if (isHost()) post({ op: "restart", key: mine.hostKey });
}
async function claimSeat(t) {
  const name = (seatName || "").trim();
  if (!name) { toast("Type your name first"); $("seatname" + t)?.focus(); return; }
  store.set("name", name);
  const r = await post({ op: "claim", team: t, name });
  if (r?.seatKey) { mine["k" + t] = r.seatKey; mine["k" + t + "At"] = r.data.seats["t" + t].at; store.set(CODE, mine); render(); }
}
async function freeSeat(t) {
  const key = holdsSeat(t) ? mine["k" + t] : mine.hostKey;
  const r = await post({ op: "free", team: t, key });
  if (r && holdsSeat(t) === false) { delete mine["k" + t]; delete mine["k" + t + "At"]; store.set(CODE, mine); }
}

// ---------- lobby ----------
function readCreateForm() {
  return cleanMeta({
    fmt: $("c_fmt").value, adv: +$("c_adv").value, timer: $("c_timer").checked,
    t1: { name: $("c_t1name").value, tag: $("c_t1tag").value },
    t2: { name: $("c_t2name").value, tag: $("c_t2tag").value },
    pool: Object.fromEntries(MODE_KEYS.map(m => [m, POOL[m].filter(x => x.on).map(x => x.name)]))
  });
}
// ---------- map pool editor ----------
const freshPool = () => Object.fromEntries(MODE_KEYS.map(m => [m, MODES[m].maps.map(name => ({ name, on: true, custom: false }))]));
function loadPool() {
  const saved = store.get("pool");
  if (!saved || typeof saved !== "object") return freshPool();
  const out = {};
  for (const m of MODE_KEYS) {
    const list = Array.isArray(saved[m]) ? saved[m].filter(x => x && cleanMapName(x.name)).map(x => ({ name: cleanMapName(x.name), on: x.on !== false, custom: !MODES[m].maps.includes(x.name) })) : [];
    for (const name of MODES[m].maps) if (!list.some(x => x.name === name)) list.push({ name, on: false, custom: false });
    out[m] = list.slice(0, MAX_MAPS + MODES[m].maps.length);
  }
  return out;
}
let POOL = loadPool();
const savePool = () => store.set("pool", POOL);
const isDefaultPool = () => MODE_KEYS.every(m => POOL[m].length === MODES[m].maps.length && POOL[m].every(x => x.on && !x.custom));

function renderPoolEditor() {
  const fmt = $("c_fmt").value, meta = readCreateForm(), problems = poolProblems(meta);
  $("pooleditor").innerHTML = MODE_KEYS.map(m => {
    const on = POOL[m].filter(x => x.on).length, plan = modePlan(fmt, m, on);
    const prob = problems.find(p => p.mode === m);
    const parts = plan ? [`${on} map${on !== 1 ? "s" : ""}`, `${plan.bans} ban${plan.bans !== 1 ? "s" : ""}`, plan.picks.length ? `${plan.picks.length} pick${plan.picks.length !== 1 ? "s" : ""}` : "", plan.decider ? "1 decider" : "", plan.unused ? `${plan.unused} unused` : ""].filter(Boolean) : [`${on} maps`, "not played"];
    const full = on >= MAX_MAPS;
    return `<div class="pe"><div class="pe-head"><b>${MODES[m].name}</b><span class="mono">${parts.join(" · ")}</span></div>
      <div class="chips">${POOL[m].map((x, k) => `<span class="chip ${x.on ? "on" : ""}"><button type="button" data-toggle="${m}:${k}" aria-pressed="${x.on}" title="${x.on ? "Switch off" : "Switch on"}">${esc(x.name)}</button>${x.custom ? `<button type="button" class="x" data-remove="${m}:${k}" aria-label="Remove ${esc(x.name)}">${icon("x")}</button>` : ""}</span>`).join("")}</div>
      <div class="add"><input type="text" id="add_${m}" maxlength="24" placeholder="Add a ${MODES[m].short} map" aria-label="Add a ${MODES[m].name} map" ${full ? "disabled" : ""}><button type="button" class="btn small" data-add="${m}" ${full ? "disabled" : ""}>${icon("plus")}Add</button></div>
      ${prob ? `<p class="err">${esc(prob.message)}</p>` : ""}</div>`;
  }).join("");
  $("poolreset").hidden = isDefaultPool();
  $("createbtn").disabled = problems.length > 0;
  return problems;
}
function addMap(m) {
  const input = $("add_" + m), name = cleanMapName(input.value);
  if (!name) { input.focus(); return; }
  if (POOL[m].some(x => x.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already in the ${MODES[m].name} pool`); input.select(); return; }
  if (POOL[m].filter(x => x.on).length >= MAX_MAPS) { toast(`A pool can hold up to ${MAX_MAPS} maps`); return; }
  POOL[m].push({ name, on: true, custom: true }); savePool(); paintOrder(); $("add_" + m)?.focus();
}

function paintOrder() {
  const L = steps(readCreateForm()), n = p => L.filter(s => PHASE[s.type] === p && s.type !== "decider").length;
  const dec = L.filter(s => s.type === "decider").length, picks = n("Picks");
  $("o_bans").textContent = `${n("Bans")} bans`;
  $("o_picks").textContent = picks ? `${picks} picks${dec ? `, ${dec} decider` : ""}` : `${dec} deciders, no picks`;
  $("o_sides").textContent = `${n("Sides")} side choices`;
  $("c_advwrap").hidden = $("c_fmt").value !== "gf";
  renderPoolEditor();
}
async function createRoom(e) {
  e.preventDefault(); $("createerr").textContent = "";
  const problems = poolProblems(readCreateForm());
  if (problems.length) { $("createerr").textContent = problems[0].message; return; }
  if (!server.rooms) { $("createerr").textContent = PREVIEW ? "Rooms run on the deployed site. This preview only practices on one screen" : "Rooms aren't set up on this server yet. See the README to connect Supabase"; return; }
  $("createbtn").disabled = true;
  try {
    const r = await api("/api/rooms", { method: "POST", body: { meta: readCreateForm() } });
    store.set(r.code, { hostKey: r.hostKey });
    location.hash = r.code;
  } catch (err) { $("createerr").textContent = err.message; }
  $("createbtn").disabled = false;
}
async function joinRoom(e) {
  e.preventDefault(); $("joinerr").textContent = "";
  const c = cleanCode($("j_code").value);
  if (!isCode(c)) { $("joinerr").textContent = "Room codes are 6 letters and numbers, like K7QM4X"; return; }
  if (!server.rooms) { $("joinerr").textContent = PREVIEW ? "Rooms run on the deployed site" : "Rooms aren't set up on this server yet"; return; }
  $("joinbtn").disabled = true;
  try { await api(`/api/rooms/${c}`); location.hash = c; }
  catch (err) { $("joinerr").textContent = err.status === 404 ? `No room uses ${fmtCode(c)}. Check the code with your admin` : err.message; }
  $("joinbtn").disabled = false;
}
function startLocal(meta) {
  if (!meta) { const problems = poolProblems(readCreateForm()); if (problems.length) { $("createerr").textContent = problems[0].message; return; } }
  leaveRoom(true);
  view = "local"; META = meta || readCreateForm(); ST = newState(META); HIST = []; turnAt = Date.now(); selected = null;
  if (location.hash !== "#practice") { try { history.pushState(null, "", "#practice"); } catch {} }
  render(); scrollTo(0, 0);
}
const sampleMeta = () => cleanMeta({ fmt: "bo5", t1: { name: "Nightjar", tag: "NJ" }, t2: { name: "Ironclad", tag: "IC" } });

// ---------- navigation ----------
function go(v) {
  leaveRoom(true);
  view = v; CODE = null;
  if (v === "home") { META = null; ST = null; }
  render(); scrollTo(0, 0);
}

// ---------- room ----------
function applyRoom(rev, data) {
  if (!data || rev < REV) return;
  if (data.turnAt !== turnAt) sentTimeout = -1;
  REV = rev; META = data.meta; ST = data.state; HIST = data.history || []; SEATS = data.seats || { t1: null, t2: null }; turnAt = data.turnAt;
  rememberRoom();
  const st = cur();
  if (selected && !(st && ST.status[st.mode]?.[selected]?.st === "open")) selected = null;
  render();
}
async function refresh() {
  if (view !== "room" || !CODE) return;
  try { const r = await api(`/api/rooms/${CODE}`); applyRoom(r.rev, r.data); }
  catch (e) { if (e.status === 404) { toast(`Room ${fmtCode(CODE)} no longer exists`); leaveRoom(); } }
}
function schedulePoll() {
  clearTimeout(pollT);
  if (view !== "room") return;
  const ms = document.hidden ? 15000 : live ? 8000 : 2000;
  pollT = setTimeout(async () => { await refresh(); schedulePoll(); }, ms);
}
async function subscribe(code) {
  if (!server.realtime) return;
  try {
    if (!sb) { const { createClient } = await import(REALTIME_SDK); sb = createClient(server.realtime.url, server.realtime.key, { auth: { persistSession: false } }); }
    channel = sb.channel("room-" + code)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code}` }, p => applyRoom(p.new.rev, p.new.data))
      .subscribe(status => { live = status === "SUBSCRIBED"; schedulePoll(); });
  } catch { live = false; }
}
async function enterRoom(code) {
  leaveRoom(true);
  view = "room"; CODE = code; mine = store.get(code) || {}; REV = 0; META = null; ST = null; override = false; lastSeats = lastHost = "";
  render();
  await refresh();
  if (view !== "room" || CODE !== code) return;
  subscribe(code); schedulePoll();
}
function leaveRoom(silent) {
  clearTimeout(pollT);
  if (channel && sb) { sb.removeChannel(channel); channel = null; }
  live = false;
  if (!silent) { location.hash = ""; go("home"); }
}
function route() {
  const h = location.hash.slice(1);
  if (h === "new") { if (view !== "create") go("create"); return; }
  if (h === "practice") { if (view !== "local") startLocal(sampleMeta()); return; }
  const c = cleanCode(h || new URLSearchParams(location.search).get("room"));
  if (isCode(c) && server.rooms) { if (CODE !== c || view !== "room") enterRoom(c); return; }
  if (isCode(c)) $("j_code").value = c;
  if (view !== "home") go("home");
}

// ---------- your rooms (this device) ----------
const recentRooms = () => { const r = store.get("recent"); return Array.isArray(r) ? r : []; };
function rememberRoom() {
  if (view !== "room" || !META || !CODE) return;
  const role = isHost() ? "Host" : myTeams().length ? "Captain" : "Watching";
  const entry = { code: CODE, t1: META.t1.name, t2: META.t2.name, fmt: META.fmt, role, done: !cur(), at: Date.now() };
  const list = [entry, ...recentRooms().filter(r => r.code !== CODE)].slice(0, 8);
  store.set("recent", list);
}
function forgetRoom(code) { store.set("recent", recentRooms().filter(r => r.code !== code)); render(); }
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d === 1 ? "yesterday" : `${d} days ago`;
}

// ---------- home ----------
function renderHome() {
  $("servernote").textContent = !server.checked ? "Checking the server…"
    : server.rooms ? "Captains open this same site, enter the code and take their seat"
    : PREVIEW ? "This preview runs on one screen. Room codes work on the deployed site"
    : "Rooms aren't connected on this server yet. You can still try a sample veto";
  if (!$("heroviz").childElementCount) $("heroviz").innerHTML = heroBoard();
  if (!$("formats").childElementCount) $("formats").innerHTML = formatsTable();
  if (!$("poolview").childElementCount) $("poolview").innerHTML = MODE_KEYS.map(m => `<div class="pv"><div class="pv-head"><b>${MODES[m].name}</b><span class="mono">${MODES[m].maps.length} maps</span></div><span class="faint">${MODES[m].rule}</span><ul>${MODES[m].maps.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
  const rooms = recentRooms();
  $("recent").hidden = !rooms.length;
  $("recentlist").innerHTML = rooms.map(r => `<li><a href="#${esc(r.code)}" class="rr"><span class="mono code-s">${fmtCode(r.code)}</span><span class="rr-main"><b>${esc(r.t1)} vs ${esc(r.t2)}</b><span class="faint">${FORMATS[r.fmt]?.label || ""} · ${r.role} · ${r.done ? "Veto complete" : "In progress"} · ${ago(r.at)}</span></span><span class="rr-go">Open</span></a><button type="button" class="btn ghost small" data-forget="${esc(r.code)}" aria-label="Remove ${fmtCode(r.code)} from this list">${icon("x")}</button></li>`).join("");
}
function formatsTable() {
  const head = `<thead><tr><th>Format</th><th>Map order</th><th class="num">Bans</th><th class="num">Picks</th><th class="num">Deciders</th><th class="num">Side choices</th></tr></thead>`;
  const rows = Object.keys(FORMATS).map(f => {
    const L = steps(cleanMeta({ fmt: f })), c = t => L.filter(s => s.type === t).length;
    return `<tr><td>${FORMATS[f].label}</td><td class="mono">${FORMATS[f].order.map(m => MODES[m].short).join(" · ")}</td><td class="num mono">${c("ban")}</td><td class="num mono">${c("pick")}</td><td class="num mono">${c("decider")}</td><td class="num mono">${c("side")}</td></tr>`;
  }).join("");
  return head + `<tbody>${rows}</tbody>`;
}
// A still frame from a Bo5 veto: bans done, Nightjar picked Map 1, Ironclad picking Map 2.
function heroBoard() {
  const meta = sampleMeta(); let S = newState(meta);
  for (const map of ["Hacienda", "Arsenal", "Takeoff", "Coastal", "Slums", "Firing Range", "Raid", "Standoff", "Summit"]) { const n = apply(S, meta, { kind: "map", map }); if (n) S = n; }
  const st = currentStep(S, meta), tm = t => meta["t" + t];
  const vis = steps(meta).map((x, k) => ({ x, k })).filter(o => o.x.type !== "decider"), done = vis.filter(o => o.k < S.i).length;
  const order = [...MODES.snd.maps].sort((a, b) => (S.status.snd[a].st === "open" ? 0 : 1) - (S.status.snd[b].st === "open" ? 0 : 1));
  const tiles = order.map(x => {
    const s = S.status.snd[x], k = s.by ? "k" + s.by : "";
    const line = s.st === "ban" ? `<b>${tm(s.by).tag}</b> ban` : s.st === "pick" ? `Map ${s.slot} · <b>${tm(s.by).tag}</b>` : "";
    const img = PREVIEW ? "" : `<img src="images/maps/${mapSlug(x)}.jpg" alt="">`;
    return `<div class="map ${s.st} ${k}${x === "Meltdown" ? " sel" : ""}">${img}<span class="shade"></span>${s.st === "ban" ? STRIKE : ""}${line ? `<span class="tagline">${line}</span>` : ""}<span class="nm">${esc(x)}</span></div>`;
  }).join("");
  const sheet = [1, 2, 3].map(n => {
    const s = S.slots[n];
    const by = s.map ? (s.by ? `<span><span class="t k${s.by}">${tm(s.by).tag}</span> pick</span>` : `<span>Decider</span>`) : "";
    return `<li class="entry"><span class="no">${n}</span><div><div class="md">${MODES[s.mode].name}</div><div class="mp ${s.map ? "" : "tbd"}">${s.map ? esc(s.map) : "To be decided"}</div>${by ? `<div class="meta">${by}<span class="faint">Side after picks</span></div>` : ""}</div></li>`;
  }).join("");
  return `<div class="hv-turn turn k${st.team}"><div class="what"><span class="step">Picks · step ${done + 1} of ${vis.length}</span><h2><span class="who">${tm(st.team).name}${STROKE}</span> picks Map ${st.slot}</h2></div><span class="go">Pick Meltdown</span></div>
    <div class="hv-grid"><div class="pool"><header><h3>Search &amp; Destroy<small>${MODES.snd.rule}</small></h3><span class="state live k${st.team}">${tm(st.team).name} is picking</span></header><div class="grid">${tiles}</div></div>
    <div class="card"><h3>Match sheet <span class="mono">1 of 5 set</span></h3><ol class="sheet">${sheet}</ol></div></div>`;
}

// ---------- timer ----------
setInterval(() => {
  const c = $("clockv"), st = cur();
  if (!c || !META?.timer || !st) return;
  const left = Math.max(0, Math.ceil((turnAt + TURN_MS - Date.now()) / 1000));
  c.textContent = left + "s"; c.classList.toggle("low", left <= 10);
  if (left > 0 || sentTimeout === ST.i) return;
  sentTimeout = ST.i;
  if (view === "local") { const a = randomAct(ST, META); const next = apply(ST, META, a); if (next) { HIST.push(ST); ST = next; turnAt = Date.now(); selected = null; render(); } }
  else { const i = ST.i; setTimeout(() => { if (ST.i === i) api(`/api/rooms/${CODE}`, { method: "POST", body: { op: "timeout", i } }).then(r => applyRoom(r.rev, r.data)).catch(() => {}); }, Math.random() * 1200); }
}, 500);

// ---------- render ----------
function render() {
  $("home").hidden = view !== "home"; $("lobby").hidden = view !== "create"; $("veto").hidden = view !== "local" && view !== "room";
  const ta = $("topactions");
  if (view === "home") { ta.innerHTML = `<a class="btn" href="#new">${icon("plus")}Create a room</a>`; renderHome(); return; }
  if (view === "create") { ta.innerHTML = `<a class="btn ghost" href="#">Back to home</a>`; paintOrder(); return; }
  const hostish = view === "local" || isHost();
  ta.innerHTML = (hostish ? `<button class="btn ghost" type="button" id="undo" ${HIST.length && !pending ? "" : "disabled"}>${icon("undo")}Undo</button><button class="btn ghost" type="button" id="restart" ${pending ? "disabled" : ""}>${icon("restart")}Restart</button>` : "")
    + `<button class="btn" type="button" id="leave">${icon("leave")}${view === "local" ? "End practice" : "Leave room"}</button>`;

  $("roombar").hidden = view !== "room";
  if (!META) {
    $("codev").textContent = fmtCode(CODE); $("seats").innerHTML = `<span class="muted">Loading the room…</span>`; lastSeats = "";
    ["g1", "g2", "n1", "n2", "fmtchip", "stepno", "verb", "sub", "seriescount"].forEach(i => ($(i).textContent = ""));
    ["rail", "controls", "pools", "sheet", "log", "hostactions"].forEach(i => ($(i).innerHTML = "")); $("donecard").hidden = true;
    return;
  }
  const F = FORMATS[META.fmt], L = steps(META), st = cur(), act = canActNow();

  if (view === "room") renderRoomBar();

  $("g1").textContent = team(1).tag; $("g2").textContent = team(2).tag;
  $("n1").textContent = team(1).name; $("n2").textContent = team(2).name;
  $("fmtchip").textContent = F.label;
  $("advnote").hidden = META.fmt !== "gf";
  if (META.fmt === "gf") $("advnote").textContent = `${team(META.adv).name} starts the series 1–0`;

  // phase rail
  const vis = L.map((s, k) => ({ s, k })).filter(o => o.s.type !== "decider");
  const phase = st ? PHASE[st.type] : null;
  $("rail").innerHTML = PHASES.map(p => {
    const g = vis.filter(o => PHASE[o.s.type] === p);
    if (!g.length) return `<div class="ph"><div class="lbl"><span>${p}</span><span class="mono">none</span></div><div class="seg"><i class="done c0"></i></div></div>`;
    const d = g.filter(o => o.k < ST.i).length;
    return `<div class="ph ${p === phase ? "now" : ""}"><div class="lbl"><span>${p}</span><span class="mono">${d}/${g.length}</span></div><div class="seg">${g.map(o => `<i class="c${o.s.team} ${o.k < ST.i ? "done" : ""} ${o.k === ST.i ? "now" : ""}"></i>`).join("")}</div></div>`;
  }).join("");

  // turn banner
  const done = vis.filter(o => o.k < ST.i).length;
  $("turn").className = "turn" + (st ? " k" + st.team : "");
  $("stepno").textContent = st ? `${phase} · step ${done + 1} of ${vis.length}` : `${vis.length} of ${vis.length} steps`;
  const clock = META.timer && st ? `<span class="clock" id="clockv">30s</span>` : "";
  let wait = "";
  if (st && !act && view === "room") {
    const seat = SEATS["t" + st.team];
    wait = `<span class="wait">${pending ? "Saving…" : seat ? `Waiting for ${esc(seat.name)}, ${esc(team(st.team).name)} captain` : `${esc(team(st.team).name)} has no captain yet, send them the invite link`}</span>`;
  }
  const who = t => `<span class="who">${esc(team(t).name)}${STROKE}</span>`;
  if (!st) {
    $("verb").textContent = "Veto complete"; $("sub").textContent = "Map order and starting sides are locked";
    $("controls").innerHTML = "";
  } else if (st.type === "side") {
    const s = ST.slots[st.slot], sides = MODES[s.mode].sides;
    $("verb").innerHTML = `${who(st.team)} chooses a starting side`;
    $("sub").textContent = `Map ${st.slot}, ${s.map}, ${MODES[s.mode].name}`;
    $("controls").innerHTML = clock + (wait || sides.map((x, k) => `<button class="sidebtn" type="button" data-side="${k}" ${act ? "" : "disabled"}><b>${x}</b><small>${esc(team(3 - st.team).tag)} gets ${sides[1 - k]}</small></button>`).join(""));
  } else {
    const m = MODES[st.mode];
    $("verb").innerHTML = st.type === "ban" ? `${who(st.team)} bans a ${m.name} map` : `${who(st.team)} picks Map ${st.slot}`;
    $("sub").textContent = st.type === "ban" ? `${openMaps(ST, st.mode).length} maps left in the ${m.name} pool` : `${m.name}, sides are chosen after every map is picked`;
    $("controls").innerHTML = clock + (wait || `<button class="go" type="button" id="confirm" ${selected && act ? "" : "disabled"}>${selected ? `${st.type === "ban" ? "Ban" : "Pick"} ${esc(selected)}` : "Select a map"}</button>`);
  }

  // pools
  const liveMode = st && (st.type === "ban" || st.type === "pick") ? st.mode : null;
  $("pools").innerHTML = Object.keys(MODES).filter(m => F.order.includes(m)).map(m => {
    const M = MODES[m], left = openMaps(ST, m).length, isLive = liveMode === m;
    const state = isLive ? `<span class="state live k${st.team}">${esc(team(st.team).name)} is ${st.type === "ban" ? "banning" : "picking"}</span>`
      : `<span class="state">${!st || st.type === "side" ? "Locked" : `${left} open`}</span>`;
    return `<section class="pool"><header><h3>${M.name}<small>${M.rule}</small></h3>${state}</header><div class="grid">${(ST.pool?.[m] || M.maps).map(x => tile(m, x, isLive, act, st)).join("")}</div></section>`;
  }).join("");

  // match sheet
  $("seriescount").textContent = `${Object.values(ST.slots).filter(s => s.map).length} of ${F.order.length} set`;
  $("sheet").innerHTML = F.order.map((m, k) => {
    const n = k + 1, s = ST.slots[n], sd = sideText(n);
    const by = s.map ? (s.by ? `<span><span class="t k${s.by}">${esc(team(s.by).tag)}</span> pick</span>` : `<span>Decider</span>`) : "";
    const sides = sd ? `<span><span class="t k${sd.aT}">${esc(sd.a.tag)}</span> ${sd.aSide} · <span class="t k${3 - sd.aT}">${esc(sd.b.tag)}</span> ${sd.bSide}</span>` : s.map ? `<span class="faint">Side after picks</span>` : "";
    return `<li class="entry"><span class="no">${n}</span><div><div class="md">${MODES[m].name}</div><div class="mp ${s.map ? "" : "tbd"}">${s.map ? esc(s.map) : "To be decided"}</div>${by || sides ? `<div class="meta">${by}${sides}</div>` : ""}</div></li>`;
  }).join("");

  // log
  $("log").innerHTML = ST.log.length ? ST.log.map((e, k) => {
    const M = MODES[e.mode]; let t;
    if (e.type === "ban") t = `<b>${esc(team(e.team).name)}</b> banned ${esc(e.map)}, ${M.short}`;
    else if (e.type === "pick") t = `<b>${esc(team(e.team).name)}</b> picked ${esc(e.map)} for Map ${e.slot}`;
    else if (e.type === "decider") t = `${esc(e.map)} is the last ${M.short} map, so it becomes Map ${e.slot}`;
    else t = `<b>${esc(team(e.team).name)}</b> starts Map ${e.slot} on ${M.sides[e.side]}`;
    return `<li><span class="mono">${String(k + 1).padStart(2, "0")}</span><span>${t}</span></li>`;
  }).reverse().join("") : `<li class="empty">No moves yet. ${esc(team(1).name)} opens with a Hardpoint ban.</li>`;

  $("donecard").hidden = !!st;
  if (!st) $("summary").textContent = summaryText();
}

function tile(m, x, isLive, act, st) {
  const s = ST.status[m][x], can = isLive && s.st === "open" && act;
  const finished = !st || st.type === "side";
  let line = "", k = "";
  if (s.st === "ban") { k = "k" + s.by; line = `<b>${esc(team(s.by).tag)}</b> ban`; }
  if (s.st === "pick") { k = "k" + s.by; line = `Map ${s.slot} · <b>${esc(team(s.by).tag)}</b>`; }
  if (s.st === "decider") line = `Map ${s.slot} · decider`;
  const unused = finished && s.st === "open";
  if (unused) line = "Not played";
  const img = PREVIEW ? "" : `<img src="images/maps/${mapSlug(x)}.jpg" alt="" loading="lazy">`;
  const label = `${x}${s.st === "ban" ? `, banned by ${team(s.by).name}` : s.st === "pick" ? `, Map ${s.slot}` : ""}`;
  return `<button type="button" class="map ${s.st} ${k}${selected === x && isLive ? " sel" : ""}${unused ? " unused" : ""}" data-map="${esc(x)}" ${can ? "" : "disabled"} aria-label="${esc(label)}">${img}<span class="shade"></span>${s.st === "ban" ? STRIKE : ""}${line ? `<span class="tagline">${line}</span>` : ""}<span class="nm">${esc(x)}</span></button>`;
}

function renderRoomBar() {
  $("codev").textContent = fmtCode(CODE);
  const seatsHTML = [1, 2].map(t => {
    const seat = SEATS["t" + t], tm = team(t), me = holdsSeat(t);
    if (seat) {
      const btn = me || isHost() ? `<button class="btn small" type="button" data-free="${t}">${me ? "Leave seat" : "Free seat"}</button>` : "";
      return `<div class="seat"><div class="who"><span><i class="swatch k${t}"></i>${esc(tm.name)} captain</span><b>${esc(seat.name)}${me ? `<span class="you">you</span>` : ""}</b></div>${btn}</div>`;
    }
    return `<div class="seat"><div class="who"><span><i class="swatch k${t}"></i>${esc(tm.name)} captain</span><b class="open">Open</b></div><form data-claim="${t}"><input id="seatname${t}" type="text" maxlength="20" placeholder="Your name" aria-label="Your name" value="${esc(seatName)}"><button class="btn small" type="submit" ${pending ? "disabled" : ""}>Take seat</button></form></div>`;
  }).join("");
  if (seatsHTML !== lastSeats) { $("seats").innerHTML = seatsHTML; lastSeats = seatsHTML; }
  const hostHTML = isHost() ? `<label class="check"><input type="checkbox" id="override" ${override ? "checked" : ""}> Act for either team</label>`
    : `<span class="muted">${myTeams().length ? "You're a captain" : "Watching"}</span>`;
  if (hostHTML !== lastHost) { $("hostactions").innerHTML = hostHTML; lastHost = hostHTML; }
}

function sideText(slot) {
  const s = ST.slots[slot]; if (s.side == null) return null;
  const sides = MODES[s.mode].sides;
  return { a: team(s.sideTeam), b: team(3 - s.sideTeam), aSide: sides[s.side], bSide: sides[1 - s.side], aT: s.sideTeam };
}
function summaryText() {
  const F = FORMATS[META.fmt], lines = [`${team(1).name} vs ${team(2).name}, ${F.label}`];
  if (META.fmt === "gf") lines.push(`${team(META.adv).name} starts 1-0`);
  const bans = ST.log.filter(e => e.type === "ban").map(e => `${team(e.team).tag} ${e.map}`);
  if (bans.length) lines.push(`Bans: ${bans.join(", ")}`);
  F.order.forEach((m, k) => {
    const s = ST.slots[k + 1], sd = sideText(k + 1);
    lines.push(`Map ${k + 1}  ${MODES[m].short}  ${s.map} (${s.by ? team(s.by).tag + " pick" : "decider"})  ${sd.a.tag} ${sd.aSide} / ${sd.b.tag} ${sd.bSide}`);
  });
  return lines.join("\n");
}

let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 4200); }
function copyText(text, btn, label) {
  const restore = btn.innerHTML;
  const ok = () => { btn.innerHTML = label; setTimeout(() => (btn.innerHTML = restore), 1800); };
  try { navigator.clipboard.writeText(text).then(ok, () => toast("Copy didn't work here. Select the text and copy it yourself")); }
  catch { toast("Copy didn't work here. Select the text and copy it yourself"); }
}

// ---------- events ----------
document.addEventListener("click", e => {
  const t = e.target;
  const m = t.closest(".map"); if (m && !m.disabled) { selected = selected === m.dataset.map ? null : m.dataset.map; render(); return; }
  if (t.closest("#confirm") && selected) { dispatch({ kind: "map", map: selected }); return; }
  const sb2 = t.closest(".sidebtn"); if (sb2 && !sb2.disabled) { dispatch({ kind: "side", idx: +sb2.dataset.side }); return; }
  if (t.closest("#undo")) return undo();
  if (t.closest("#restart")) return restart();
  if (t.closest("#leave")) return leaveRoom();
  if (t.closest("#samplebtn")) return startLocal(sampleMeta());
  const fg = t.closest("[data-forget]"); if (fg) return forgetRoom(fg.dataset.forget);
  const f = t.closest("[data-free]"); if (f) return freeSeat(+f.dataset.free);
  const tg = t.closest("[data-toggle]"); if (tg) { const [m, k] = tg.dataset.toggle.split(":"); POOL[m][+k].on = !POOL[m][+k].on; savePool(); paintOrder(); return; }
  const rm = t.closest("[data-remove]"); if (rm) { const [m, k] = rm.dataset.remove.split(":"); POOL[m].splice(+k, 1); savePool(); paintOrder(); return; }
  const ad = t.closest("[data-add]"); if (ad) return addMap(ad.dataset.add);
  if (t.closest("#poolreset")) { POOL = freshPool(); savePool(); paintOrder(); return; }
  if (t.closest("#copylink")) return copyText(`${location.origin}${location.pathname}#${CODE}`, $("copylink"), `${icon("link")}Link copied`);
  if (t.closest("#copy")) return copyText(summaryText(), $("copy"), `${icon("copy")}Copied`);
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-claim]");
  if (f) { e.preventDefault(); claimSeat(+f.dataset.claim); }
});
document.addEventListener("input", e => { if (/^seatname/.test(e.target.id)) seatName = e.target.value; });
document.addEventListener("change", e => { if (e.target.id === "override") { override = e.target.checked; lastHost = ""; render(); } });
document.addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.remove(); }, true);
document.addEventListener("visibilitychange", () => { if (view === "room") { if (!document.hidden) refresh(); schedulePoll(); } });
document.addEventListener("keydown", e => { if (e.key === "Enter" && /^add_/.test(e.target.id || "")) { e.preventDefault(); addMap(e.target.id.slice(4)); } });
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "z" && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); } });
$("createform").addEventListener("submit", createRoom);
$("joinform").addEventListener("submit", joinRoom);
$("localbtn").addEventListener("click", () => startLocal());
$("c_fmt").addEventListener("change", paintOrder);
$("j_code").addEventListener("input", e => { e.target.value = cleanCode(e.target.value).slice(0, 6); });
window.addEventListener("hashchange", route);

// ---------- boot ----------
render();
(async () => {
  if (!PREVIEW) { try { server = { ...(await api("/api/config")), checked: true }; } catch { server = { rooms: false, realtime: null, checked: true }; } }
  else server = { rooms: false, realtime: null, checked: true };
  render(); route();
})();
