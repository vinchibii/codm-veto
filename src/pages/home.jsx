import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, cleanCode, fmtCode, isCode, go, recentRooms, forgetRoom, ago, formatLabel, PREVIEW } from "@/lib/client.js";

export function Home({ server }) {
  const [code, setCode] = useState(() => { const c = cleanCode(location.hash.slice(1)); return isCode(c) ? c : ""; });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState(recentRooms);

  async function join(e) {
    e.preventDefault(); setError("");
    const c = cleanCode(code);
    if (!isCode(c)) return setError("Room codes are 6 letters and numbers, like K7QM4X");
    if (!server.rooms) return setError(PREVIEW ? "Joining works on the deployed site. This preview runs practice drafts only" : "Rooms aren't connected on this server yet");
    setBusy(true);
    try { await api(`/api/rooms/${c}`); go(c); }
    catch (err) { setError(err.status === 404 ? `No room uses ${fmtCode(c)}. Check the code and try again` : err.message); }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10 sm:py-16">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">CODM map veto</h1>
        <p className="text-sm text-muted-foreground">Ban, pick and choose sides for your series. Both captains join with one code.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Join a room</CardTitle>
          <CardDescription>Enter the code the other captain sent you</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={join} className="space-y-3" noValidate>
            <div className="space-y-2">
              <Label htmlFor="code" className="sr-only">Room code</Label>
              <Input id="code" value={code} onChange={e => setCode(cleanCode(e.target.value).slice(0, 6))} placeholder="K7QM4X"
                autoComplete="off" spellCheck={false} autoCapitalize="characters"
                className="h-11 text-center font-mono text-lg tracking-[0.3em] md:text-lg" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !server.checked}>Join<ArrowRight /></Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 text-xs text-muted-foreground"><Separator className="flex-1" />or<Separator className="flex-1" /></div>

      <div className="flex flex-col gap-2">
        <Button variant="outline" asChild><a href="#new">Create a room</a></Button>
        <Button variant="ghost" asChild><a href="#practice">Try a practice draft</a></Button>
      </div>

      {!server.rooms && server.checked && (
        <p className="text-center text-xs text-muted-foreground">
          {PREVIEW ? "This preview runs practice drafts only. Room codes work on the deployed site" : "Rooms aren't connected on this server yet. Practice drafts still work"}
        </p>
      )}

      {rooms.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Recent rooms</p>
          <ul className="divide-y rounded-lg border">
            {rooms.map(r => (
              <li key={r.code} className="flex items-center gap-1 pr-1">
                <a href={`#${r.code}`} className="flex min-w-0 flex-1 flex-col px-3 py-2.5 hover:bg-accent/50">
                  <span className="truncate text-sm font-medium">{r.t1} vs {r.t2}</span>
                  <span className="truncate text-xs text-muted-foreground"><span className="font-mono">{fmtCode(r.code)}</span> · {formatLabel(r.fmt)} · {ago(r.at)}</span>
                </a>
                <Button variant="ghost" size="icon" aria-label={`Remove ${fmtCode(r.code)}`} onClick={() => { forgetRoom(r.code); setRooms(recentRooms()); }}><X /></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
