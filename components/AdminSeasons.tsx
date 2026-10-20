"use client";

import Link from "next/link";
import { useState } from "react";
import { fileToLogoDataUrl } from "@/lib/logoUpload";
import { DEFAULT_LOGO } from "@/lib/tournaments";
import { useLive } from "./LiveProvider";

export function AdminSeasons() {
  const { state, act, refresh } = useLive();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [short, setShort] = useState("TNHVPL");
  const [subtitle, setSubtitle] = useState("");
  const [dates, setDates] = useState("");
  const [logo, setLogo] = useState(DEFAULT_LOGO);
  const [mode, setMode] = useState<"clone" | "blank">("clone");
  const [cloneFrom, setCloneFrom] = useState("");

  if (!state) return null;
  const list = [...state.registry.tournaments].sort((a, b) => b.createdAt - a.createdAt);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? "" : x)), 2800);
  };

  const run = async (type: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const r = await act(type, payload);
    setBusy(false);
    flash(r.ok ? ok : r.error ?? "Failed");
    if (r.ok) await refresh(true);
    return r.ok;
  };

  const onLogoFile = async (file: File | null) => {
    if (!file) return;
    try {
      setBusy(true);
      const dataUrl = await fileToLogoDataUrl(file);
      setLogo(dataUrl);
      setBusy(false);
      flash("Logo ready — create the tournament or save on a season below");
    } catch (e) {
      setBusy(false);
      flash(e instanceof Error ? e.message : "Logo failed");
    }
  };

  return (
    <section className="card stack">
      <h2>Tournaments / seasons</h2>
      <p className="note">
        Each season has its own key (e.g. <code>tnhvpl-s5</code>), with separate rules, match format, teams, players,
        fixtures, awards and scores. The <b>active</b> key is what everyone sees by default. Share{" "}
        <code>/s/your-key</code> or <code>/?season=your-key</code> for archives. Logo is the nav brand for that season.
      </p>

      <div className="stack" style={{ gap: 10 }}>
        {list.map((t) => {
          const isActive = t.key === state.registry.activeKey;
          return (
            <div key={t.key} className="card row" style={{ background: "var(--card2)", padding: 12, flexWrap: "wrap", gap: 12 }}>
              <img className="logo-preview" src={t.logo || DEFAULT_LOGO} alt="" />
              <div className="stack" style={{ gap: 2, flex: 1, minWidth: 160 }}>
                <b>
                  {t.key} {isActive ? "· ACTIVE" : ""}
                </b>
                <span>
                  {t.name} · {t.dates}
                </span>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <Link className="btn ghost" href={`/?season=${encodeURIComponent(t.key)}`}>
                  Open
                </Link>
                {!isActive && (
                  <button
                    className="btn gold"
                    type="button"
                    disabled={busy}
                    onClick={() => run("setActiveTournament", { key: t.key }, `${t.key} is now active`)}
                  >
                    Set active
                  </button>
                )}
                <label className="btn ghost" style={{ cursor: "pointer" }}>
                  Change logo
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        setBusy(true);
                        const dataUrl = await fileToLogoDataUrl(f);
                        await run("updateTournamentMeta", { key: t.key, logo: dataUrl }, "Logo updated");
                      } catch (err) {
                        flash(err instanceof Error ? err.message : "Logo failed");
                        setBusy(false);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ margin: "8px 0 0" }}>Create tournament</h3>
      <div className="fields">
        <label>
          Key (permanent)
          <input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="tnhvpl-s6" />
        </label>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="TNHVPL Season 6" />
        </label>
        <label>
          Short
          <input value={short} onChange={(e) => setShort(e.target.value)} placeholder="TNHVPL" />
        </label>
        <label>
          Subtitle
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="TNH Volleyball · Season 6" />
        </label>
        <label>
          Dates
          <input value={dates} onChange={(e) => setDates(e.target.value)} placeholder="Oct 2027" />
        </label>
        <label>
          Start from
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "clone" | "blank")}
          >
            <option value="clone">Clone a season (teams/players/rules, clear scores)</option>
            <option value="blank">Blank (add everything from scratch)</option>
          </select>
        </label>
        {mode === "clone" && (
          <label>
            Clone from
            <select value={cloneFrom || state.registry.activeKey} onChange={(e) => setCloneFrom(e.target.value)}>
              {list.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.key} — {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <img className="logo-preview" src={logo || DEFAULT_LOGO} alt="" />
        <label className="btn ghost" style={{ cursor: "pointer" }}>
          Upload logo
          <input type="file" accept="image/*" hidden onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)} />
        </label>
        <button
          className="btn"
          type="button"
          onClick={() => setLogo(DEFAULT_LOGO)}
        >
          Use default logo
        </button>
      </div>
      <div>
        <button
          className="btn gold"
          type="button"
          disabled={busy || !key || !name}
          onClick={async () => {
            const ok = await run(
              "createTournament",
              {
                key,
                name,
                short,
                subtitle,
                dates,
                logo,
                mode,
                cloneFrom: cloneFrom || state.registry.activeKey,
              },
              `Created ${key}`,
            );
            if (ok) {
              setKey("");
              setName("");
            }
          }}
        >
          Create tournament
        </button>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </section>
  );
}
