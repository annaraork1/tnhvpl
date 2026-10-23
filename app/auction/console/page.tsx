"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { nextBidAmounts } from "@/lib/auction";
import { playerId } from "@/lib/season";
import type { AuctionSettings, Team } from "@/lib/types";
import { useLive } from "@/components/LiveProvider";
import { AuctionStaffGate, Loading, Logo } from "@/components/ui";
import { useAuctionPoll } from "@/components/useAuctionPoll";

export default function AuctionConsolePage() {
  return (
    <AuctionStaffGate>
      <ConsoleInner />
    </AuctionStaffGate>
  );
}

function ConsoleInner() {
  const { act, logout, role } = useLive();
  const { data, error, refresh } = useAuctionPoll({ private: true, intervalMs: 1000 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [typedAmount, setTypedAmount] = useState("");
  const [typedTeam, setTypedTeam] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [spinNo, setSpinNo] = useState<number | null>(null);
  const [fixNo, setFixNo] = useState<number | null>(null);
  const [fixTeam, setFixTeam] = useState("");
  const [fixAmount, setFixAmount] = useState("");
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const auction = data?.auction;
  const teams = data?.teams ?? [];
  const players = data?.players ?? [];
  const settings = data?.settings;

  const playerMap = useMemo(() => new Map(players.map((p) => [p.no, p])), [players]);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const currentPlayer = auction?.current ? playerMap.get(auction.current.no) : undefined;
  const currentPriv =
    currentPlayer && data?.privateMap
      ? data.privateMap[playerId({ id: currentPlayer.id, no: currentPlayer.no })] ??
        Object.values(data.privateMap).find((p) => p.id === currentPlayer.id)
      : undefined;

  const run = useCallback(
    async (type: string, payload: Record<string, unknown> = {}) => {
      setBusy(true);
      setMsg("");
      const r = await act(type, payload, { noAccept: true });
      setBusy(false);
      if (!r.ok) setMsg(r.error ?? "Failed");
      else await refresh();
      return r;
    },
    [act, refresh],
  );

  const startSpin = useCallback(
    (finalNo: number) => {
      if (spinTimer.current) clearInterval(spinTimer.current);
      setSpinning(true);
      const pool = auction?.pool?.length
        ? [...auction.pool, finalNo]
        : players.map((p) => p.no);
      let n = 0;
      spinTimer.current = setInterval(() => {
        setSpinNo(pool[n % pool.length] ?? finalNo);
        n++;
      }, 60);
      setTimeout(() => {
        if (spinTimer.current) clearInterval(spinTimer.current);
        setSpinNo(finalNo);
        setSpinning(false);
      }, 900);
    },
    [auction?.pool, players],
  );

  const onDraw = useCallback(async () => {
    const before = auction?.current?.no;
    const r = await run("auctionDraw");
    if (r.ok) {
      // Refresh to learn drawn number, then spin toward it.
      await refresh();
    }
    void before;
  }, [auction?.current?.no, refresh, run]);

  // When a new unrevealed current appears, run spin UX once.
  const lastDrawn = useRef<number | null>(null);
  useEffect(() => {
    const no = auction?.current && !auction.current.revealed ? auction.current.no : null;
    if (no != null && no !== lastDrawn.current) {
      lastDrawn.current = no;
      startSpin(no);
    }
    if (!auction?.current) lastDrawn.current = null;
  }, [auction?.current, startSpin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (busy || spinning) return;
      const st = auction?.status;
      if (e.code === "Space") {
        e.preventDefault();
        if (!auction?.current) void run("auctionDraw");
        else if (!auction.current.revealed) void run("auctionReveal");
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "s" && auction?.current?.highBid) void run("auctionSold");
      if (key === "u" && auction?.current) void run("auctionUnsold");
      if (key === "z") void run("auctionUndo");
      if (key === "p") {
        if (st === "paused") void run("auctionResume");
        else void run("auctionPause");
      }
      const digit = Number(e.key);
      if (digit >= 1 && digit <= 9 && auction?.current?.revealed && settings) {
        const team = teams[digit - 1];
        if (!team) return;
        const ts = auction.teams[team.id];
        if (!ts?.eligible) return;
        const { quick } = nextBidAmounts(auction, settings as AuctionSettings, team.id);
        void run("auctionBid", { teamId: team.id, amount: quick });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auction, busy, run, settings, spinning, teams]);

  if (!data || !auction || !settings) {
    return error ? <div className="error">{error}</div> : <Loading label="Loading auction…" />;
  }

  const soldCount = Object.keys(auction.sold).length;
  const total = players.length;
  const displayNo = spinning ? spinNo : auction.current?.no ?? null;
  const revealed = !!auction.current?.revealed && !spinning;

  return (
    <div className="stack" style={{ gap: 16, paddingBottom: 40 }}>
      <div className="sechead">
        <div>
          <span className="kicker">Auction console</span>
          <h1 style={{ margin: "4px 0 0", fontSize: 28 }}>Round {auction.round || "—"}</h1>
        </div>
        <div className="row">
          <span className={`pill ${auction.status === "paused" ? "done" : "live"}`}>{auction.status}</span>
          <button type="button" className="btn ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="pill done">Sold {soldCount}</span>
        <span className="pill done">Pool {auction.pool.length}</span>
        <span className="pill done">Unsold {auction.unsold.length}</span>
        <span className="pill done">Leftover {auction.leftover}</span>
        {auction.leftoverStage && <span className="pill live">Leftover stage</span>}
      </div>

      {msg && <p className="error">{msg}</p>}

      <section className="card stack" style={{ textAlign: "center", minHeight: 280 }}>
        {auction.status === "not-started" ? (
          <>
            <p className="muted">Auction has not started.</p>
            <button className="btn gold" type="button" disabled={busy} onClick={() => run("auctionStart")}>
              Start auction
            </button>
          </>
        ) : auction.status === "complete" || auction.completedAt ? (
          <>
            <p className="muted">Auction complete.</p>
            {role === "admin" && auction.completedAt ? (
              <p className="muted">Squads locked · stage fixtures</p>
            ) : role === "admin" ? (
              <button className="btn gold" type="button" disabled={busy} onClick={() => run("auctionFinish")}>
                Finish &amp; lock squads
              </button>
            ) : null}
          </>
        ) : auction.status === "round-complete" ? (
          <>
            <p className="muted">Round {auction.round} complete · {auction.unsold.length} unsold</p>
            <button className="btn gold" type="button" disabled={busy} onClick={() => run("auctionNextRound")}>
              Start round {auction.round + 1}
            </button>
          </>
        ) : (
          <>
            <div className={`auc-ball ${spinning ? "spin" : ""} ${revealed ? "pop" : ""}`}>
              <span className="num">{displayNo != null ? String(displayNo).padStart(2, "0") : "?"}</span>
            </div>
            {revealed && currentPlayer ? (
              <>
                {currentPlayer.photo && (
                  <img
                    className="auc-console-photo"
                    src={currentPlayer.photo}
                    alt=""
                    width={96}
                    height={96}
                  />
                )}
                <div className="auc-pname">{currentPlayer.name}</div>
                <span className={`skill ${currentPlayer.skill}`}>{currentPlayer.skill}</span>
                {currentPriv && (
                  <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                    {currentPriv.tower ? `Tower ${currentPriv.tower}` : ""}
                    {currentPriv.age ? ` · Age ${currentPriv.age}` : ""}
                    {currentPriv.phone ? ` · ${currentPriv.phone}` : ""}
                  </p>
                )}
                <p style={{ margin: 0, fontFamily: "var(--display)", fontSize: 22 }}>
                  Base {auction.current?.openingBase}
                  {auction.current?.highBid && (
                    <>
                      {" "}
                      · High{" "}
                      <b style={{ color: "var(--gold)" }}>{auction.current.highBid.amount}</b>{" "}
                      {teamMap.get(auction.current.highBid.teamId)?.name}
                    </>
                  )}
                </p>
              </>
            ) : auction.current && !auction.current.revealed && !spinning ? (
              <p className="muted">Number drawn — press Reveal (or Space)</p>
            ) : spinning ? (
              <p className="muted">Drawing…</p>
            ) : !auction.current ? (
              <p className="muted">Ready to draw — Space or Draw</p>
            ) : null}

            <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
              {!auction.current && (
                <button className="btn gold" type="button" disabled={busy || auction.status === "paused"} onClick={() => onDraw()}>
                  Draw
                </button>
              )}
              {auction.current && !auction.current.revealed && (
                <button className="btn gold" type="button" disabled={busy || spinning} onClick={() => run("auctionReveal")}>
                  Reveal
                </button>
              )}
              {auction.current?.revealed && (
                <>
                  <button
                    className="btn sold"
                    type="button"
                    disabled={busy || !auction.current.highBid}
                    onClick={() => run("auctionSold")}
                  >
                    Sold
                  </button>
                  <button className="btn unsold" type="button" disabled={busy} onClick={() => run("auctionUnsold")}>
                    Unsold
                  </button>
                </>
              )}
              {auction.status === "paused" ? (
                <button className="btn" type="button" disabled={busy} onClick={() => run("auctionResume")}>
                  Resume
                </button>
              ) : (
                <button className="btn ghost" type="button" disabled={busy} onClick={() => run("auctionPause")}>
                  Pause
                </button>
              )}
              <button className="btn ghost" type="button" disabled={busy} onClick={() => run("auctionUndo")}>
                Undo
              </button>
            </div>
          </>
        )}
      </section>

      {auction.current?.revealed && (
        <section className="card stack">
          <div className="sechead">
            <h2 style={{ margin: 0 }}>Bid</h2>
          </div>
          <div className="auc-bid-grid">
            {teams.map((t) => {
              const ts = auction.teams[t.id];
              const { quick } = nextBidAmounts(auction, settings as AuctionSettings, t.id);
              const disabled = busy || !ts?.eligible || auction.status === "paused" || auction.current?.highBid?.teamId === t.id;
              const reason =
                auction.current?.highBid?.teamId === t.id
                  ? "Leading"
                  : ts?.reason || (!ts?.eligible ? "Ineligible" : "");
              return (
                <button
                  key={t.id}
                  type="button"
                  className="btn"
                  style={{ borderColor: t.color, opacity: disabled ? 0.45 : 1 }}
                  disabled={disabled}
                  title={reason}
                  onClick={() => run("auctionBid", { teamId: t.id, amount: quick })}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <Logo team={t as unknown as Team} size={24} />
                    {t.short} · {quick}
                  </span>
                  {reason && disabled && (
                    <span className="muted" style={{ display: "block", fontSize: 11, marginTop: 4 }}>
                      {reason}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="row" style={{ alignItems: "stretch" }}>
            <select value={typedTeam} onChange={(e) => setTypedTeam(e.target.value)} aria-label="Team" style={{ flex: 1 }}>
              <option value="">Team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              inputMode="numeric"
              value={typedAmount}
              onChange={(e) => setTypedAmount(e.target.value)}
              placeholder="Amount"
              aria-label="Bid amount"
              style={{ width: 100 }}
            />
            <button
              className="btn gold"
              type="button"
              disabled={busy || !typedTeam || !typedAmount}
              onClick={() =>
                run("auctionBid", { teamId: typedTeam, amount: Number(typedAmount) }).then((r) => {
                  if (r.ok) {
                    setTypedAmount("");
                  }
                })
              }
            >
              Bid
            </button>
          </div>
          {auction.current.bids.length > 0 && (
            <ol className="event-log" style={{ margin: 0, paddingLeft: 18, maxHeight: 160, overflow: "auto" }}>
              {[...auction.current.bids].reverse().map((b, i) => (
                <li key={`${b.t}-${i}`}>
                  <span className="event-log-text">
                    {teamMap.get(b.teamId)?.short ?? b.teamId} · {b.amount}
                    {b.by === "owner" ? " · owner phone" : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="card stack">
        <div className="sechead">
          <h2 style={{ margin: 0 }}>Board 1–{total || "N"}</h2>
          <span className="muted">Tap a number to correct</span>
        </div>
        <div className="auc-board">
          {players
            .slice()
            .sort((a, b) => a.no - b.no)
            .map((p) => {
              const sale = auction.sold[p.no];
              const unsold = auction.unsold.includes(p.no);
              const current = auction.current?.no === p.no;
              const tc = sale ? teamMap.get(sale.teamId)?.color : undefined;
              return (
                <button
                  key={p.no}
                  type="button"
                  className={`auc-cell ${sale ? "sold" : ""} ${unsold ? "unsold" : ""} ${current ? "current" : ""}`}
                  style={tc ? ({ ["--tc" as string]: tc } as CSSProperties) : undefined}
                  onClick={() => {
                    setFixNo(p.no);
                    setFixTeam(sale?.teamId ?? teams[0]?.id ?? "");
                    setFixAmount(sale ? String(sale.amount) : String(settings.basePriceBySkill[p.skill] ?? 100));
                  }}
                >
                  {p.no}
                </button>
              );
            })}
        </div>
      </section>

      {fixNo != null && (
        <div className="auc-toast" style={{ bottom: "auto", top: "20%", transform: "translateX(-50%)", borderRadius: 16, padding: 16, maxWidth: 360 }}>
          <div className="stack" style={{ textAlign: "left" }}>
            <strong>Fix player #{fixNo}</strong>
            <select value={fixTeam} onChange={(e) => setFixTeam(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input inputMode="numeric" value={fixAmount} onChange={(e) => setFixAmount(e.target.value)} placeholder="Amount" />
            <div className="row">
              <button
                className="btn sold"
                type="button"
                disabled={busy}
                onClick={async () => {
                  await run("auctionFix", {
                    no: fixNo,
                    to: { status: "sold", teamId: fixTeam, amount: Number(fixAmount) },
                  });
                  setFixNo(null);
                }}
              >
                Sold
              </button>
              <button
                className="btn unsold"
                type="button"
                disabled={busy}
                onClick={async () => {
                  await run("auctionFix", { no: fixNo, to: { status: "unsold" } });
                  setFixNo(null);
                }}
              >
                Unsold
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={async () => {
                  await run("auctionFix", { no: fixNo, to: { status: "pool" } });
                  setFixNo(null);
                }}
              >
                Pool
              </button>
              <button className="btn ghost" type="button" onClick={() => setFixNo(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        Keys: Space draw/reveal · 1–9 team bid · S sold · U unsold · Z undo · P pause
      </p>
    </div>
  );
}
