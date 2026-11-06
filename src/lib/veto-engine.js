// Shared by the browser (app.js) and the Vercel functions (api/).
// Default pools and veto orders follow the CODM World Championship 2026 esports settings.
// Order of play: all bans, then all picks (in map order), then all starting sides (in map order).
// Each room carries its own map pool (meta.pool), so admins can switch maps off or add their own.

export const MODES = {
  hp:  { name: "Hardpoint",        short: "HP",   rule: "First to 250",          sides: ["Side A", "Side B"], maps: ["Summit", "Hacienda", "Combine", "Takeoff", "Arsenal"] },
  snd: { name: "Search & Destroy", short: "S&D",  rule: "First to 9, OT cap 20", sides: ["Attack", "Defend"], maps: ["Tunisia", "Firing Range", "Coastal", "Slums", "Meltdown"] },
  ctl: { name: "Control",          short: "CTRL", rule: "First to 3 rounds",     sides: ["Attack", "Defend"], maps: ["Raid", "Standoff", "Crossroads Strike"] }
};
export const MODE_KEYS = Object.keys(MODES);

// Per mode: firstBan = team that bans first (bans alternate after that),
// picks = [team, map slot, team that chooses the starting side], decider = [map slot, team that chooses the side].
// Every mode bans until only the maps that get played are left, so no map is ever left over.
// The ban count follows the pool: bans = maps in pool - picks - decider.
export const FORMATS = {
  bo3: { label: "Best of 3", order: ["hp", "snd", "ctl"], modes: {
    hp:  { firstBan: 1, decider: [1, 1] },
    snd: { firstBan: 2, decider: [2, 2] },
    ctl: { firstBan: 1, decider: [3, 1] } } },
  bo5: { label: "Best of 5", order: ["hp", "snd", "ctl", "hp", "snd"], modes: {
    hp:  { firstBan: 1, picks: [[1, 1, 2], [2, 4, 1]] },
    snd: { firstBan: 2, picks: [[2, 2, 1], [1, 5, 2]] },
    ctl: { firstBan: 1, decider: [3, 1] } } },
  bo7: { label: "Best of 7", order: ["hp", "snd", "ctl", "hp", "snd", "ctl", "snd"], modes: {
    hp:  { firstBan: 1, picks: [[1, 1, 2], [2, 4, 1]] },
    snd: { firstBan: 2, picks: [[2, 2, 1], [1, 5, 2]], decider: [7, 2] },
    ctl: { firstBan: 1, picks: [[1, 3, 2], [2, 6, 1]] } } },
  gf:  { label: "Grand final, Bo7 with map advantage", order: ["hp", "snd", "ctl", "hp", "ctl", "snd"], modes: {
    hp:  { firstBan: 1, picks: [[1, 1, 2], [2, 4, 1]] },
    snd: { firstBan: 2, picks: [[2, 2, 1], [1, 6, 2]] },
    ctl: { firstBan: 1, picks: [[1, 3, 2], [2, 5, 1]] } } }
};

export const PHASE = { ban: "Bans", pick: "Picks", decider: "Picks", side: "Sides" };
export const PHASES = ["Bans", "Picks", "Sides"];
export const MAX_MAPS = 12;

export const defaultPool = () => Object.fromEntries(MODE_KEYS.map(m => [m, [...MODES[m].maps]]));
const poolOf = meta => meta?.pool || defaultPool();

// How one mode plays out for a pool of `size` maps.
export function modePlan(fmt, m, size) {
  const r = FORMATS[fmt]?.modes[m];
  if (!r) return null;
  const picks = r.picks || [], decider = r.decider || null;
  const min = picks.length + (decider ? 1 : 0);
  const bans = Math.max(0, size - min);
  return { firstBan: r.firstBan || 1, bans, picks, decider, min, unused: 0 };
}

export function poolProblems(meta) {
  const pool = poolOf(meta), out = [];
  for (const m of MODE_KEYS) {
    const plan = modePlan(meta.fmt, m, (pool[m] || []).length);
    if (plan && (pool[m] || []).length < plan.min)
      out.push({ mode: m, message: `${MODES[m].name} needs at least ${plan.min} map${plan.min > 1 ? "s" : ""} in this format` });
  }
  return out;
}

const cache = {};
export function steps(meta) {
  const pool = poolOf(meta), key = meta.fmt + ":" + MODE_KEYS.map(m => (pool[m] || []).length).join(",");
  if (cache[key]) return cache[key];
  const bans = [], picks = [], sides = [];
  for (const m of MODE_KEYS) {
    const plan = modePlan(meta.fmt, m, (pool[m] || []).length);
    if (!plan) continue;
    for (let k = 0; k < plan.bans; k++) bans.push({ type: "ban", team: k % 2 === 0 ? plan.firstBan : 3 - plan.firstBan, mode: m });
    for (const [team, slot, sideTeam] of plan.picks) { picks.push({ type: "pick", team, mode: m, slot }); sides.push({ type: "side", team: sideTeam, mode: m, slot }); }
    if (plan.decider) { const [slot, sideTeam] = plan.decider; picks.push({ type: "decider", mode: m, slot }); sides.push({ type: "side", team: sideTeam, mode: m, slot }); }
  }
  picks.sort((a, b) => a.slot - b.slot); sides.sort((a, b) => a.slot - b.slot);
  return (cache[key] = [...bans, ...picks, ...sides]);
}

