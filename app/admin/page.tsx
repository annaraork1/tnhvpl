"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminSeasons } from "@/components/AdminSeasons";
import { useLive } from "@/components/LiveProvider";
import { Loading, PinGate } from "@/components/ui";
import {
  filterCatalogPlayers,
  filterCatalogTeams,
  type CatalogPlayer,
  type CatalogTeam,
  type MasterCatalog,
} from "@/lib/catalog";
import { askConfirm } from "@/lib/confirm";
import { resultKeys, TIE_LABELS } from "@/lib/engine";
import { fileToLogoDataUrl } from "@/lib/logoUpload";
import { DEFAULT_LOGO } from "@/lib/tournaments";
import type { Fixture, Format, Player, Settings, Team, TieKey } from "@/lib/types";

export default function Admin() {
  return (
    <PinGate need="admin">
      <AdminInner />
    </PinGate>
  );
}

const ALL_TIES = Object.keys(TIE_LABELS) as TieKey[];
const SKILLS = ["Beginner", "Intermediate", "Advanced"] as const;

function AdminInner() {
  const { state, calc, act, logout } = useLive();
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busyLogo, setBusyLogo] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<MasterCatalog | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [playerQuery, setPlayerQuery] = useState<Record<string, string>>({});
  const [showMaster, setShowMaster] = useState(false);
  const [masterTab, setMasterTab] = useState<"teams" | "players">("teams");
  const [masterQuery, setMasterQuery] = useState("");

  useEffect(() => {
    if (!state) return;
    if (draftKey === state.tournamentKey && settings && teams && players && fixtures) return;
    setSettings(structuredClone(state.config.settings));
    setTeams(structuredClone(state.config.teams));
    setPlayers(structuredClone(state.players));
    setFixtures(structuredClone([...state.config.fixtures].sort((a, b) => a.no - b.no)));
    setDraftKey(state.tournamentKey);
  }, [state, draftKey, settings, teams, players, fixtures]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((data: MasterCatalog) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        if (!cancelled) setCatalog({ teams: [], players: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [state?.registry.tournaments.length, state?.tournamentKey]);

  if (!state || !calc || !settings || !teams || !players || !fixtures) return <Loading />;

  const seasonLabel = state.meta?.name || state.tournamentKey;
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? "" : x)), 2500);
  };
  const run = async (type: string, payload: Record<string, unknown>, ok: string) => {
    const r = await act(type, payload);
    flash(r.ok ? ok : r.error ?? "Failed");
    if (r.ok && (type === "saveTeams" || type === "saveSettings" || type === "saveFixtures" || type === "resetAll")) {
      setDraftKey(null);
      if (type === "saveTeams") {
        fetch("/api/catalog")
          .then((res) => res.json())
          .then((data: MasterCatalog) => setCatalog(data))
          .catch(() => {});
      }
    }
    return r.ok;
  };

  const setFmt = (which: "league" | "playoff", patch: Partial<Format>) =>
    setSettings({ ...settings, [which]: { ...settings[which], ...patch } });

  const keys = resultKeys(settings.league);
  const preset = (kind: "2-0" | "321") => {
    const pts: Settings["points"] = {};
    keys.forEach((k) => {
      const loserSets = Number(k.split("-")[1]);
      const close = loserSets === Number(k.split("-")[0]) - 1 && keys.length > 1;
      pts[k] = kind === "2-0" ? { w: 2, l: 0 } : close ? { w: 2, l: 1 } : { w: 3, l: 0 };
    });
    setSettings({ ...settings, points: pts });
  };

  const patchTeam = (i: number, patch: Partial<Team>) =>
    setTeams(teams.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const patchPlayer = (no: number, patch: Partial<Player>) =>
    setPlayers(players.map((p) => (p.no === no ? { ...p, ...patch } : p)));

  const nextPlayerNo = () => Math.max(0, ...players.map((p) => p.no), 0) + 1;

  const uniqueTeamId = (base: string) => {
    let id = base.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20) || "team";
    if (!teams.some((t) => t.id === id)) return id;
    let n = 2;
    while (teams.some((t) => t.id === `${id}${n}`)) n += 1;
    return `${id}${n}`.slice(0, 24);
  };

  const addBlankPlayer = (teamId: string, teamIndex: number) => {
    const no = nextPlayerNo();
    setPlayers([...players, { no, name: "New player", skill: "Intermediate", photo: null, team: teamId }]);
    patchTeam(teamIndex, { squad: [...teams[teamIndex].squad, no] });
  };

  const addPlayerFromCatalog = (teamId: string, teamIndex: number, cp: CatalogPlayer) => {
    const already = teams[teamIndex].squad.some((n) => {
      const p = players.find((x) => x.no === n);
      return p && p.name.trim().toLowerCase() === cp.name.trim().toLowerCase();
    });
    if (already) {
      flash(`${cp.name} is already on this team`);
      return;
    }
    const no = nextPlayerNo();
    setPlayers([
      ...players,
      { no, name: cp.name, skill: cp.skill, photo: cp.photo, team: teamId },
    ]);
    patchTeam(teamIndex, { squad: [...teams[teamIndex].squad, no] });
    setPlayerQuery((q) => ({ ...q, [teamId]: "" }));
    flash(`Added ${cp.name} from master list`);
  };

  const removePlayer = (teamIndex: number, no: number) => {
    const p = players.find((x) => x.no === no);
    if (!askConfirm(`Remove player "${p?.name ?? no}" from ${teams[teamIndex].name}?`)) return;
    patchTeam(teamIndex, { squad: teams[teamIndex].squad.filter((n) => n !== no) });
    setPlayers(players.filter((x) => x.no !== no));
  };

  const addBlankTeam = () => {
    let n = teams.length + 1;
    let id = `team${n}`;
    while (teams.some((t) => t.id === id)) {
      n += 1;
      id = `team${n}`;
    }
    setTeams([
      ...teams,
      {
        id,
        name: `Team ${n}`,
        short: `T${n}`,
        owner: "",
        color: "#4CC9F0",
        logo: DEFAULT_LOGO,
        squad: [],
      },
    ]);
  };

  const addTeamFromCatalog = (ct: CatalogTeam) => {
    if (teams.some((t) => t.name.trim().toLowerCase() === ct.name.trim().toLowerCase())) {
      flash(`${ct.name} is already in this season`);
      return;
    }
    const id = uniqueTeamId(ct.id || ct.name);
    setTeams([
      ...teams,
      {
        id,
        name: ct.name,
        short: ct.short,
        owner: ct.owner,
        color: ct.color,
        logo: ct.logo || DEFAULT_LOGO,
        squad: [],
      },
    ]);
    setTeamQuery("");
    flash(`Added ${ct.name} from master list`);
  };

  const removeTeam = (i: number) => {
    const t = teams[i];
    if (!askConfirm(`Remove team "${t.name}" and its ${t.squad.length} player(s) from this tournament?`)) return;
    const squadSet = new Set(t.squad);
    setTeams(teams.filter((_, j) => j !== i));
    setPlayers(players.filter((p) => !squadSet.has(p.no)));
  };

  const onTeamLogo = async (i: number, file: File | null) => {
    if (!file) return;
    try {
      setBusyLogo(teams[i].id);
      const dataUrl = await fileToLogoDataUrl(file);
      patchTeam(i, { logo: dataUrl });
    } catch (e) {
      flash(e instanceof Error ? e.message : "Logo failed");
    } finally {
      setBusyLogo(null);
    }
  };

  const discardTeams = () => {
    if (!askConfirm("Discard unsaved team and player changes for this tournament?")) return;
    setTeams(structuredClone(state.config.teams));
    setPlayers(structuredClone(state.players));
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

  const removeTie = (k: TieKey) => {
    if (!askConfirm(`Remove tie-break rule "${TIE_LABELS[k]}"?`)) return;
    setSettings({ ...settings, tiebreak: settings.tiebreak.filter((x) => x !== k) });
  };

  const teamNamesInSeason = new Set(teams.map((t) => t.name.trim().toLowerCase()));
  const catalogTeamHits = filterCatalogTeams(catalog?.teams ?? [], teamQuery, teamNamesInSeason).slice(0, 8);

  const masterTeamHits = filterCatalogTeams(catalog?.teams ?? [], masterQuery, new Set()).slice(0, 40);
  const masterPlayerHits = filterCatalogPlayers(catalog?.players ?? [], masterQuery, new Set()).slice(0, 40);

  return (
    <>
      <div className="sechead">
        <h1>Admin</h1>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
      {state.storage === "memory" && (
        <p className="error">No database connected: changes live only in this server&apos;s memory. Connect Upstash Redis (see README) before the event.</p>
      )}

      <section className="card stack" style={{ borderLeft: "4px solid var(--gold)" }}>
        <h2 style={{ margin: 0 }}>Editing this tournament</h2>
        <p className="note" style={{ margin: 0 }}>
          All rules, teams, players, fixtures and reset below apply only to{" "}
          <b>{seasonLabel}</b> (<code>{state.tournamentKey}</code>
          {state.viewingArchive ? " · archive view" : " · active"}). Other seasons are unchanged.
          Open another season from the list below or via <code>/?season=key</code>.
        </p>
      </section>

      <AdminSeasons />

      <section className="card stack">
        <div className="sechead" style={{ margin: 0 }}>
          <h2 style={{ margin: 0 }}>Master roster (all seasons)</h2>
          <button className="btn ghost" type="button" onClick={() => setShowMaster((v) => !v)}>
            {showMaster ? "Hide" : "Show"}
          </button>
        </div>
        <p className="note" style={{ margin: 0 }}>
          Unique teams and players collected from every tournament. Use search below when adding to this season.
          {catalog ? ` · ${catalog.teams.length} teams · ${catalog.players.length} players` : " · loading…"}
        </p>
        {showMaster && (
          <>
            <div className="row">
              <button className={`btn ${masterTab === "teams" ? "gold" : "ghost"}`} type="button" onClick={() => setMasterTab("teams")}>
                Teams
              </button>
              <button className={`btn ${masterTab === "players" ? "gold" : "ghost"}`} type="button" onClick={() => setMasterTab("players")}>
                Players
              </button>
            </div>
            <input
              type="search"
              value={masterQuery}
              onChange={(e) => setMasterQuery(e.target.value)}
              placeholder={masterTab === "teams" ? "Search master teams…" : "Search master players…"}
              aria-label="Search master roster"
            />
            <div className="player-pick-list catalog-list">
              {masterTab === "teams"
                ? masterTeamHits.map((t) => (
                    <div key={`${t.id}-${t.name}`} className="player-pick catalog-row" style={{ ["--tc" as string]: t.color }}>
                      <img className="logo" src={t.logo || DEFAULT_LOGO} alt="" width={40} height={40} />
                      <span className="player-pick-meta">
                        <b>{t.name}</b>
                        <small>
                          {t.owner || "—"} · seen in {t.seasonNames.join(", ")}
                        </small>
                      </span>
                      <button className="btn gold" type="button" onClick={() => addTeamFromCatalog(t)}>
                        Add to season
                      </button>
                    </div>
                  ))
                : masterPlayerHits.map((p) => (
                    <div key={p.name} className="player-pick catalog-row">
                      {p.photo ? <img src={p.photo} alt="" /> : <span className="noimg">{p.name[0]}</span>}
                      <span className="player-pick-meta">
                        <b>{p.name}</b>
                        <small>
                          {p.skill} · {p.seasonNames.join(", ")}
                        </small>
                      </span>
                    </div>
                  ))}
              {(masterTab === "teams" ? masterTeamHits : masterPlayerHits).length === 0 && (
                <p className="note">No matches in the master list.</p>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card stack">
        <h2>Points table rules</h2>
        <p className="note">Saved only for {seasonLabel}.</p>
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
                  <button className="btn ghost" onClick={() => removeTie(k)} aria-label="Remove">✕</button>
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
        <p className="note">League and playoff formats for {seasonLabel} only.</p>
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
          <button className="btn gold" onClick={() => run("saveSettings", { settings }, "Rules saved for this tournament")}>Save rules</button>
          <button
            className="btn ghost"
            onClick={() => {
              if (!askConfirm("Discard unsaved rules changes?")) return;
              setSettings(structuredClone(state.config.settings));
            }}
          >
            Discard changes
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Teams & players</h2>
        <p className="note">Names, owners, logos and squads are stored per tournament. Save applies only to {seasonLabel}.</p>

        <div className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Add team from master list</h3>
          <input
            type="search"
            value={teamQuery}
            onChange={(e) => setTeamQuery(e.target.value)}
            placeholder="Search teams from all seasons…"
            aria-label="Search master teams to add"
          />
          {teamQuery.trim() && (
            <div className="player-pick-list catalog-list">
              {catalogTeamHits.map((t) => (
                <button
                  key={`${t.id}-${t.name}`}
                  type="button"
                  className="player-pick"
                  style={{ ["--tc" as string]: t.color }}
                  onClick={() => addTeamFromCatalog(t)}
                >
                  <img className="logo" src={t.logo || DEFAULT_LOGO} alt="" width={40} height={40} />
                  <span className="player-pick-meta">
                    <b>{t.name}</b>
                    <small>
                      {t.owner || "—"} · {t.seasonNames.join(", ")}
                    </small>
                  </span>
                </button>
              ))}
              {catalogTeamHits.length === 0 && <p className="note">No unused teams match that search.</p>}
            </div>
          )}
        </div>

        {teams.length === 0 && <p className="muted">No teams yet — search the master list or add a blank team.</p>}
        {teams.map((t, i) => (
          <TeamEditor
            key={t.id}
            team={t}
            index={i}
            players={players}
            catalogPlayers={catalog?.players ?? []}
            playerQuery={playerQuery[t.id] ?? ""}
            busyLogo={busyLogo === t.id}
            onPlayerQuery={(q) => setPlayerQuery((prev) => ({ ...prev, [t.id]: q }))}
            onPatch={(patch) => patchTeam(i, patch)}
            onPatchPlayer={patchPlayer}
            onLogo={(file) => onTeamLogo(i, file)}
            onDefaultLogo={() => {
              if (!askConfirm(`Reset logo for "${t.name}" to the default?`)) return;
              patchTeam(i, { logo: DEFAULT_LOGO });
            }}
            onRemoveTeam={() => removeTeam(i)}
            onRemovePlayer={(no) => removePlayer(i, no)}
            onAddBlank={() => addBlankPlayer(t.id, i)}
            onAddFromCatalog={(cp) => addPlayerFromCatalog(t.id, i, cp)}
          />
        ))}
        <div className="row">
          <button className="btn" type="button" onClick={addBlankTeam}>
            + Blank team
          </button>
          <button
            className="btn gold"
            type="button"
            onClick={() => run("saveTeams", { teams, players }, "Teams & players saved for this tournament")}
          >
            Save teams & players
          </button>
          <button className="btn ghost" type="button" onClick={discardTeams}>
            Discard changes
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Fixtures & timings</h2>
        <p className="note">Dates and times for {seasonLabel}. Team overrides and score resets on a match only affect this tournament.</p>
        {fixtures.length === 0 && (
          <p className="muted">No fixtures in this season. Clone from another tournament to copy a schedule, or ask for fixture builder support.</p>
        )}
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
                      {state.config.teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>{tm.name}</option>
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
                      if (!askConfirm(`Clear the score for match ${f.no}? This cannot be undone.`)) return;
                      run("resetMatch", { id: f.id }, `Match ${f.no} reset`);
                    }}
                  >
                    Reset score
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {fixtures.length > 0 && (
          <div>
            <button
              className="btn gold"
              onClick={() =>
                run(
                  "saveFixtures",
                  { fixtures: fixtures.map(({ id, date, day, time }) => ({ id, date, day, time })) },
                  "Fixtures saved for this tournament",
                )
              }
            >
              Save dates & times
            </button>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Reset this tournament</h2>
        <p className="muted">
          Clears all match scores, man-of-the-match picks and awards for <b>{seasonLabel}</b> only.
          Rules, teams, players, fixtures and timings stay. Other seasons are not touched.
        </p>
        <ResetAll
          onDone={() => {
            setDraftKey(null);
            flash("Scores & awards cleared for this tournament");
          }}
        />
      </section>

      {msg && <div className="toast">{msg}</div>}
    </>
  );
}

function TeamEditor({
  team: t,
  index: _index,
  players,
  catalogPlayers,
  playerQuery,
  busyLogo,
  onPlayerQuery,
  onPatch,
  onPatchPlayer,
  onLogo,
  onDefaultLogo,
  onRemoveTeam,
  onRemovePlayer,
  onAddBlank,
  onAddFromCatalog,
}: {
  team: Team;
  index: number;
  players: Player[];
  catalogPlayers: CatalogPlayer[];
  playerQuery: string;
  busyLogo: boolean;
  onPlayerQuery: (q: string) => void;
  onPatch: (patch: Partial<Team>) => void;
  onPatchPlayer: (no: number, patch: Partial<Player>) => void;
  onLogo: (file: File | null) => void;
  onDefaultLogo: () => void;
  onRemoveTeam: () => void;
  onRemovePlayer: (no: number) => void;
  onAddBlank: () => void;
  onAddFromCatalog: (p: CatalogPlayer) => void;
}) {
  const onSquad = useMemo(() => {
    const names = new Set(
      t.squad
        .map((n) => players.find((p) => p.no === n)?.name.trim().toLowerCase())
        .filter(Boolean) as string[],
    );
    return filterCatalogPlayers(catalogPlayers, playerQuery, names).slice(0, 8);
  }, [catalogPlayers, playerQuery, players, t.squad]);

  return (
    <div className="card stack" style={{ background: "var(--card2)", padding: 12 }}>
      <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <img className="logo-preview" src={t.logo || DEFAULT_LOGO} alt="" />
        <label className="btn ghost" style={{ cursor: "pointer" }}>
          {busyLogo ? "Uploading…" : "Team logo"}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busyLogo}
            onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="btn ghost" type="button" onClick={onDefaultLogo}>
          Default logo
        </button>
        <button className="btn red" type="button" onClick={onRemoveTeam}>
          Remove team
        </button>
      </div>
      <div className="fields">
        <label>
          Team name
          <input value={t.name} onChange={(e) => onPatch({ name: e.target.value })} />
        </label>
        <label>
          Short
          <input value={t.short} onChange={(e) => onPatch({ short: e.target.value })} maxLength={6} />
        </label>
        <label>
          Owner
          <input value={t.owner} onChange={(e) => onPatch({ owner: e.target.value })} />
        </label>
        <label>
          Colour
          <input type="color" value={t.color} onChange={(e) => onPatch({ color: e.target.value })} />
        </label>
      </div>
      <h3 style={{ margin: "4px 0 0" }}>Players</h3>
      <div className="stack" style={{ gap: 8 }}>
        {t.squad.map((no) => {
          const p = players.find((x) => x.no === no);
          if (!p) return null;
          return (
            <div key={no} className="fields" style={{ alignItems: "end" }}>
              <label>
                Name
                <input value={p.name} onChange={(e) => onPatchPlayer(no, { name: e.target.value })} />
              </label>
              <label>
                Skill
                <select value={p.skill} onChange={(e) => onPatchPlayer(no, { skill: e.target.value })}>
                  {SKILLS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <button className="btn ghost" type="button" onClick={() => onRemovePlayer(no)}>
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <input
          type="search"
          value={playerQuery}
          onChange={(e) => onPlayerQuery(e.target.value)}
          placeholder="Search master players to add…"
          aria-label={`Search players for ${t.name}`}
        />
        {playerQuery.trim() && (
          <div className="player-pick-list catalog-list">
            {onSquad.map((cp) => (
              <button key={cp.name} type="button" className="player-pick" onClick={() => onAddFromCatalog(cp)}>
                {cp.photo ? <img src={cp.photo} alt="" /> : <span className="noimg">{cp.name[0]}</span>}
                <span className="player-pick-meta">
                  <b>{cp.name}</b>
                  <small>
                    {cp.skill} · {cp.seasonNames.join(", ")}
                  </small>
                </span>
              </button>
            ))}
            {onSquad.length === 0 && <p className="note">No unused players match that search.</p>}
          </div>
        )}
        <div>
          <button className="btn" type="button" onClick={onAddBlank}>
            + Blank player
          </button>
        </div>
      </div>
    </div>
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
          if (!askConfirm("Reset all scores and awards for this tournament? Structure (rules, teams, fixtures) will be kept.")) return;
          const r = await act("resetAll", { confirm: "RESET" });
          if (r.ok) {
            setText("");
            onDone();
          }
        }}
      >
        Reset scores for this tournament
      </button>
    </div>
  );
}
