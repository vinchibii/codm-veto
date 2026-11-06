import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const env = (...names) => names.map(n => process.env[n]).find(Boolean) || "";

export const SUPABASE_URL = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_PUBLIC_KEY = env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVER_KEY = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");

let admin = null;
export function db() {
  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) return null;
  return (admin ||= createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
}

export const hash = s => createHash("sha256").update(String(s)).digest("hex");
export const newKey = () => randomBytes(18).toString("base64url");

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export const NOT_CONFIGURED = "The server isn't connected to Supabase yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Vercel project settings, then redeploy";
