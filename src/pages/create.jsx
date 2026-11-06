import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TeamDot } from "@/components/draft.jsx";
import { MODES, MODE_KEYS, steps, modePlan, poolProblems, cleanMeta } from "@/lib/veto-engine.js";
import { api, store, go, PREVIEW } from "@/lib/client.js";

// The 2026 maps, each switched on or off. Remembered on this device.
const freshPool = () => Object.fromEntries(MODE_KEYS.map(m => [m, MODES[m].maps.map(name => ({ name, on: true }))]));
function loadPool() {
  const saved = store.get("pool"), out = {};
  for (const m of MODE_KEYS) {
    const off = new Set(Array.isArray(saved?.[m]) ? saved[m].filter(x => x && x.on === false).map(x => x.name) : []);
    out[m] = MODES[m].maps.map(name => ({ name, on: !off.has(name) }));
  }
  return out;
}

export function Create({ server }) {
  const saved = store.get("lastCreate") || {};
  const [t1, setT1] = useState(saved.t1 || { name: "Nightjar", tag: "NJ" });
  const [t2, setT2] = useState(saved.t2 || { name: "Ironclad", tag: "IC" });
  const [fmt, setFmt] = useState(saved.fmt || "bo5");
  const [adv, setAdv] = useState("1");
  const [timer, setTimer] = useState(!!saved.timer);
  const [role, setRole] = useState(saved.role || "1");
  const [name, setName] = useState(store.get("name") || "");
  const [pool, setPoolState] = useState(loadPool);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setPool = fn => setPoolState(p => { const n = fn(p); store.set("pool", n); return n; });
  const meta = useMemo(() => cleanMeta({
    fmt, adv: +adv, timer, t1, t2,
    pool: Object.fromEntries(MODE_KEYS.map(m => [m, pool[m].filter(x => x.on).map(x => x.name)]))
  }), [fmt, adv, timer, t1, t2, pool]);
  const problems = poolProblems(meta);
  const L = steps(meta);
  const isDefault = MODE_KEYS.every(m => pool[m].every(x => x.on));

  async function create() {
    setError("");
    if (problems.length) return setError(problems[0].message);
    if (role !== "host" && !name.trim()) return setError("Type your name so the other captain knows who you are");
    if (!server.rooms) return setError(PREVIEW ? "Rooms work on the deployed site. Use Practice to try the draft here" : "Rooms aren't connected on this server yet. See the README to connect Supabase");
    setBusy(true);
    store.set("lastCreate", { t1: meta.t1, t2: meta.t2, fmt, timer, role });
    try {
      const r = await api("/api/rooms", { method: "POST", body: { meta } });
      const mine = { hostKey: r.hostKey };
      if (role !== "host") {
        store.set("name", name.trim());
        const c = await api(`/api/rooms/${r.code}`, { method: "POST", body: { op: "claim", team: +role, name: name.trim() } });
        mine["k" + role] = c.seatKey; mine["k" + role + "At"] = c.data.seats["t" + role].at;
      }
      store.set(r.code, mine);
      go(r.code);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const counts = { ban: L.filter(s => s.type === "ban").length, pick: L.filter(s => s.type === "pick").length, side: L.filter(s => s.type === "side").length };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create a room</h1>
        <p className="text-sm text-muted-foreground">Set up the match, then send the code to the other captain.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Teams</CardTitle><CardDescription>Team 1 is whichever side the higher seed chooses</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {[[1, t1, setT1], [2, t2, setT2]].map(([n, t, set]) => (
            <div key={n} className="grid grid-cols-[1fr_96px] gap-3">
              <div className="space-y-2">
                <Label htmlFor={`t${n}name`} className="flex items-center gap-2"><TeamDot team={n} />Team {n}</Label>
                <Input id={`t${n}name`} value={t.name} maxLength={24} onChange={e => set({ ...t, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`t${n}tag`}>Tag</Label>
                <Input id={`t${n}tag`} value={t.tag} maxLength={5} onChange={e => set({ ...t, tag: e.target.value.toUpperCase() })} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Match</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={fmt} onValueChange={setFmt}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bo3">Best of 3</SelectItem>
                <SelectItem value="bo5">Best of 5</SelectItem>
                <SelectItem value="bo7">Best of 7</SelectItem>
                <SelectItem value="gf">Grand final, Bo7 with a 1-map advantage</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{counts.ban} bans, then {counts.pick ? `${counts.pick} picks` : "deciders only"}, then {counts.side} side choices</p>
          </div>
          {fmt === "gf" && (
            <div className="space-y-2">
              <Label>Starts 1–0</Label>
              <Select value={adv} onValueChange={setAdv}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{meta.t1.name}</SelectItem>
                  <SelectItem value="2">{meta.t2.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="timer">Turn timer</Label>
              <p className="text-xs text-muted-foreground">30 seconds per turn, random choice when time runs out</p>
            </div>
            <Switch id="timer" checked={timer} onCheckedChange={setTimer} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Map pool</CardTitle>
            <CardDescription>Tap a map to leave it out of this match. Each mode bans until only the maps that get played are left.</CardDescription>
          </div>
          {!isDefault && <Button variant="ghost" size="sm" onClick={() => setPool(() => freshPool())}><RotateCcw />Reset</Button>}
        </CardHeader>
        <CardContent className="space-y-6">
          {MODE_KEYS.map(m => {
            const on = pool[m].filter(x => x.on).length, plan = modePlan(fmt, m, on), prob = problems.find(p => p.mode === m);
            const summary = plan ? [`${on} maps`, `${plan.bans} bans`, plan.picks.length ? `${plan.picks.length} picks` : "", plan.decider ? "1 decider" : ""].filter(Boolean).join(" · ") : `${on} maps · not played`;
            return (
              <div key={m} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{MODES[m].name}</p>
                  <p className="text-xs text-muted-foreground">{summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pool[m].map((x, k) => (
                    <button key={x.name} type="button" aria-pressed={x.on}
                      className={cn("h-8 rounded-md border px-3 text-xs font-medium shadow-sm transition-colors", x.on ? "bg-secondary hover:bg-secondary/80" : "border-dashed bg-background text-muted-foreground line-through hover:bg-accent")}
                      onClick={() => setPool(p => ({ ...p, [m]: p[m].map((y, j) => (j === k ? { ...y, on: !y.on } : y)) }))}>{x.name}</button>
                  ))}
                </div>
                {prob && <p className="text-sm text-destructive">{prob.message}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">You</CardTitle><CardDescription>Captains create rooms too. Pick the team you're playing for</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Your role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Captain of {meta.t1.name}</SelectItem>
                <SelectItem value="2">Captain of {meta.t2.name}</SelectItem>
                <SelectItem value="host">Host only, not playing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role !== "host" && (
            <div className="space-y-2">
              <Label htmlFor="myname">Your name</Label>
              <Input id="myname" value={name} maxLength={20} placeholder="In-game name" onChange={e => setName(e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={create} disabled={busy || problems.length > 0}>Create room</Button>
        <Button variant="ghost" onClick={() => { store.set("practiceMeta", meta); go("practice"); }} disabled={problems.length > 0}>Practice with these settings</Button>
      </div>
    </div>
  );
}
