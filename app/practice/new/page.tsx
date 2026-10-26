"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { askConfirm } from "@/lib/confirm";
import {
  filterCatalogPlayers,
  filterCatalogTeams,
  type CatalogPlayer,
  type CatalogTeam,
  type MasterCatalog,
} from "@/lib/catalog";
import { TargetsPerSetInput } from "@/components/TargetsPerSetInput";
import { practiceAct } from "@/lib/practiceApi";
import { saveHostToken } from "@/lib/practiceHost";
import { defaultPracticeFormat, type PracticePlayer } from "@/lib/practiceTypes";
import { targetsFitBestOf, trimTargetsToBestOf } from "@/lib/targetsInput";
import { DEFAULT_LOGO } from "@/lib/tournaments";
import type { Format } from "@/lib/types";

export default function NewPractice() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<MasterCatalog | null>(null);
  const [labelA, setLabelA] = useState("Team A");
  const [labelB, setLabelB] = useState("Team B");
  const [teamQ, setTeamQ] = useState({ A: "", B: "" });
  const [sideA, setSideA] = useState<PracticePlayer[]>([]);
  const [sideB, setSideB] = useState<PracticePlayer[]>([]);
  const [qA, setQA] = useState("");
  const [qB, setQB] = useState("");
  const [adhocA, setAdhocA] = useState("");
  const [adhocB, setAdhocB] = useState("");
  const [format, setFormat] = useState<Format>(() => defaultPracticeFormat());
  const [allowPublicScore, setAllowPublicScore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [quickSets, setQuickSets] = useState({ a: 2, b: 1 });
  const [quickDetail, setQuickDetail] = useState("");

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d: MasterCatalog) => setCatalog(d))
      .catch(() => setCatalog({ teams: [], players: [] }));
  }, []);

  const namesA = useMemo(() => new Set(sideA.map((p) => p.name.trim().toLowerCase())), [sideA]);
  const namesB = useMemo(() => new Set(sideB.map((p) => p.name.trim().toLowerCase())), [sideB]);
  const hitsA = filterCatalogPlayers(catalog?.players ?? [], qA, namesA).slice(0, 8);
  const hitsB = filterCatalogPlayers(catalog?.players ?? [], qB, namesB).slice(0, 8);

  const teamHitsA = useMemo(
    () =>
      filterCatalogTeams(
        catalog?.teams ?? [],
        teamQ.A,
        new Set([labelB.trim().toLowerCase()].filter(Boolean)),
      ).slice(0, 8),
    [catalog?.teams, teamQ.A, labelB],
  );
  const teamHitsB = useMemo(
    () =>
      filterCatalogTeams(
        catalog?.teams ?? [],
        teamQ.B,
        new Set([labelA.trim().toLowerCase()].filter(Boolean)),
      ).slice(0, 8),
    [catalog?.teams, teamQ.B, labelA],
  );

  const pickTeam = (side: "A" | "B", t: CatalogTeam) => {
    if (side === "A") {
      setLabelA(t.name);
      setTeamQ((q) => ({ ...q, A: "" }));
    } else {
      setLabelB(t.name);
      setTeamQ((q) => ({ ...q, B: "" }));
    }
  };

  const addCatalog = (side: "A" | "B", p: CatalogPlayer) => {
    const row: PracticePlayer = {
      name: p.name,
      skill: p.skill,
      photo: p.photo,
      source: "catalog",
    };
    if (side === "A") {
      setSideA((s) => [...s, row]);
      setQA("");
    } else {
      setSideB((s) => [...s, row]);
      setQB("");
    }
  };

  const addAdhoc = (side: "A" | "B") => {
    const name = (side === "A" ? adhocA : adhocB).trim();
    if (!name) return;
    const row: PracticePlayer = { name, source: "adhoc", photo: null };
    if (side === "A") {
      setSideA((s) => [...s, row]);
      setAdhocA("");
    } else {
      setSideB((s) => [...s, row]);
      setAdhocB("");
    }
  };

  const removePlayer = (side: "A" | "B", i: number) => {
    const list = side === "A" ? sideA : sideB;
    const p = list[i];
    if (!askConfirm(`Remove "${p.name}" from ${side === "A" ? labelA : labelB}?`)) return;
    if (side === "A") setSideA(list.filter((_, j) => j !== i));
    else setSideB(list.filter((_, j) => j !== i));
  };

  const create = async (mode: "live" | "quick") => {
    const aName = labelA.trim() || "Team A";
    const bName = labelB.trim() || "Team B";
    if (aName.toLowerCase() === bName.toLowerCase()) {
      setMsg("Side names must be different");
      return;
    }
    if (sideA.length < 1 || sideB.length < 1) {
      setMsg("Add at least one player to each side");
      return;
    }
    setBusy(true);
    const r = await practiceAct({
      type: "create",
      mode,
      labelA: aName,
      labelB: bName,
      sideA,
      sideB,
      format,
      allowPublicScore,
    });
    if (!r.ok || !r.match || !r.hostToken) {
      setBusy(false);
      setMsg(r.ok ? "Failed" : r.error);
      return;
    }
    saveHostToken(r.match.id, r.hostToken);

    if (mode === "quick") {
      let setScores: { a: number; b: number }[] | undefined;
      const lines = quickDetail
        .split(/[\n,]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length) {
        setScores = lines
          .map((l) => {
            const m = l.match(/^(\d+)\s*[-:]\s*(\d+)$/);
            return m ? { a: Number(m[1]), b: Number(m[2]) } : null;
          })
          .filter(Boolean) as { a: number; b: number }[];
        if (!setScores.length) setScores = undefined;
      }
      const done = await practiceAct({
        type: "quickResult",
        id: r.match.id,
        hostToken: r.hostToken,
        setsWon: quickSets,
        setScores,
      });
      setBusy(false);
      if (!done.ok) {
        setMsg(done.error);
        router.push(`/practice/${r.match.id}`);
        return;
      }
      router.push(`/practice/${r.match.id}`);
      return;
    }

    setBusy(false);
    router.push(`/practice/${r.match.id}`);
  };

  const sideEditor = (side: "A" | "B") => {
    const list = side === "A" ? sideA : sideB;
    const q = side === "A" ? qA : qB;
    const setQ = side === "A" ? setQA : setQB;
    const adhoc = side === "A" ? adhocA : adhocB;
    const setAdhoc = side === "A" ? setAdhocA : setAdhocB;
    const hits = side === "A" ? hitsA : hitsB;
    const label = side === "A" ? labelA : labelB;
    const setLabel = side === "A" ? setLabelA : setLabelB;
    const tq = side === "A" ? teamQ.A : teamQ.B;
    const teamHits = side === "A" ? teamHitsA : teamHitsB;
    return (
      <div className="card stack" style={{ background: "var(--card2)", padding: 12 }}>
        <h3 style={{ margin: 0 }}>{side === "A" ? "Side A" : "Side B"}</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Side name from master teams, or type a new name (practice only).
        </p>
        <label>
          Side name
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Type a new name or search below"
            aria-label={`Side ${side} name`}
          />
        </label>
        <input
          type="search"
          value={tq}
          onChange={(e) => setTeamQ((prev) => ({ ...prev, [side]: e.target.value }))}
          placeholder="Search master teams…"
          aria-label={`Search master teams for side ${side}`}
        />
        {tq.trim() && (
          <div className="player-pick-list catalog-list">
            {teamHits.map((t) => (
              <button
                key={`${t.id}-${t.name}`}
                type="button"
                className="player-pick"
                style={{ ["--tc" as string]: t.color }}
                onClick={() => pickTeam(side, t)}
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
            {teamHits.length === 0 && <p className="note">No unused master teams match.</p>}
          </div>
        )}

        <h3 style={{ margin: "8px 0 0" }}>Players</h3>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          {list.map((p, i) => (
            <li key={`${p.name}-${i}`} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                {p.name}
                <small className="muted"> · {p.source}</small>
              </span>
              <button className="btn ghost" type="button" onClick={() => removePlayer(side, i)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search master players…"
          aria-label={`Search players for ${label}`}
        />
        {q.trim() && (
          <div className="player-pick-list catalog-list">
            {hits.map((p) => (
              <button key={p.name} type="button" className="player-pick" onClick={() => addCatalog(side, p)}>
                {p.photo ? <img src={p.photo} alt="" /> : <span className="noimg">{p.name[0]}</span>}
                <span className="player-pick-meta">
                  <b>{p.name}</b>
                  <small>{p.skill}</small>
                </span>
              </button>
            ))}
            {hits.length === 0 && <p className="note">No matches.</p>}
          </div>
        )}
        <div className="row">
          <input
            value={adhoc}
            onChange={(e) => setAdhoc(e.target.value)}
            placeholder="New player name (practice only)"
            aria-label={`Ad-hoc player for ${label}`}
          />
          <button className="btn" type="button" onClick={() => addAdhoc(side)}>
            Add
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="sechead">
        <h1>New practice match</h1>
        <a className="btn ghost" href="/practice">
          Back
        </a>
      </div>
      <p className="note">
        Side names and players can come from the tournament master list (read-only), or typed as new names for this
        practice only — nothing is written back into tournament data.
      </p>

      <section className="card stack">
        <h2>Sides</h2>
        {sideEditor("A")}
        {sideEditor("B")}
      </section>

      <section className="card stack">
        <h2>Format</h2>
        <div className="fields">
          <label>
            Best of
            <select
              value={format.bestOf}
              onChange={(e) => {
                const bestOf = Number(e.target.value);
                setFormat({
                  ...format,
                  bestOf,
                  targets: trimTargetsToBestOf(bestOf, format.targets),
                });
              }}
            >
              {[1, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Points per set
            <TargetsPerSetInput
              value={format.targets}
              bestOf={format.bestOf}
              onChange={(targets) => setFormat({ ...format, targets })}
            />
          </label>
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={allowPublicScore}
            onChange={(e) => setAllowPublicScore(e.target.checked)}
          />
          Allow anyone with the link to score (host can always score)
        </label>
      </section>

      <section className="card stack">
        <h2>Quick result (optional path)</h2>
        <p className="muted" style={{ margin: 0 }}>
          Sets won required. Optional per-set scores like <code>21-18, 19-21, 15-12</code>.
        </p>
        <div className="fields">
          <label>
            Sets {labelA}
            <input
              type="number"
              min={0}
              value={quickSets.a}
              onChange={(e) => setQuickSets({ ...quickSets, a: Number(e.target.value) })}
            />
          </label>
          <label>
            Sets {labelB}
            <input
              type="number"
              min={0}
              value={quickSets.b}
              onChange={(e) => setQuickSets({ ...quickSets, b: Number(e.target.value) })}
            />
          </label>
        </div>
        <label>
          Per-set scores (optional)
          <input value={quickDetail} onChange={(e) => setQuickDetail(e.target.value)} placeholder="21-18, 19-21, 15-12" />
        </label>
      </section>

      <div className="row">
        <button
          className="btn gold"
          type="button"
          disabled={busy || !!targetsFitBestOf(format.bestOf, format.targets)}
          aria-busy={busy}
          onClick={() => create("live")}
        >
          {busy ? "Starting…" : "Start live match"}
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy || !!targetsFitBestOf(format.bestOf, format.targets)}
          aria-busy={busy}
          onClick={() => create("quick")}
        >
          {busy ? "Saving…" : "Save quick result"}
        </button>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
