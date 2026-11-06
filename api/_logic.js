// Pure room logic: no network, no database. The route handlers load a room, call runOp, and save the result.
import { FORMATS, newState, apply, currentStep, randomAct, cleanMeta, poolProblems, TURN_MS } from "../src/lib/veto-engine.js";

// Returns {data} or {error} when the map pool can't support the chosen format.
export function createRoomData(meta, now) {
  const m = cleanMeta(meta);
  const problems = poolProblems(m);
  if (problems.length) return { error: problems[0].message };
  return { data: { meta: m, state: newState(m), history: [], seats: { t1: null, t2: null }, started: false, turnAt: now, createdAt: now } };
}

const fail = (status, error) => ({ status, reply: { error } });
const cleanName = n => (typeof n === "string" && n.trim() ? n.trim().slice(0, 20) : "Captain");

// data: public room data. keys: {host_hash, t1_hash, t2_hash}. hash: string -> hex digest.
// newKey: () -> fresh random secret. Returns {status, reply, data?, keys?}.
export function runOp(data, keys, body, now, hash, newKey) {
  const op = body?.op;
  const meta = data.meta;
  const isHost = typeof body?.key === "string" && hash(body.key) === keys.host_hash;
  const holds = t => typeof body?.key === "string" && keys[`t${t}_hash`] && hash(body.key) === keys[`t${t}_hash`];

  if (op === "claim") {
    const t = body.team === 2 ? 2 : body.team === 1 ? 1 : 0;
    if (!t) return fail(400, "Pick Team 1 or Team 2");
    if (data.seats[`t${t}`]) return fail(409, "That captain seat is already taken");
    const seatKey = newKey();
    const next = { ...data, seats: { ...data.seats, [`t${t}`]: { name: cleanName(body.name), at: now, ready: false } } };
    return { status: 200, reply: { seatKey, team: t }, data: next, keys: { [`t${t}_hash`]: hash(seatKey) } };
  }

  if (op === "free") {
    const t = body.team === 2 ? 2 : body.team === 1 ? 1 : 0;
    if (!t) return fail(400, "Pick Team 1 or Team 2");
    if (!holds(t) && !isHost) return fail(403, "Only that captain or the host can free this seat");
    if (data.started && !isHost) return fail(409, "The veto has started, so only the host can free a seat");
    const next = { ...data, seats: { ...data.seats, [`t${t}`]: null } };
    return { status: 200, reply: { ok: true }, data: next, keys: { [`t${t}_hash`]: null } };
  }

  // Lobby: a captain marks their team ready. The draft opens when both seats are taken and ready.
  if (op === "ready") {
    const t = body.team === 2 ? 2 : body.team === 1 ? 1 : 0;
    if (!t || !holds(t)) return fail(403, "Only that team's captain can change ready");
    if (data.started) return fail(409, "The veto has already started");
    const seats = { ...data.seats, [`t${t}`]: { ...data.seats[`t${t}`], ready: body.ready !== false } };
    const go = !!(seats.t1?.ready && seats.t2?.ready);
    return { status: 200, reply: { ok: true, started: go }, data: { ...data, seats, started: go, turnAt: go ? now : data.turnAt } };
  }

  // Host opens the draft without waiting for ready.
  if (op === "start") {
    if (!isHost) return fail(403, "Only the host can start the veto");
    if (data.started) return fail(409, "The veto has already started");
    return { status: 200, reply: { ok: true, started: true }, data: { ...data, started: true, turnAt: now } };
  }

  if (op === "act" || op === "timeout") {
    if (data.started === false) return fail(409, "The veto hasn't started yet. Both captains need to be ready");
    const st = currentStep(data.state, meta);
    if (!st) return fail(409, "The veto is already complete");
    if (body.i !== data.state.i) return fail(409, "The veto moved on before your move arrived");
    let act = body.act;
    if (op === "act") {
      const allowed = holds(st.team) || (isHost && body.asHost === true);
      if (!allowed) return fail(403, "It isn't your turn");
    } else {
      if (!data.meta.timer) return fail(400, "This room has no turn timer");
      if (now < data.turnAt + TURN_MS) return fail(409, "The turn timer hasn't run out yet");
      act = randomAct(data.state, meta);
    }
    const state = apply(data.state, meta, act);
    if (!state) return fail(400, "That move isn't allowed at this step");
    const next = { ...data, state, history: [...data.history, data.state].slice(-30), turnAt: now };
    return { status: 200, reply: { ok: true }, data: next };
  }

  if (op === "undo") {
    if (!isHost) return fail(403, "Only the host can undo");
    if (!data.history.length) return fail(409, "Nothing to undo");
    const next = { ...data, state: data.history[data.history.length - 1], history: data.history.slice(0, -1), turnAt: now };
    return { status: 200, reply: { ok: true }, data: next };
  }

  if (op === "restart") {
    if (!isHost) return fail(403, "Only the host can restart the veto");
    return { status: 200, reply: { ok: true }, data: { ...data, state: newState(meta), history: [], turnAt: now } };
  }

  if (op === "whoami") {
    return { status: 200, reply: { host: isHost, t1: !!holds(1), t2: !!holds(2) } };
  }

  return fail(400, "Unknown request");
}

export { FORMATS };
