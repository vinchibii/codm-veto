import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, RotateCcw, Timer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MODES, MODE_KEYS, FORMATS, PHASE, steps, currentStep, openMaps, mapSlug, TURN_MS } from "@/lib/veto-engine.js";
import { PREVIEW, copy, fmtCode } from "@/lib/client.js";

export function TeamDot({ team, className }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", team === 1 ? "bg-team1" : "bg-team2", className)} />;
}

// Looks for public/images/maps/<map-name>.jpg, then .png, then .webp. No image found: a plain card.
const IMAGE_TYPES = ["jpg", "png", "webp"];

function MapTile({ name, status, tag, can, selected, onSelect, finished }) {
  const [ext, setExt] = useState(PREVIEW ? -1 : 0);
  const img = ext >= 0 && ext < IMAGE_TYPES.length;
  const st = status.st;
  return (
    <button
      type="button"
      disabled={!can}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-colors disabled:cursor-default",
        can && "hover:bg-accent",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        st === "pick" && (status.by === 1 ? "border-team1" : "border-team2"),
        st === "decider" && "border-foreground/40",
        (st === "ban" || (finished && st === "open")) && "opacity-50"
      )}
    >
      {img && (
        <div className="aspect-video w-full bg-muted">
          <img src={`images/maps/${mapSlug(name)}.${IMAGE_TYPES[ext]}`} alt="" loading="lazy" onError={() => setExt(e => e + 1)} className={cn("h-full w-full object-cover", st === "ban" && "grayscale")} />
        </div>
      )}
      <div className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2">
        <span className={cn("truncate text-sm font-medium", st === "ban" && "line-through decoration-muted-foreground")}>{name}</span>
        {st === "ban" && <Badge variant="outline" className="shrink-0 font-normal"><TeamDot team={status.by} />{tag(status.by)}</Badge>}
        {st === "pick" && <Badge variant="secondary" className="shrink-0 font-medium"><TeamDot team={status.by} />Map {status.slot}</Badge>}
        {st === "decider" && <Badge variant="secondary" className="shrink-0 font-medium">Map {status.slot}</Badge>}
      </div>
    </button>
  );
}

