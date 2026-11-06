import { send, SUPABASE_URL, SUPABASE_PUBLIC_KEY, db } from "./_lib.js";

// Public values only. The browser uses them to listen for live room updates.
export default function handler(req, res) {
  send(res, 200, {
    rooms: !!db(),
    realtime: SUPABASE_URL && SUPABASE_PUBLIC_KEY ? { url: SUPABASE_URL, key: SUPABASE_PUBLIC_KEY } : null
  });
}
