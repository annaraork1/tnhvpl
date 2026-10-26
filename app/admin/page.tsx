"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminSeasons } from "@/components/AdminSeasons";
import { AdminStageBar } from "@/components/AdminStageBar";
import { useLive } from "@/components/LiveProvider";
import { TargetsPerSetInput } from "@/components/TargetsPerSetInput";
import { Loading, PinGate } from "@/components/ui";
import { targetsFitBestOf, trimTargetsToBestOf } from "@/lib/targetsInput";
import {
  filterCatalogPlayers,
  filterCatalogTeams,
  type CatalogPlayer,
  type CatalogTeam,
  type MasterCatalog,
} from "@/lib/catalog";
import { askConfirm } from "@/lib/confirm";
import { leftoverCount, maxBidFor } from "@/lib/auction";
import { resultKeys, TIE_LABELS } from "@/lib/engine";
import { fileToLogoDataUrl } from "@/lib/logoUpload";
import { defaultAuctionSettings, tieredAuctionSettings } from "@/lib/season";
import { DEFAULT_LOGO } from "@/lib/tournaments";
import type { AuctionSettings, Fixture, Format, Player, Settings, Team, TieKey } from "@/lib/types";

export default function Admin() {
  return (
    <PinGate need="admin">
      <AdminInner />
    </PinGate>
  );
}

const ALL_TIES = Object.keys(TIE_LABELS) as TieKey[];
const SKILLS = ["Beginner", "Intermediate", "Advanced"] as const;

type AdminTab =
  | "overview"
  | "registration"
  | "auction"
  | "teams"
  | "rules"
  | "fixtures"
  | "catalog"
  | "danger";

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "registration", label: "Registration" },
  { id: "auction", label: "Auction" },
  { id: "teams", label: "Teams" },
  { id: "rules", label: "Rules" },
  { id: "fixtures", label: "Fixtures" },
  { id: "catalog", label: "Catalog" },
  { id: "danger", label: "Danger" },
];

function readAdminTab(): AdminTab {
  if (typeof window === "undefined") return "overview";
  const t = new URLSearchParams(window.location.search).get("tab");
  return ADMIN_TABS.some((x) => x.id === t) ? (t as AdminTab) : "overview";
}