// Shared by practice and live rooms.
// myTeams: teams this viewer may act for. onAct(act) / onTimeout(i). host: {canUndo,onUndo,onRestart,override,setOverride} or null.
export function Draft({ meta, state, seats, myTeams, pending, onAct, onTimeout, turnAt, host, code, onLeave, leaveLabel = "Leave" }) {
  const [selected, setSelected] = useState(null);
  const [left, setLeft] = useState(30);
  const fired = useRef(-1);
  const F = FORMATS[meta.fmt], L = steps(meta), st = currentStep(state, meta);
  const vis = L.map((s, k) => ({ s, k })).filter(o => o.s.type !== "decider");
  const done = vis.filter(o => o.k < state.i).length;
  const team = t => meta["t" + t];
  const canAct = !!st && !pending && myTeams.includes(st.team);

  useEffect(() => { setSelected(null); }, [state.i]);
  useEffect(() => {
    if (!meta.timer || !st) return;
    const tick = () => {
      const l = Math.max(0, Math.ceil((turnAt + TURN_MS - Date.now()) / 1000));
      setLeft(l);
      if (l === 0 && fired.current !== state.i) { fired.current = state.i; onTimeout?.(state.i); }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [meta.timer, st, turnAt, state.i, onTimeout]);

  const sideText = slot => {
    const s = state.slots[slot];
    if (s.side == null) return null;
    const sides = MODES[s.mode].sides;
    return { a: s.sideTeam, aSide: sides[s.side], b: 3 - s.sideTeam, bSide: sides[1 - s.side] };
  };
  const summary = () => {
    const lines = [`${team(1).name} vs ${team(2).name}, ${F.label}`];
    if (meta.fmt === "gf") lines.push(`${team(meta.adv).name} starts 1-0`);
    const bans = state.log.filter(e => e.type === "ban").map(e => `${team(e.team).tag} ${e.map}`);
    if (bans.length) lines.push(`Bans: ${bans.join(", ")}`);
    F.order.forEach((m, k) => {
      const s = state.slots[k + 1], sd = sideText(k + 1);
      lines.push(`Map ${k + 1}  ${MODES[m].short}  ${s.map} (${s.by ? team(s.by).tag + " pick" : "decider"})  ${team(sd.a).tag} ${sd.aSide} / ${team(sd.b).tag} ${sd.bSide}`);
    });
    return lines.join("\n");
  };

  let title, sub;
  if (!st) { title = "Draft complete"; sub = "Map order and starting sides are locked"; }
  else if (st.type === "side") { const s = state.slots[st.slot]; title = `${team(st.team).name} chooses a starting side`; sub = `Map ${st.slot} · ${s.map} · ${MODES[s.mode].name}`; }
  else if (st.type === "ban") { title = `${team(st.team).name} bans a ${MODES[st.mode].name} map`; sub = `${openMaps(state, st.mode).length} maps left in the pool`; }
  else { title = `${team(st.team).name} picks Map ${st.slot}`; sub = `${MODES[st.mode].name}. Starting sides are chosen after every map is picked`; }
  const waitingFor = st && !canAct ? (seats?.["t" + st.team]?.name || `${team(st.team).name}'s captain`) : null;
  const liveMode = st && (st.type === "ban" || st.type === "pick") ? st.mode : null;
  const finished = !st || st.type === "side";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{F.label}{code ? ` · Room ${fmtCode(code)}` : ""}{meta.fmt === "gf" ? ` · ${team(meta.adv).name} starts 1–0` : ""}</p>
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight">
            <span className="flex items-center gap-2"><TeamDot team={1} />{team(1).name}</span>
            <span className="text-base font-normal text-muted-foreground">vs</span>
            <span className="flex items-center gap-2"><TeamDot team={2} />{team(2).name}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {host?.setOverride && (
            <div className="mr-2 flex items-center gap-2">
              <Switch id="override" checked={host.override} onCheckedChange={host.setOverride} />
              <Label htmlFor="override" className="text-sm font-normal text-muted-foreground">Act for both teams</Label>
            </div>
          )}
          {host && <Button variant="ghost" size="sm" onClick={host.onUndo} disabled={!host.canUndo || pending}><Undo2 />Undo</Button>}
          {host && <Button variant="ghost" size="sm" onClick={host.onRestart} disabled={pending}><RotateCcw />Restart</Button>}
          <Button variant="outline" size="sm" onClick={onLeave}>{leaveLabel}</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-4">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{st ? `${PHASE[st.type]} · Step ${done + 1} of ${vis.length}` : `${vis.length} of ${vis.length} steps`}</p>
            <CardTitle className="flex items-center gap-2 text-xl">{st && <TeamDot team={st.team} className="size-2.5" />}{title}</CardTitle>
            <CardDescription>{sub}</CardDescription>
          </div>
          {meta.timer && st && (
            <Badge variant="outline" className={cn("h-8 gap-1.5 px-3 font-mono text-sm font-medium tabular", left <= 10 && "border-destructive text-destructive")}><Timer className="size-3.5" />{left}s</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(done / vis.length) * 100} className="h-1.5" />
          {st && waitingFor && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{pending ? "Saving…" : `Waiting for ${waitingFor}`}</p>
          )}
          {st && canAct && st.type !== "side" && (
            <Button onClick={() => selected && onAct({ kind: "map", map: selected })} disabled={!selected}>
              {selected ? `${st.type === "ban" ? "Ban" : "Pick"} ${selected}` : "Select a map below"}
            </Button>
          )}
          {st && canAct && st.type === "side" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {MODES[state.slots[st.slot].mode].sides.map((x, k, sides) => (
                <Button key={x} variant="outline" className="h-auto flex-col items-start gap-0.5 py-3" onClick={() => onAct({ kind: "side", idx: k })}>
                  <span className="text-base">{x}</span>
                  <span className="text-xs font-normal text-muted-foreground">{team(3 - st.team).tag} gets {sides[1 - k]}</span>
                </Button>
              ))}
            </div>
          )}
          {!st && (
            <div className="space-y-3">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{summary()}</pre>
              <Button variant="outline" onClick={() => copy(summary(), "Copied for Discord")}><Copy />Copy for Discord</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          {MODE_KEYS.filter(m => F.order.includes(m)).map(m => {
            const isLive = liveMode === m, pool = state.pool?.[m] || MODES[m].maps;
            return (
              <section key={m} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">{MODES[m].name} <span className="font-normal text-muted-foreground">· {MODES[m].rule}</span></h2>
                  <span className={cn("text-xs text-muted-foreground", isLive && "text-foreground")}>
                    {isLive ? `${team(st.team).name} is ${st.type === "ban" ? "banning" : "picking"}` : finished ? "Locked" : `${openMaps(state, m).length} open`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  {pool.map(x => (
                    <MapTile key={x} name={x} status={state.status[m][x]} tag={t => team(t).tag} finished={finished}
                      can={isLive && canAct && state.status[m][x].st === "open"} selected={isLive && selected === x}
                      onSelect={() => setSelected(s => (s === x ? null : x))} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Match sheet</CardTitle>
              <CardDescription>{Object.values(state.slots).filter(s => s.map).length} of {F.order.length} maps set</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ol className="divide-y border-t">
                {F.order.map((m, k) => {
                  const n = k + 1, s = state.slots[n], sd = sideText(n);
                  return (
                    <li key={n} className="flex gap-3 px-6 py-3">
                      <span className="w-4 pt-0.5 text-xs text-muted-foreground tabular">{n}</span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs text-muted-foreground">{MODES[m].name}</p>
                        <p className={cn("text-sm font-medium", !s.map && "font-normal text-muted-foreground")}>{s.map || "To be decided"}</p>
                        {s.map && (
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {s.by ? <span className="flex items-center gap-1"><TeamDot team={s.by} />{team(s.by).tag} pick</span> : <span>Decider</span>}
                            <span>·</span>
                            {sd ? <span>{team(sd.a).tag} {sd.aSide}, {team(sd.b).tag} {sd.bSide}</span> : <span>Side after picks</span>}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Log</CardTitle></CardHeader>
            <CardContent>
              {state.log.length ? (
                <ol className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
                  {[...state.log].reverse().map((e, k) => {
                    const M = MODES[e.mode];
                    const text = e.type === "ban" ? `${team(e.team).name} banned ${e.map}`
                      : e.type === "pick" ? `${team(e.team).name} picked ${e.map} for Map ${e.slot}`
                      : e.type === "decider" ? `${e.map} is the last ${M.short} map, so it's Map ${e.slot}`
                      : `${team(e.team).name} starts Map ${e.slot} on ${M.sides[e.side]}`;
                    return <li key={k} className="flex gap-2 text-muted-foreground"><span className="w-5 shrink-0 text-xs tabular">{state.log.length - k}</span><span>{text}</span></li>;
                  })}
                </ol>
              ) : <p className="text-sm text-muted-foreground">No moves yet</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
