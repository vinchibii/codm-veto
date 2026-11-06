import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Draft, TeamDot } from "@/components/draft.jsx";
import { useRoom } from "@/lib/hooks.js";
import { store, fmtCode, inviteLink, copy, go, rememberRoom } from "@/lib/client.js";
import { currentStep } from "@/lib/veto-engine.js";

function Centered({ children }) {
  return <div className="mx-auto flex w-full max-w-md flex-col gap-4 py-10 sm:py-16">{children}</div>;
}

function InviteCode({ code }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Room code</p>
        <p className="font-mono text-lg font-medium tracking-[0.2em]">{fmtCode(code)}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => copy(inviteLink(code), "Invite link copied")}><Copy />Copy link</Button>
    </div>
  );
}

// Step 1 for anyone arriving with a code: pick a free team.
function ChooseTeam({ code, data, pending, onClaim, onWatch }) {
  const [name, setName] = useState(store.get("name") || "");
  const open = [1, 2].filter(t => !data.seats["t" + t]);
  const [team, setTeam] = useState(open.length === 1 ? open[0] : 0);
  useEffect(() => { if (team && data.seats["t" + team]) setTeam(open.length === 1 ? open[0] : 0); }, [data.seats]); // seat got taken meanwhile
  const meta = data.meta;

  return (
    <Centered>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Join room <span className="font-mono font-medium tracking-[0.15em] text-muted-foreground">{fmtCode(code)}</span></CardTitle>
          <CardDescription>Choose the team you're captaining</CardDescription>
        </CardHeader>
        <form onSubmit={e => { e.preventDefault(); if (team && name.trim()) onClaim(team, name.trim()); }}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="cname">Your name</Label>
              <Input id="cname" value={name} maxLength={20} placeholder="In-game name" onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2" role="radiogroup" aria-label="Your team">
              <Label>Your team</Label>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2].map(t => {
                  const seat = data.seats["t" + t], chosen = team === t;
                  return (
                    <button key={t} type="button" role="radio" aria-checked={chosen} disabled={!!seat} onClick={() => setTeam(t)}
                      className={cn("flex flex-col items-start gap-1 rounded-lg border p-3 text-left shadow-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                        chosen && "border-primary ring-1 ring-primary")}>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground"><TeamDot team={t} />Team {t}</span>
                      <span className="w-full truncate text-sm font-medium">{meta["t" + t].name}</span>
                      <span className="text-xs text-muted-foreground">{seat ? "Taken" : "Open"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full" disabled={pending || !team || !name.trim()}>
              {team ? `Join as ${meta["t" + team].name} captain` : "Choose a team"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onWatch}>Just watch</Button>
          </CardFooter>
        </form>
      </Card>
    </Centered>
  );
}

// Step 2: wait for the other captain, then both tap ready. No match details here, only who's in.
function Waiting({ code, data, myTeam, isHost, pending, onReady, onStart, onLeaveSeat, onLeave, onTakeSeat }) {
  const meta = data.meta, seats = data.seats, other = myTeam ? 3 - myTeam : 0;
  const me = myTeam ? seats["t" + myTeam] : null, them = other ? seats["t" + other] : null;
  const openSeat = !seats.t1 || !seats.t2;
  let title, desc;
  if (myTeam && !them) { title = "Waiting for the other captain"; desc = `Send the code to ${meta["t" + other].name}'s captain. The draft starts when you're both ready.`; }
  else if (myTeam && !me.ready) { title = them.ready ? `${them.name} is ready` : `${them.name} is here`; desc = them.ready ? "Tap I'm ready to start the draft." : "Tap I'm ready when you're set."; }
  else if (myTeam && !them.ready) { title = `Waiting for ${them.name}`; desc = "The draft starts as soon as they're ready."; }
  else if (myTeam) { title = "Starting the draft"; desc = "Both captains are ready."; }
  else { title = openSeat ? "Waiting for captains" : "Waiting for both captains to be ready"; desc = "The draft opens here once both captains are ready."; }
  const allReady = seats.t1?.ready && seats.t2?.ready;

  return (
    <Centered>
      <Card>
        <CardHeader className="items-center space-y-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            {allReady ? <Check className="size-5" /> : <Loader2 className="size-5 animate-spin text-muted-foreground" />}
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{desc}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map(t => {
            const seat = seats["t" + t], mine = t === myTeam;
            return (
              <div key={t} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3", mine && "bg-muted/50")}>
                <div className="flex min-w-0 items-center gap-3">
                  <TeamDot team={t} className="size-2.5" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{meta["t" + t].name}</p>
                    <p className="truncate text-xs text-muted-foreground">{seat ? `${seat.name}${mine ? " (you)" : ""}` : "No captain yet"}</p>
                  </div>
                </div>
                <Badge variant={seat?.ready ? "default" : "outline"} className="shrink-0 font-medium">{!seat ? "Open" : seat.ready ? "Ready" : "Not ready"}</Badge>
              </div>
            );
          })}
          {openSeat && (myTeam || isHost) && <InviteCode code={code} />}
        </CardContent>
        <CardFooter className="flex-col gap-2">
          {myTeam > 0 && (
            <Button className="w-full" variant={me.ready ? "outline" : "default"} disabled={pending} onClick={() => onReady(!me.ready)}>
              {me.ready ? "Not ready yet" : "I'm ready"}
            </Button>
          )}
          {isHost && !myTeam && openSeat && <Button className="w-full" variant="outline" onClick={onTakeSeat}>Captain a team</Button>}
          {isHost && <Button className="w-full" variant={myTeam ? "ghost" : "outline"} disabled={pending} onClick={onStart}>Start the draft now</Button>}
          <div className="flex gap-1">
            {myTeam > 0 && <Button variant="ghost" size="sm" disabled={pending} onClick={onLeaveSeat}>Change team</Button>}
            <Button variant="ghost" size="sm" onClick={onLeave}>Leave room</Button>
          </div>
        </CardFooter>
      </Card>
    </Centered>
  );
}

export function Room({ code, server }) {
  const { room, missing, pending, post, mine, setMine } = useRoom(code, server);
  const [watching, setWatching] = useState(false);
  const [override, setOverride] = useState(false);
  const data = room?.data;
  const started = data ? data.started !== false : false;
  const holds = t => !!(data && mine["k" + t] && data.seats["t" + t] && data.seats["t" + t].at === mine["k" + t + "At"]);
  const myTeam = [1, 2].find(holds) || 0;
  const isHost = !!mine.hostKey;

  // Keep the address in step: #CODE before the draft, #CODE/draft during it.
  useEffect(() => {
    if (!data) return;
    const want = `#${code}${started ? "/draft" : ""}`;
    if (location.hash !== want) { try { history.replaceState(null, "", want); } catch {} }
    if (started) scrollTo(0, 0);
  }, [started, !!data, code]);
  useEffect(() => {
    if (data) rememberRoom({ code, t1: data.meta.t1.name, t2: data.meta.t2.name, fmt: data.meta.fmt });
  }, [code, !!data]);

  const claim = async (team, name) => {
    store.set("name", name);
    const r = await post({ op: "claim", team, name });
    if (r?.seatKey) { setMine(m => ({ ...m, ["k" + team]: r.seatKey, ["k" + team + "At"]: r.data.seats["t" + team].at })); setWatching(false); }
  };
  const leaveSeat = async () => {
    const r = await post({ op: "free", team: myTeam, key: mine["k" + myTeam] });
    if (r) setMine(m => { const n = { ...m }; delete n["k" + myTeam]; delete n["k" + myTeam + "At"]; return n; });
  };
  const onTimeout = useCallback(i => {
    setTimeout(() => post({ op: "timeout", i }).catch(() => {}), Math.random() * 1200);
  }, [post]);

  if (missing) return (
    <Centered>
      <Card>
        <CardHeader><CardTitle>No room uses {fmtCode(code)}</CardTitle><CardDescription>Check the code with the other captain, or create a new room.</CardDescription></CardHeader>
        <CardFooter className="gap-2"><Button asChild><a href="#">Back to home</a></Button><Button variant="outline" asChild><a href="#new">Create a room</a></Button></CardFooter>
      </Card>
    </Centered>
  );
  if (!data) return <Centered><p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading room {fmtCode(code)}</p></Centered>;

  const leave = () => go("");

  if (started) {
    const step = currentStep(data.state, data.meta)?.team || 0;
    const myTeams = isHost && override ? [1, 2] : [1, 2].filter(holds);
    const act = a => {
      const seat = step && holds(step);
      return post({ op: "act", i: data.state.i, act: a, key: seat ? mine["k" + step] : mine.hostKey, asHost: !seat });
    };
    return (
      <Draft meta={data.meta} state={data.state} seats={data.seats} myTeams={myTeams} pending={pending}
        onAct={act} onTimeout={onTimeout} turnAt={data.turnAt} code={code} onLeave={leave} leaveLabel="Leave room"
        host={isHost ? {
          canUndo: (data.history || []).length > 0,
          onUndo: () => post({ op: "undo", key: mine.hostKey }),
          onRestart: () => post({ op: "restart", key: mine.hostKey }),
          override, setOverride
        } : null} />
    );
  }

  const seatsFull = !!(data.seats.t1 && data.seats.t2);
  if (!myTeam && !seatsFull && (watching === "seat" || (!isHost && !watching)))
    return <ChooseTeam code={code} data={data} pending={pending} onClaim={claim} onWatch={() => setWatching(true)} />;

  return (
    <Waiting code={code} data={data} myTeam={myTeam} isHost={isHost} pending={pending}
      onReady={ready => post({ op: "ready", team: myTeam, key: mine["k" + myTeam], ready })}
      onStart={() => post({ op: "start", key: mine.hostKey })}
      onLeaveSeat={leaveSeat} onLeave={leave}
      onTakeSeat={() => setWatching("seat")} />
  );
}

