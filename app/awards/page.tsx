"use client";

import { useMemo, useState } from "react";
import { AwardsGrid } from "@/components/AwardsGrid";
import { useLive } from "@/components/LiveProvider";
import { Loading, PinGate } from "@/components/ui";
import { AWARD_IDS, AWARD_LABELS, emptyAwards, motmSuggestions, teamForPlayer } from "@/lib/awards";
import type { AwardId } from "@/lib/types";

export default function AwardsPage() {
  const { state, calc } = useLive();
  if (!state || !calc) return <Loading />;
  const final = state.config.fixtures.find((f) => f.stage === "Final");
  const finalDone = !!final && calc.ms[final.id]?.status === "done";
  const awards = state.config.awards ?? emptyAwards();

  return (
    <>
      <h1>Awards</h1>
      {!finalDone ? (
        <p className="note">Tournament awards unlock after the Final is finished.</p>
      ) : (
        <>
          <AwardsGrid awards={awards} emptyNote="No awards announced yet." />
          <section className="card stack" style={{ marginTop: 8 }}>
            <h2>Set awards</h2>
            <p className="muted">Search a player, pick an award, then Apply. Admin or scorer PIN. You can change awards later.</p>
            <PinGate need="scorer">
              <AwardsEditor />
            </PinGate>
          </section>
        </>
      )}
    </>
  );
}

function AwardsEditor() {
  const { state, calc, act, logout, team } = useLive();
  const [query, setQuery] = useState("");
  const [pickedNo, setPickedNo] = useState<number | null>(null);
  const [awardId, setAwardId] = useState<AwardId>("mvp");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const players = useMemo(() => {
    if (!state) return [];
    return state.config.teams.flatMap((t) =>
      t.squad
        .map((n) => state.players.find((p) => p.no === n))
        .filter(Boolean)
        .map((p) => ({ player: p!, team: t })),
    );
  }, [state]);

  const suggestions = useMemo(() => (state && calc ? motmSuggestions(state, calc) : []), [state, calc]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      ({ player, team: t }) =>
        player.name.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.short.toLowerCase().includes(q) ||
        String(player.no) === q,
    );
  }, [players, query]);

  if (!state) return <Loading />;
  const awards = state.config.awards ?? emptyAwards();
  const show = state.config.settings.showPhotos;
  const picked = pickedNo != null ? players.find((x) => x.player.no === pickedNo) : null;

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? "" : x)), 2500);
  };

  const apply = async () => {
    if (!picked) {
      flash("Search and select a player first");
      return;
    }
    setBusy(true);
    const next = { ...emptyAwards(), ...awards, [awardId]: { playerNo: picked.player.no, teamId: picked.team.id } };
    const r = await act("saveAwards", { awards: next });
    setBusy(false);
    if (r.ok) {
      flash(`${AWARD_LABELS[awardId]} → ${picked.player.name}`);
      setQuery("");
      setPickedNo(null);
    } else flash(r.error ?? "Failed");
  };

  const clearAward = async (id: AwardId) => {
    setBusy(true);
    const next = { ...emptyAwards(), ...awards, [id]: null };
    const r = await act("saveAwards", { awards: next });
    setBusy(false);
    flash(r.ok ? `${AWARD_LABELS[id]} cleared` : r.error ?? "Failed");
  };

  return (
    <div className="stack award-edit">
      {suggestions.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>MVP suggestions (match best players)</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            From optional best-player picks after each match. Tap to select, then Apply to an award.
          </p>
          <div className="motm-suggest">
            {suggestions.map((s) => {
              const p = state.players.find((x) => x.no === s.playerNo);
              const t = team(s.teamId);
              if (!p || !t) return null;
              const on = pickedNo === s.playerNo;
              return (
                <button
                  key={s.playerNo}
                  type="button"
                  className={`player-pick ${on ? "on" : ""}`}
                  style={{ ["--tc" as string]: t.color }}
                  onClick={() => {
                    setPickedNo(s.playerNo);
                    setAwardId("mvp");
                    setQuery(p.name);
                  }}
                >
                  {show && p.photo ? <img src={p.photo} alt="" /> : <span className="noimg">{p.name[0]}</span>}
                  <span className="player-pick-meta">
                    <b>{p.name}</b>
                    <small>
                      {t.name} · {s.count} match{s.count === 1 ? "" : "es"}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="form">
        Search players
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or team…"
          aria-label="Search players"
          autoComplete="off"
        />
      </label>

      <div className="player-pick-list" role="listbox" aria-label="Players">
        {filtered.length === 0 && <p className="note">No players match that search.</p>}
        {filtered.map(({ player: p, team: t }) => {
          const on = pickedNo === p.no;
          return (
            <button
              key={p.no}
              type="button"
              role="option"
              aria-selected={on}
              className={`player-pick ${on ? "on" : ""}`}
              style={{ ["--tc" as string]: t.color }}
              onClick={() => setPickedNo(p.no)}
            >
              {show && p.photo ? <img src={p.photo} alt="" /> : <span className="noimg">{p.name[0]}</span>}
              <span className="player-pick-meta">
                <b>{p.name}</b>
                <small>
                  {t.name} · {p.skill}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      <label className="form">
        Award
        <select value={awardId} onChange={(e) => setAwardId(e.target.value as AwardId)} aria-label="Award">
          {AWARD_IDS.map((id) => (
            <option key={id} value={id}>
              {AWARD_LABELS[id]}
              {awards[id] ? " (set)" : ""}
            </option>
          ))}
        </select>
      </label>

      {picked && (
        <p className="note">
          Selected: <b>{picked.player.name}</b> ({picked.team.name}) → {AWARD_LABELS[awardId]}
        </p>
      )}

      <div className="row">
        <button className="btn gold" type="button" disabled={busy || !picked} onClick={apply}>
          {busy ? "Saving…" : "Apply"}
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={busy || !picked}
          onClick={() => {
            setPickedNo(null);
            setQuery("");
          }}
        >
          Clear selection
        </button>
        <button className="btn ghost" type="button" onClick={logout}>
          Log out
        </button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Current picks</h3>
        {AWARD_IDS.map((id) => {
          const e = awards[id];
          const p = e ? state.players.find((x) => x.no === e.playerNo) : null;
          const t = e ? team(e.teamId) ?? teamForPlayer(e.playerNo, state.config.teams, state.players) : null;
          return (
            <div key={id} className="award-current row">
              <span>
                <b>{AWARD_LABELS[id]}</b>
                {p && t ? (
                  <span className="muted">
                    {" "}
                    · {p.name} ({t.name})
                  </span>
                ) : (
                  <span className="muted"> · not set</span>
                )}
              </span>
              {e && (
                <button className="btn ghost" type="button" disabled={busy} onClick={() => clearAward(id)}>
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
