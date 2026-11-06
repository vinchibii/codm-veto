import { db, send, body, hash, newKey, NOT_CONFIGURED } from "../_lib.js";
import { createRoomData } from "../_logic.js";
import { CODE_ALPHABET } from "../../src/lib/veto-engine.js";

const genCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

// Turn a Supabase error into a message that says what to fix.
function explain(error) {
  const code = error?.code || "", msg = error?.message || "";
  if (code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg))
    return "The rooms table doesn't exist yet. In Supabase, open SQL Editor, paste supabase/schema.sql and click Run";
  if (code === "42501" || /row-level security|permission denied/i.test(msg))
    return "Supabase refused the save. In Vercel, SUPABASE_SERVICE_ROLE_KEY must be the secret (service_role) key, not the publishable (anon) key. Fix it, then redeploy";
  if (/invalid api key|jwt|apikey/i.test(msg) || code === "PGRST301")
    return "Supabase rejected the key. Copy SUPABASE_SERVICE_ROLE_KEY again from Supabase, paste it into Vercel with no spaces, then redeploy";
  if (/fetch failed|ENOTFOUND|getaddrinfo/i.test(msg))
    return "The server can't reach Supabase. Check SUPABASE_URL in Vercel, it should look like https://abcd1234.supabase.co";
  return `The room couldn't be saved. Supabase said: ${msg || code || "no details"}`;
}

// POST /api/rooms  {meta}  ->  {code, hostKey, rev, data}
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST to create a room" });
  const sb = db();
  if (!sb) return send(res, 500, { error: NOT_CONFIGURED });

  const made = createRoomData(body(req).meta, Date.now());
  if (made.error) return send(res, 400, { error: made.error });
  const data = made.data, hostKey = newKey();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const { error } = await sb.from("rooms").insert({ code, rev: 1, data });
    if (error) {
      if (error.code === "23505") continue; // code already used, try another
      console.error("create room: rooms insert failed", error);
      return send(res, 500, { error: explain(error) });
    }
    const { error: kerr } = await sb.from("room_keys").insert({ code, host_hash: hash(hostKey) });
    if (kerr) {
      console.error("create room: room_keys insert failed", kerr);
      await sb.from("rooms").delete().eq("code", code);
      return send(res, 500, { error: explain(kerr) });
    }
    return send(res, 201, { code, hostKey, rev: 1, data });
  }
  return send(res, 503, { error: "Couldn't find a free room code. Try again" });
}
