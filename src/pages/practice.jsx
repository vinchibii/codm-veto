import { useCallback, useState } from "react";
import { Draft } from "@/components/draft.jsx";
import { apply, newState, randomAct, cleanMeta, poolProblems } from "@/lib/veto-engine.js";
import { store, go } from "@/lib/client.js";

// One screen, both teams. Uses the settings from Create when you came from there, otherwise the 2026 pool.
export function Practice() {
  const [meta] = useState(() => {
    const m = cleanMeta(store.get("practiceMeta") || { fmt: "bo5", t1: { name: "Nightjar", tag: "NJ" }, t2: { name: "Ironclad", tag: "IC" } });
    return poolProblems(m).length ? cleanMeta({ fmt: "bo5" }) : m;
  });
  const [run, setRun] = useState(() => ({ state: newState(meta), history: [], turnAt: Date.now() }));
  const move = useCallback(pick => setRun(r => {
    const next = apply(r.state, meta, pick(r.state));
    return next ? { state: next, history: [...r.history, r.state], turnAt: Date.now() } : r;
  }), [meta]);
  const step = useCallback(act => move(() => act), [move]);
  const onTimeout = useCallback(() => move(s => randomAct(s, meta)), [move, meta]);
  const { state, history, turnAt } = run;

  return (
    <div className="py-6">
      <Draft meta={meta} state={state} seats={null} myTeams={[1, 2]} pending={false} onAct={step} onTimeout={onTimeout} turnAt={turnAt}
        onLeave={() => { store.set("practiceMeta", null); go(""); }} leaveLabel="End practice"
        host={{
          canUndo: history.length > 0,
          onUndo: () => setRun(r => (r.history.length ? { state: r.history[r.history.length - 1], history: r.history.slice(0, -1), turnAt: Date.now() } : r)),
          onRestart: () => setRun({ state: newState(meta), history: [], turnAt: Date.now() })
        }} />
    </div>
  );
}
