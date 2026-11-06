import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, store, PREVIEW } from "./client.js";

export function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const f = () => setHash(location.hash.slice(1));
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return hash;
}

// What the server supports: {checked, rooms, realtime:{url,key}|null}
export function useServer() {
  const [server, setServer] = useState({ checked: PREVIEW, rooms: false, realtime: null });
  useEffect(() => {
    if (PREVIEW) return;
    api("/api/config")
      .then(c => setServer({ checked: true, rooms: !!c.rooms, realtime: c.realtime || null }))
      .catch(() => setServer({ checked: true, rooms: false, realtime: null }));
  }, []);
  return server;
}

// Live room state: polls the server and listens to Supabase Realtime when it's available.
export function useRoom(code, server) {
  const [room, setRoom] = useState(null);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState(false);
  const [mine, setMineState] = useState(() => store.get(code) || {});
  const revRef = useRef(0);

  const setMine = useCallback(fn => setMineState(prev => {
    const next = typeof fn === "function" ? fn(prev) : fn;
    store.set(code, next);
    return next;
  }), [code]);

  const accept = useCallback((rev, data) => {
    if (!data || rev < revRef.current) return;
    revRef.current = rev;
    setRoom({ rev, data });
  }, []);

  const refresh = useCallback(async () => {
    try { const r = await api(`/api/rooms/${code}`); accept(r.rev, r.data); setMissing(false); }
    catch (e) { if (e.status === 404) setMissing(true); }
  }, [code, accept]);

  useEffect(() => {
    let stop = false, timer = null, live = false, sb = null, channel = null;
    revRef.current = 0; setRoom(null); setMissing(false); setMineState(store.get(code) || {});
    const loop = async () => {
      await refresh();
      if (!stop) timer = setTimeout(loop, document.hidden ? 15000 : live ? 8000 : 2000);
    };
    loop();
    if (server.realtime) {
      import("@supabase/supabase-js").then(({ createClient }) => {
        if (stop) return;
        sb = createClient(server.realtime.url, server.realtime.key, { auth: { persistSession: false } });
        channel = sb.channel("room-" + code)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code}` }, p => accept(p.new.rev, p.new.data))
          .subscribe(s => { live = s === "SUBSCRIBED"; });
      }).catch(() => {});
    }
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true; clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [code, server.realtime, refresh, accept]);

  const post = useCallback(async body => {
    setPending(true);
    try { const r = await api(`/api/rooms/${code}`, { method: "POST", body }); accept(r.rev, r.data); return r; }
    catch (e) { toast.error(e.message); refresh(); return null; }
    finally { setPending(false); }
  }, [code, accept, refresh]);

  return { room, missing, pending, post, mine, setMine };
}
