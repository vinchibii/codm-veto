import { toast } from "sonner";
import { FORMATS, isCode } from "./veto-engine.js";

export const PREVIEW = import.meta.env.VITE_PREVIEW === "1"; // one-file preview build: practice only, no server

export const store = {
  get: k => { try { return JSON.parse(localStorage.getItem("codm-veto:" + k) || "null"); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem("codm-veto:" + k, JSON.stringify(v)); } catch {} }
};

export async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw { status: r.status, message: j.error || "Something went wrong. Try again" };
  return j;
}

export const cleanCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const fmtCode = c => (c ? `${c.slice(0, 3)} ${c.slice(3)}` : "");
export const inviteLink = code => `${location.origin}${location.pathname}#${code}`;
export { isCode };

export async function copy(text, done = "Copied") {
  try { await navigator.clipboard.writeText(text); toast.success(done); }
  catch { toast.error("Copy didn't work here. Select the text and copy it yourself"); }
}

export function go(hash) {
  if (location.hash.slice(1) === hash) return;
  location.hash = hash;
}

// Rooms opened on this device, newest first
export const recentRooms = () => { const r = store.get("recent"); return Array.isArray(r) ? r : []; };
export function rememberRoom(entry) {
  const list = [{ ...entry, at: Date.now() }, ...recentRooms().filter(r => r.code !== entry.code)].slice(0, 8);
  store.set("recent", list);
}
export function forgetRoom(code) { store.set("recent", recentRooms().filter(r => r.code !== code)); }
export function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
export const formatLabel = fmt => FORMATS[fmt]?.label || "";
