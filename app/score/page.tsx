"use client";

import Link from "next/link";
import { useLive } from "@/components/LiveProvider";
import { Loading, PinGate, StatusPill, TeamName } from "@/components/ui";

export default function ScoreList() {
  return (
    <PinGate need="scorer">
      <List />
    </PinGate>
  );
}

function List() {
  const { state, calc, logout } = useLive();
  if (!state || !calc) return <Loading />;
  const fx = [...state.config.fixtures].sort((a, b) => a.no - b.no);
  const open = fx.filter((f) => calc.ms[f.id].status !== "done");
  const done = fx.filter((f) => calc.ms[f.id].status === "done");
  const item = (f: (typeof fx)[number]) => {
    const r = calc.resolved[f.id];
    const m = calc.ms[f.id];
    return (
      <Link key={f.id} href={`/score/${f.id}`} className={`mrow ${m.status}`}>
        <div className="mmeta">
          <b>{f.time}</b>
          <span>{f.stage === "League" ? `Match ${f.no}` : f.stage}</span>
        </div>
        <div className="mteams">
          <div><TeamName id={r.a} label={r.labelA} size={24} /></div>
          <div><TeamName id={r.b} label={r.labelB} size={24} /></div>
        </div>
        <div className="mside">
          <StatusPill m={m} />
          <span className="muted">{m.status === "scheduled" ? "Start →" : m.status === "live" ? "Resume →" : "Fix →"}</span>
        </div>
      </Link>
    );
  };
  return (
    <>
      <div className="sechead">
        <h1>Score a match</h1>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
      <p className="muted">Pick the match on court. One phone should score each match.</p>
      <div className="mlist">{open.map(item)}</div>
      {done.length > 0 && (
        <>
          <h2>Finished (open to correct a mistake)</h2>
          <div className="mlist">{done.map(item)}</div>
        </>
      )}
    </>
  );
}