function AdminInner() {
  const { state, calc, act, logout, seasonHref } = useLive();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLogo, setBusyLogo] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<MasterCatalog | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [playerQuery, setPlayerQuery] = useState<Record<string, string>>({});
  const [showMaster, setShowMaster] = useState(false);
  const [masterTab, setMasterTab] = useState<"teams" | "players">("teams");
  const [masterQuery, setMasterQuery] = useState("");

  useEffect(() => {
    setTab(readAdminTab());
  }, []);

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
    if (busy) return;
    setBusy(true);
    const r = await act(type, payload);
    setBusy(false);
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

  const setFmt = (which: "league" | "playoff", patch: Partial<Format>) => {
    const cur = settings[which];
    const next = { ...cur, ...patch };
    if (patch.bestOf != null && patch.targets == null) {
      next.targets = trimTargetsToBestOf(next.bestOf, next.targets);
    }
    setSettings({ ...settings, [which]: next });
  };

  const formatError =
    targetsFitBestOf(settings.league.bestOf, settings.league.targets) ||
    targetsFitBestOf(settings.playoff.bestOf, settings.playoff.targets);

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
            <TargetsPerSetInput
              value={f.targets}
              bestOf={f.bestOf}
              onChange={(targets) => setFmt(which, { targets })}
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

  const goTab = (id: AdminTab) => {
    setTab(id);
    if (id === "catalog") setShowMaster(true);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exportCsvs = async () => {
    const pin = localStorage.getItem("tnhvpl-pin") || "";
    for (const kind of ["registrations", "auction", "squads"] as const) {
      const r = await fetch(`/api/export?kind=${kind}&season=${encodeURIComponent(state.tournamentKey)}`, {
        headers: { "x-pin": pin },
      });
      if (!r.ok) continue;
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${state.tournamentKey}-${kind}.csv`;
      a.click();
    }
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

      <nav className="admin-tabs" aria-label="Admin sections">
        {ADMIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "on" : ""}
            onClick={() => goTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="admin-panel stack">
          <section className="card stack" style={{ borderLeft: "4px solid var(--gold)" }}>
            <h2 style={{ margin: 0 }}>Editing this tournament</h2>
            <p className="note" style={{ margin: 0 }}>
              All rules, teams, players, fixtures and reset apply only to{" "}
              <b>{seasonLabel}</b> (<code>{state.tournamentKey}</code>
              {state.viewingArchive ? " · archive view" : " · active"}). Other seasons are unchanged.
              Open another season from the list below or via <code>/?season=key</code>.
            </p>
          </section>
          <AdminSeasons />
          <AdminStageBar />
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Quick links</h2>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={() => goTab("registration")}>
                Registration
              </button>
              <button type="button" className="btn" onClick={() => goTab("auction")}>
                Auction
              </button>
              <Link className="btn ghost" href={seasonHref("/admin/registrations")}>
                Approve players
              </Link>
              <Link className="btn ghost" href={seasonHref("/auction/console")}>
                Auction console
              </Link>
            </div>
          </section>
        </div>
      )}

      {tab === "registration" && (
        <div className="admin-panel stack">
          <section className="card stack">
            <div className="sechead" style={{ margin: 0 }}>
              <h2 style={{ margin: 0 }}>Registration</h2>
              <Link className="btn gold" href={seasonHref("/admin/registrations")}>
                Open registrations
              </Link>
            </div>
            <p className="note" style={{ margin: 0 }}>
              Public sign-up at <code>/register</code>. Review pending players, approve or exclude, then lock to assign
              auction numbers and move to the auction stage.
            </p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link className="btn" href={seasonHref("/admin/registrations")}>
                Approve / reject players
              </Link>
              <Link className="btn ghost" href={seasonHref("/register")}>
                Public form
              </Link>
              <button type="button" className="btn ghost" onClick={() => void exportCsvs()}>
                Export CSVs
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === "auction" && (
        <div className="admin-panel stack">
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Auction</h2>
            <p className="note" style={{ margin: 0 }}>
              Run the live draw and bidding after registration is locked. Owner PINs and auction rules are below.
            </p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link className="btn gold" href={seasonHref("/auction/console")}>
                Auction console
              </Link>
              <Link className="btn ghost" href={seasonHref("/auction/board")}>
                Purse board
              </Link>
              <Link className="btn ghost" href={seasonHref("/auction/live")}>
                Public live
              </Link>
              <Link className="btn ghost" href={seasonHref("/admin/squads-print")}>
                Print squads
              </Link>
              <button type="button" className="btn ghost" onClick={() => void exportCsvs()}>
                Export CSVs
              </button>
            </div>
            <AuctionSettingsEditor />
          </section>
          <OwnerPinsSection />
        </div>
      )}

      {tab === "catalog" && (
        <div className="admin-panel stack">
          <section className="card stack">
            <div className="sechead" style={{ margin: 0 }}>
              <h2 style={{ margin: 0 }}>Master roster (all seasons)</h2>
              <button className="btn ghost" type="button" onClick={() => setShowMaster((v) => !v)}>
                {showMaster ? "Hide" : "Show"}
              </button>
            </div>
            <p className="note" style={{ margin: 0 }}>
              Unique teams and players collected from every tournament. Use search when adding to this season.
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
        </div>
      )}

      {tab === "rules" && (
        <div className="admin-panel stack">
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
          {formatError && <p className="error">{formatError}</p>}
          <button
            className="btn gold"
            disabled={busy || !!formatError}
            aria-busy={busy}
            onClick={() => run("saveSettings", { settings }, "Rules saved for this tournament")}
          >
            {busy ? "Saving…" : "Save rules"}
          </button>
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
        </div>
      )}

      {tab === "teams" && (
        <div className="admin-panel stack">
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
            disabled={busy}
            aria-busy={busy}
            onClick={() => run("saveTeams", { teams, players }, "Teams & players saved for this tournament")}
          >
            {busy ? "Saving…" : "Save teams & players"}
          </button>
          <button className="btn ghost" type="button" onClick={discardTeams}>
            Discard changes
          </button>
        </div>
      </section>
        </div>
      )}

      {tab === "fixtures" && (
        <div className="admin-panel stack">
      <FixtureGenerator />

      <section className="card stack">
        <h2>Fixtures & timings</h2>
        <p className="note">Dates and times for {seasonLabel}. Team overrides and score resets on a match only affect this tournament.</p>
        {fixtures.length === 0 && (
          <p className="muted">No fixtures yet — use Generate fixtures above, or clone an older season&apos;s schedule.</p>
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
              disabled={busy}
              aria-busy={busy}
              onClick={() =>
                run(
                  "saveFixtures",
                  { fixtures: fixtures.map(({ id, date, day, time }) => ({ id, date, day, time })) },
                  "Fixtures saved for this tournament",
                )
              }
            >
              {busy ? "Saving…" : "Save dates & times"}
            </button>
          </div>
        )}
      </section>
        </div>
      )}

      {tab === "danger" && (
        <div className="admin-panel stack">
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
        </div>
      )}

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
  const [busy, setBusy] = useState(false);
  return (
    <div className="row">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type RESET" aria-label="Type RESET to confirm" />
      <button
        className="btn red"
        disabled={text !== "RESET" || busy}
        aria-busy={busy}
        onClick={async () => {
          if (!askConfirm("Reset all scores and awards for this tournament? Structure (rules, teams, fixtures) will be kept.")) return;
          setBusy(true);
          const r = await act("resetAll", { confirm: "RESET" });
          setBusy(false);
          if (r.ok) {
            setText("");
            onDone();
          }
        }}
      >
        {busy ? "Resetting…" : "Reset scores for this tournament"}
      </button>
    </div>
  );
}

function FixtureGenerator() {
  const { state, act } = useLive();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<Fixture[] | null>(null);
  const [report, setReport] = useState<{ teamId: string; backToBacks: number; shortGaps: number }[] | null>(null);
  const [day1, setDay1] = useState({ date: "", label: "Day 1", start: "4:00 PM", end: "10:00 PM" });
  const [day2, setDay2] = useState({ date: "", label: "Day 2", start: "4:00 PM", end: "10:00 PM" });
  const [leagueMins, setLeagueMins] = useState(45);
  const [playoffMins, setPlayoffMins] = useState(60);
  const [breakMins, setBreakMins] = useState(0);
  const [playoffFormat, setPlayoffFormat] = useState<"qualifier" | "semis" | "final" | "none">("qualifier");

  if (!state) return null;
  const teams = state.config.teams;

  const runPreview = async () => {
    if (!day1.date || !day2.date) {
      setMsg("Set both day dates");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pin": localStorage.getItem("tnhvpl-pin") || "",
        },
        body: JSON.stringify({
          type: "generateFixturesPreview",
          season: state.tournamentKey,
          input: {
            days: [day1, day2],
            leagueSlotMinutes: leagueMins,
            playoffSlotMinutes: playoffMins,
            breakBeforePlayoffsMinutes: breakMins,
            playoffFormat,
            roundRobin: "single",
            teamOrder: teams.map((t) => t.id),
          },
        }),
      });
      const j = await res.json();
      if (j.error) {
        setMsg(j.error);
        setPreview(null);
        setReport(null);
      } else {
        setPreview(j.fixtures);
        setReport(j.report);
        setMsg(`Preview: ${j.fixtures?.length ?? 0} fixtures`);
      }
    } catch {
      setMsg("No connection");
    }
    setBusy(false);
  };

  const save = async () => {
    if (!preview?.length) return;
    if (!askConfirm("Save generated fixtures and move to Matches stage?")) return;
    setBusy(true);
    const r = await act("saveGeneratedFixtures", {
      fixtures: preview,
      fixtureGen: {
        days: [day1, day2],
        leagueSlotMinutes: leagueMins,
        playoffSlotMinutes: playoffMins,
        breakBeforePlayoffsMinutes: breakMins,
        playoffFormat,
        roundRobin: "single",
        teamOrder: teams.map((t) => t.id),
      },
    });
    setBusy(false);
    setMsg(r.ok ? "Fixtures saved — stage is Matches" : r.error ?? "Failed");
    if (r.ok) {
      setPreview(null);
      setReport(null);
    }
  };

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Generate fixtures</h2>
      <p className="note" style={{ margin: 0 }}>
        Optimises rest (minimise back-to-backs, then short gaps). Preview the rest report before saving.
      </p>
      <div className="fields">
        <label>
          Day 1 date
          <input type="date" value={day1.date} onChange={(e) => setDay1({ ...day1, date: e.target.value })} />
        </label>
        <label>
          Day 1 start–end
          <div className="row">
            <input value={day1.start} onChange={(e) => setDay1({ ...day1, start: e.target.value })} />
            <input value={day1.end} onChange={(e) => setDay1({ ...day1, end: e.target.value })} />
          </div>
        </label>
        <label>
          Day 2 date
          <input type="date" value={day2.date} onChange={(e) => setDay2({ ...day2, date: e.target.value })} />
        </label>
        <label>
          Day 2 start–end
          <div className="row">
            <input value={day2.start} onChange={(e) => setDay2({ ...day2, start: e.target.value })} />
            <input value={day2.end} onChange={(e) => setDay2({ ...day2, end: e.target.value })} />
          </div>
        </label>
        <label>
          League slot (min)
          <input type="number" value={leagueMins} onChange={(e) => setLeagueMins(Number(e.target.value))} />
        </label>
        <label>
          Playoff slot (min)
          <input type="number" value={playoffMins} onChange={(e) => setPlayoffMins(Number(e.target.value))} />
        </label>
        <label>
          Playoffs
          <select value={playoffFormat} onChange={(e) => setPlayoffFormat(e.target.value as typeof playoffFormat)}>
            <option value="qualifier">Qualifier (S5)</option>
            <option value="semis">Semis</option>
            <option value="final">Final only</option>
            <option value="none">None</option>
          </select>
        </label>
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={busy || teams.length < 2} onClick={runPreview}>
          Preview
        </button>
        <button type="button" className="btn gold" disabled={busy || !preview?.length} onClick={save}>
          Save &amp; go to Matches
        </button>
      </div>
      {report && (
        <div className="tablewrap">
          <table className="standings">
            <thead>
              <tr>
                <th className="l">Team</th>
                <th>BTB</th>
                <th>Short</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.teamId}>
                  <td className="l">{teams.find((t) => t.id === r.teamId)?.name ?? r.teamId}</td>
                  <td>{r.backToBacks}</td>
                  <td>{r.shortGaps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {preview.filter((f) => f.stage === "League").length} league ·{" "}
          {preview.filter((f) => f.stage !== "League").length} playoff
        </p>
      )}
      {msg && <p className="note">{msg}</p>}
    </section>
  );
}

function AuctionSettingsEditor() {
  const { state, act } = useLive();
  const [draft, setDraft] = useState<AuctionSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    setDraft(structuredClone(state.config.auction ?? defaultAuctionSettings()));
  }, [state?.tournamentKey, state?.config.auction]);

  if (!state || !draft) return null;
  const nPlayers = state.players.length || 43;
  const nTeams = state.config.teams.length || 5;
  const leftover = leftoverCount(nPlayers, nTeams, draft.minPlayers);
  const minBase = Math.min(...Object.values(draft.basePriceBySkill), 100);
  const maxOpen = maxBidFor(draft.purse, 0, draft.minPlayers, minBase);

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setDraft(defaultAuctionSettings())}
        >
          Season 5 (flat 100)
        </button>
        <button type="button" className="btn ghost" onClick={() => setDraft(tieredAuctionSettings())}>
          Tiered
        </button>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
        <label>
          Purse{" "}
          <input
            type="number"
            value={draft.purse}
            onChange={(e) => setDraft({ ...draft, purse: Number(e.target.value) })}
            style={{ width: 90 }}
          />
        </label>
        <label>
          Min players{" "}
          <input
            type="number"
            value={draft.minPlayers}
            onChange={(e) => setDraft({ ...draft, minPlayers: Number(e.target.value) })}
            style={{ width: 70 }}
          />
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={draft.capUntilLeftover}
            onChange={(e) => setDraft({ ...draft, capUntilLeftover: e.target.checked })}
          />
          Cap until leftover
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={draft.showPricesPublic}
            onChange={(e) => setDraft({ ...draft, showPricesPublic: e.target.checked })}
          />
          Show prices public after auction
        </label>
      </div>
      <p className="note" style={{ margin: 0 }}>
        With {nPlayers} players and {nTeams} teams: leftover = {leftover}; max opening bid (0 bought) ={" "}
        {maxOpen.toLocaleString("en-IN")}.
      </p>
      <button
        type="button"
        className="btn gold"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await act("saveAuctionSettings", { auction: draft });
          setBusy(false);
          setMsg(r.ok ? "Auction settings saved" : r.error ?? "Failed");
        }}
      >
        Save auction settings
      </button>
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}

function OwnerPinsSection() {
  const { state, act } = useLive();
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const r = await act("ownerPinStatus", {}, { noAccept: true });
    if (r.ok && r.state) {
      /* pins come from a custom response — re-fetch via act body isn't typed; use dedicated call */
    }
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pin": localStorage.getItem("tnhvpl-pin") || "",
        },
        body: JSON.stringify({ type: "ownerPinStatus", season: state?.tournamentKey }),
      });
      const j = await res.json();
      if (j.ok && j.pins) setPins(j.pins);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.tournamentKey, state?.config.teams.length]);

  if (!state) return null;
  const teams = state.config.teams;

  return (
    <section className="card stack">
      <div className="sechead" style={{ margin: 0 }}>
        <h2 style={{ margin: 0 }}>Owner PINs</h2>
      </div>
      <p className="note" style={{ margin: 0 }}>
        Per-team PINs for the auction owner view. Never shown after save — only set / not set.
      </p>
      {teams.map((t) => (
        <div key={t.id} className="row" style={{ flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ minWidth: 120 }}>
            {t.name}{" "}
            <span className={`pill ${pins[t.id] ? "done" : ""}`}>{pins[t.id] ? "set" : "not set"}</span>
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="New PIN"
            value={draft[t.id] ?? ""}
            onChange={(e) => setDraft({ ...draft, [t.id]: e.target.value })}
            style={{ maxWidth: 120 }}
            aria-label={`PIN for ${t.name}`}
          />
          <button
            type="button"
            className="btn"
            disabled={busy || !(draft[t.id] || "").trim()}
            onClick={async () => {
              setBusy(true);
              const r = await act("setOwnerPin", { teamId: t.id, pin: draft[t.id] });
              setBusy(false);
              setMsg(r.ok ? `PIN set for ${t.short}` : r.error ?? "Failed");
              if (r.ok) {
                setDraft({ ...draft, [t.id]: "" });
                void refresh();
              }
            }}
          >
            Set
          </button>
          {pins[t.id] && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                if (!askConfirm(`Clear owner PIN for ${t.name}?`)) return;
                setBusy(true);
                const r = await act("clearOwnerPin", { teamId: t.id });
                setBusy(false);
                setMsg(r.ok ? "Cleared" : r.error ?? "Failed");
                if (r.ok) void refresh();
              }}
            >
              Clear
            </button>
          )}
        </div>
      ))}
      {!teams.length && <p className="muted">Add teams first.</p>}
      {msg && <p className="note">{msg}</p>}
    </section>
  );
}