export const mapSlug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const openMaps = (S, m) => (S.pool?.[m] || MODES[m].maps).filter(x => S.status[m][x]?.st === "open");
const clone = o => JSON.parse(JSON.stringify(o));

export function newState(meta) {
  const pool = clone(poolOf(meta));
  const S = { i: 0, pool, status: {}, slots: {}, log: [] };
  for (const m of MODE_KEYS) { S.status[m] = {}; (pool[m] || []).forEach(x => (S.status[m][x] = { st: "open" })); }
  FORMATS[meta.fmt].order.forEach((m, k) => (S.slots[k + 1] = { mode: m }));
  autoResolve(S, meta);
  return S;
}

function autoResolve(S, meta) {
  const L = steps(meta);
  while (L[S.i] && L[S.i].type === "decider") {
    const st = L[S.i], map = openMaps(S, st.mode)[0];
    S.status[st.mode][map] = { st: "decider", slot: st.slot };
    Object.assign(S.slots[st.slot], { map, by: 0 });
    S.log.push({ type: "decider", mode: st.mode, map, slot: st.slot });
    S.i++;
  }
}

export const currentStep = (S, meta) => steps(meta)[S.i] || null;

// act: {kind:"map", map} or {kind:"side", idx:0|1}. Returns the next state, or null if the move is not allowed.
export function apply(S0, meta, act) {
  const S = clone(S0), st = steps(meta)[S.i];
  if (!st || !act) return null;
  if (act.kind === "map" && (st.type === "ban" || st.type === "pick")) {
    if (!Object.prototype.hasOwnProperty.call(S.status[st.mode], act.map) || S.status[st.mode][act.map].st !== "open") return null;
    if (st.type === "ban") S.status[st.mode][act.map] = { st: "ban", by: st.team };
    else { S.status[st.mode][act.map] = { st: "pick", by: st.team, slot: st.slot }; Object.assign(S.slots[st.slot], { map: act.map, by: st.team }); }
    S.log.push({ type: st.type, team: st.team, mode: st.mode, map: act.map, slot: st.slot });
  } else if (act.kind === "side" && st.type === "side" && (act.idx === 0 || act.idx === 1)) {
    Object.assign(S.slots[st.slot], { sideTeam: st.team, side: act.idx });
    S.log.push({ type: "side", team: st.team, mode: st.mode, slot: st.slot, side: act.idx });
  } else return null;
  S.i++;
  autoResolve(S, meta);
  return S;
}

export function randomAct(S, meta) {
  const st = steps(meta)[S.i];
  if (!st) return null;
  if (st.type === "side") return { kind: "side", idx: Math.random() < 0.5 ? 0 : 1 };
  const o = openMaps(S, st.mode);
  return { kind: "map", map: o[Math.floor(Math.random() * o.length)] };
}

export function cleanMapName(n) {
  if (typeof n !== "string") return "";
  const s = n.replace(/\s+/g, " ").trim().slice(0, 24);
  return /^(__proto__|constructor|prototype)$/i.test(s) ? "" : s;
}

export function cleanPool(p) {
  const out = {};
  for (const m of MODE_KEYS) {
    if (!Array.isArray(p?.[m])) { out[m] = [...MODES[m].maps]; continue; }
    const seen = new Set(), list = [];
    for (const raw of p[m]) {
      const n = cleanMapName(raw), k = n.toLowerCase();
      if (n && !seen.has(k) && list.length < MAX_MAPS) { seen.add(k); list.push(n); }
    }
    out[m] = list;
  }
  return out;
}

export function cleanMeta(m) {
  const str = (v, n, d) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : d);
  const fmt = FORMATS[m?.fmt] ? m.fmt : "bo5";
  return {
    fmt,
    adv: m?.adv === 2 ? 2 : 1,
    timer: m?.timer === true,
    t1: { name: str(m?.t1?.name, 24, "Team 1"), tag: str(m?.t1?.tag, 5, "T1").toUpperCase() },
    t2: { name: str(m?.t2?.name, 24, "Team 2"), tag: str(m?.t2?.tag, 5, "T2").toUpperCase() },
    pool: cleanPool(m?.pool)
  };
}

export const TURN_MS = 30000;
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const isCode = c => typeof c === "string" && /^[A-Z0-9]{6}$/.test(c);
