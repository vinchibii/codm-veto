import { db, send, body, hash, newKey, NOT_CONFIGURED } from "../_lib.js";
import { runOp } from "../_logic.js";
import { isCode } from "../../src/lib/veto-engine.js";

// GET  /api/rooms/K7QM4X           -> {rev, data}
// POST /api/rooms/K7QM4X  {op,...} -> claim | free | act | timeout | undo | restart | whoami
export default async function handler(req, res) {
  const code = String(req.query.code || "").toUpperCase();
  if (!isCode(code)) return send(res, 400, { error: "Room codes are 6 letters and numbers" });
  const sb = db();
  if (!sb) return send(res, 500, { error: NOT_CONFIGURED });

  const { data: row, error } = await sb.from("rooms").select("rev,data").eq("code", code).maybeSingle();
  if (error) return send(res, 500, { error: "Couldn't load the room. Try again" });
  if (!row) return send(res, 404, { error: "No room uses that code. Check it with your admin" });

  if (req.method === "GET") return send(res, 200, row);
  if (req.method !== "POST") return send(res, 405, { error: "Use GET or POST" });

  const { data: keys, error: kerr } = await sb.from("room_keys").select("host_hash,t1_hash,t2_hash").eq("code", code).maybeSingle();
  if (kerr || !keys) return send(res, 500, { error: "Couldn't load the room. Try again" });

  const out = runOp(row.data, keys, body(req), Date.now(), hash, newKey);
  if (!out.data) return send(res, out.status, out.reply);

  // Save only if nobody else changed the room since we read it.
  const { data: saved, error: uerr } = await sb.from("rooms")
    .update({ data: out.data, rev: row.rev + 1, updated_at: new Date().toISOString() })
    .eq("code", code).eq("rev", row.rev).select("rev");
  if (uerr) return send(res, 500, { error: "Your move didn't save. Try again" });
  if (!saved?.length) return send(res, 409, { error: "Someone else acted at the same moment. Check the board and try again" });

  if (out.keys) {
    const { error: e2 } = await sb.from("room_keys").update(out.keys).eq("code", code);
    if (e2) return send(res, 500, { error: "The seat didn't save. Ask the host to free it and try again" });
  }
  return send(res, out.status, { ...out.reply, rev: row.rev + 1, data: out.data });
}
