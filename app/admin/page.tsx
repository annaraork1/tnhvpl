"use client";

import { useEffect, useState } from "react";
import { useLive } from "@/components/LiveProvider";
import { Loading, PinGate } from "@/components/ui";
import { resultKeys, TIE_LABELS } from "@/lib/engine";
import type { Fixture, Format, Settings, Team, TieKey } from "@/lib/types";

export default function Admin() {
  return (
    <PinGate need="admin">
      <AdminInner />
    </PinGate>
  );
}

const ALL_TIES = Object.keys(TIE_LABELS) as TieKey[];

function AdminInner() {
  const { state, calc, act, logout } = useLive();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (state && !settings) {
      setSettings(structuredClone(state.config.settings));
      setTeams(structuredClone(state.config.teams));
      setFixtures(structuredClone([...state.config.fixtures].sort((a, b) => a.no - b.no)));
    }
  }, [state, settings]);

  if (!state || !calc || !settings || !teams || !fixtures) return <Loading />;

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? "" : x)), 2500);
  };
  const run = async (type: string, payload: Record<string, unknown>, ok: string) => {
    const r = await act(type, payload);
    flash(r.ok ? ok : r.error ?? "Failed");
    return r.ok;
  };

  const setFmt = (which: "league" | "playoff", patch: Partial<Format>) =>
    setSettings({ ...settings, [which]: { ...settings[which], ...patch } });

  const keys = resultKeys(settings.league);
  const preset = (kind: "2-0" | "321") => {
    const pts: Settings["points"] = {};
    keys.forEach((k, i) => {
      const loserSets = Number(k.split("-")[1]);
      const close = loserSets === Number(k.split("-")[0]) - 1 && keys.length > 1;
      pts[k] = kind === "2-0" ? { w: 2, l: 0 } : close ? { w: 2, l: 1 } : { w: 3, l: 0 };
      void i;
    });
    setSettings({ ...settings, points: pts });
  };

  const fmtEditor = (which: "league" | "playoff", title: string) => {
    const f = settings[which];
    return (
      <div className="stack">
        <h3>{title}</h3>
        <div className="fields">
          <label>
            Best of
            <select value={f.bestOf} onChange={(e) => setFmt(which, { bestOf: Number(e.target.value) })}>
              {[1, 3, 5].map((n) => (
                <option key={n} value={n}>{n} set{n > 1 ? "s" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Points per set
            <input
              value={f.targets.join(",")}
              onChange={(e) =>
                setFmt(which, { targets: e.target.value.split(/[,\s-]+/).filter(Boolean).map(Number).filter((n) => n > 0) })
              }
              placeholder="21,21,15"
            />
          </label>
          <label>
            Win by
            <input type="number" min={1} max={5} value={f.winBy} onChange={(e) => setFmt(which, { winBy: Number(e.target.value) })} />
          </label>
          <label>
            Cap (0 = none)
            <input type="number" min={0} value={f.cap} onChange={(e) => setFmt(which, { cap: Number(e.target.value) })} />
          </label>
          <label>
            Timeouts / set
            <input type="number" min={0} max={5} value={f.timeouts} onChange={(e) => setFmt(which, { timeouts: Number(e.target.value) })} />
          </label>
          <label style={{ alignContent: "end" }}>
            <span className="row">
              <input
                type="checkbox"
                checked={f.switchInDecider}
                onChange={(e) => setFmt(which, { switchInDecider: e.target.checked })}
              />
              Switch sides in deciding set
            </span>
          </label>
        </div>
      </div>
    );
  };

  const moveTie = (i: number, d: number) => {
    const t = [...settings.tiebreak];
    const j = i + d;
    if (j < 0 || j >= t.length) return;
    [t[i], t[j]] = [t[j], t[i]];
    setSettings({ ...settings, tiebreak: t });
  };

  return (
    <>
      <div className="sechead">
        <h1>Admin</h1>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
      {state.storage === "memory" && (
        <p className="error">No database connected: changes live only in this server&apos;s memory. Connect Upstash Redis (see README) before the event.</p>
      )}

      <section className="card stack">
        <h2>Points table rules</h2>
        <div className="row">
          <button className="btn" onClick={() => preset("2-0")}>Preset: 2 per win, 0 per loss</button>
          <button className="btn" onClick={() => preset("321")}>Preset: 3 / 2 / 1 / 0 by set score</button>
        </div>
        <div className="fields">
          {keys.map((k) => (
            <div key={k} className="card" style={{ padding: 10, background: "var(--card2)" }}>
              <b>Result {k}</b>
              <div className="fields" style={{ marginTop: 6 }}>
                <label>
                  Winner gets
                  <input
                    type="number"
                    value={settings.points[k]?.w ?? 0}
                    onChange={(e) => setSettings({ ...settings, points: { ...settings.points, [k]: { w: Number(e.target.value), l: settings.points[k]?.l ?? 0 } } })}
                  />
                </label>
                <label>
                  Loser gets
                  <input
                    type="number"
                    value={settings.points[k]?.l ?? 0}
                    onChange={(e) => setSettings({ ...settings, points: { ...settings.points, [k]: { w: settings.points[k]?.w ?? 0, l: Number(e.target.value) } } })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <h3>Tie-break order</h3>
        <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          {settings.tiebreak.map((k, i) => (
            <li key={k}>
              <span className="row" style={{ justifyContent: "space-between" }}>
                {TIE_LABELS[k]}
                <span className="row">
                  <button className="btn ghost" onClick={() => moveTie(i, -1)} aria-label="Move up">↑</button>
                  <button className="btn ghost" onClick={() => moveTie(i, 1)} aria-label="Move down">↓</button>
                  <button className="btn ghost" onClick={() => setSettings({ ...settings, tiebreak: settings.tiebreak.filter((x) => x !== k) })} aria-label="Remove">✕</button>
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="row">
          {ALL_TIES.filter((k) => !settings.tiebreak.includes(k)).map((k) => (
            <button key={k} className="btn ghost" onClick={() => setSettings({ ...settings, tiebreak: [...settings.tiebreak, k] })}>
              + {TIE_LABELS[k]}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Match format</h2>
        {fmtEditor("league", "League matches")}
        {fmtEditor("playoff", "Playoffs & final")}
        <div className="fields">
          <label>
            Timeout length (seconds)
            <input
              type="number"
              min={5}
              max={300}
              value={settings.timeoutSeconds ?? 30}
              onChange={(e) => setSettings({ ...settings, timeoutSeconds: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="note">When a scorer calls a timeout, a countdown runs for this many seconds. After it ends they tap Resume to continue the match.</p>
        <label className="row">
          <input type="checkbox" checked={settings.showPhotos} onChange={(e) => setSettings({ ...settings, showPhotos: e.target.checked })} />
          Show player photos on team pages
        </label>
        <p className="note">Changing set rules re-checks matches already scored with the new rules, so change them before the first match.</p>
        <div className="row">
          <button className="btn gold" onClick={() => run("saveSettings", { settings }, "Rules saved")}>Save rules</button>
          <button className="btn ghost" onClick={() => setSettings(structuredClone(state.config.settings))}>Discard changes</button>
        </div>
      </section>

      <section className="card stack">
        <h2>Teams</h2>
        {teams.map((t, i) => (
          <div key={t.id} className="fields">
            <label>
              Team name
              <input value={t.name} onChange={(e) => setTeams(teams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            </label>
            <label>
              Owner
              <input value={t.owner} onChange={(e) => setTeams(teams.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)))} />
            </label>
            <label>
              Colour
              <input type="color" value={t.color} onChange={(e) => setTeams(teams.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
            </label>
          </div>
        ))}
        <div>
          <button className="btn gold" onClick={() => run("saveTeams", { teams: teams.map(({ id, name, owner, color }) => ({ id, name, owner, color })) }, "Teams saved")}>
            Save teams
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Fixtures</h2>
        <p className="note">Edit dates and times here. For a match, you can also set the teams by hand (overrides the automatic playoff teams) or reset its score.</p>
        {fixtures.map((f, i) => {
          const r = calc.resolved[f.id];
          const m = calc.ms[f.id];
          const over = state.matches[f.id]?.over ?? {};
          return (
            <div key={f.id} className="card stack" style={{ background: "var(--card2)", padding: 12 }}>
              <b>
                {f.stage === "League" ? `Match ${f.no}` : `Match ${f.no} · ${f.stage}`} — {m.status}
              </b>
              <div className="fields">
                <label>
                  Date
                  <input type="date" value={f.date} onChange={(e) => setFixtures(fixtures.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                </label>
                <label>
                  Day label
                  <input value={f.day} onChange={(e) => setFixtures(fixtures.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} />
                </label>
                <label>
                  Time
                  <input value={f.time} onChange={(e) => setFixtures(fixtures.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
                </label>
                {(["a", "b"] as const).map((s) => (
                  <label key={s}>
                    Team {s.toUpperCase()} ({s === "a" ? r.labelA : r.labelB})
                    <select
                      value={over[s] ?? ""}
                      onChange={(e) =>
                        run("setTeams", { id: f.id, a: s === "a" ? e.target.value : over.a ?? "", b: s === "b" ? e.target.value : over.b ?? "" }, "Teams updated")
                      }
                    >
                      <option value="">Automatic</option>
                      {state.config.teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {m.status !== "scheduled" && (
                <div>
                  <button
                    className="btn red"
                    onClick={() => {
                      if (confirm === f.id) {
                        setConfirm("");
                        run("resetMatch", { id: f.id }, `Match ${f.no} reset`);
                      } else setConfirm(f.id);
                    }}
                  >
                    {confirm === f.id ? "Tap again to clear this score" : "Reset score"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div>
          <button className="btn gold" onClick={() => run("saveFixtures", { fixtures: fixtures.map(({ id, date, day, time }) => ({ id, date, day, time })) }, "Fixtures saved")}>
            Save dates & times
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Start over</h2>
        <p className="muted">Clears every score and restores the original teams, fixtures and rules.</p>
        <ResetAll onDone={() => { setSettings(null); flash("Everything reset"); }} />
      </section>

      {msg && <div className="toast">{msg}</div>}
    </>
  );
}

function ResetAll({ onDone }: { onDone: () => void }) {
  const { act } = useLive();
  const [text, setText] = useState("");
  return (
    <div className="row">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type RESET" aria-label="Type RESET to confirm" />
      <button
        className="btn red"
        disabled={text !== "RESET"}
        onClick={async () => {
          const r = await act("resetAll", { confirm: "RESET" });
          if (r.ok) {
            setText("");
            onDone();
          }
        }}
      >
        Reset everything
      </button>
    </div>
  );
}
