"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { nextBidAmounts } from "@/lib/auction";
import { playerId } from "@/lib/season";
import type { AuctionSettings, Team } from "@/lib/types";
import { useLive } from "@/components/LiveProvider";
import { AuctionOwnerGate, Loading, Logo } from "@/components/ui";
import { useAuctionPoll } from "@/components/useAuctionPoll";

export default function AuctionOwnerPage() {
  return (
    <AuctionOwnerGate>
      <OwnerInner />
    </AuctionOwnerGate>
  );
}

function OwnerInner() {
  const { act, ownerTeamId, role, logout, team } = useLive();
  const myTeamId = ownerTeamId;
  const { data, error, refresh } = useAuctionPoll({ private: true, intervalMs: 1000 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [typed, setTyped] = useState("");
  const [adminTeam, setAdminTeam] = useState("");

  const auction = data?.auction;
  const teams = data?.teams ?? [];
  const players = data?.players ?? [];
  const settings = data?.settings;

  const effectiveTeamId = role === "admin" ? adminTeam || teams[0]?.id || "" : myTeamId || "";
  const myTeam = teams.find((t) => t.id === effectiveTeamId) || team(effectiveTeamId);
  const ts = auction && effectiveTeamId ? auction.teams[effectiveTeamId] : undefined;

  const playerMap = useMemo(() => new Map(players.map((p) => [p.no, p])), [players]);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const current = auction?.current;
  const pl = current ? playerMap.get(current.no) : undefined;
  const priv =
    pl && data?.privateMap
      ? data.privateMap[playerId({ id: pl.id, no: pl.no })] ??
        Object.values(data.privateMap).find((x) => x.id === pl.id)
      : undefined;
  const highTeam = current?.highBid ? teamMap.get(current.highBid.teamId) : undefined;
  const iLead = !!(current?.highBid && current.highBid.teamId === effectiveTeamId);

  const highRef = useRef<{ no: number; amount: number; teamId: string } | null>(null);
  useEffect(() => {
    if (!current?.highBid || !effectiveTeamId) return;
    const prev = highRef.current;
    const cur = { no: current.no, amount: current.highBid.amount, teamId: current.highBid.teamId };
    if (
      prev &&
      prev.no === cur.no &&
      prev.teamId === effectiveTeamId &&
      cur.teamId !== effectiveTeamId &&
      cur.amount > prev.amount
    ) {
      setToast(`Outbid: ${cur.amount}`);
      try {
        navigator.vibrate?.(200);
      } catch {
        /* ignore */
      }
      setTimeout(() => setToast(""), 3500);
    }
    highRef.current = cur;
  }, [current?.highBid, current?.no, effectiveTeamId]);

  const runBid = useCallback(
    async (amount: number) => {
      if (!effectiveTeamId || !current || !auction) return;
      setBusy(true);
      setMsg("");
      const r = await act(
        "auctionBid",
        {
          teamId: effectiveTeamId,
          amount,
          expect: { no: current.no, highAmount: current.highBid?.amount ?? 0 },
        },
        { noAccept: true },
      );
      setBusy(false);
      if (!r.ok) {
        setMsg(r.error ?? "Bid failed");
        if (r.error?.startsWith("Outbid")) {
          setToast(r.error);
          try {
            navigator.vibrate?.(200);
          } catch {
            /* ignore */
          }
          setTimeout(() => setToast(""), 3500);
        }
      } else {
        setTyped("");
        await refresh();
      }
    },
    [act, auction, current, effectiveTeamId, refresh],
  );

  if (!data || !auction || !settings) {
    return error ? <div className="error">{error}</div> : <Loading label="Loading…" />;
  }

  if (!effectiveTeamId && role === "admin") {
    return (
      <div className="card stack">
        <h2>Pick a team to bid as</h2>
        <select value={adminTeam} onChange={(e) => setAdminTeam(e.target.value)}>
          <option value="">Team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (!effectiveTeamId || !ts || !myTeam) {
    return <div className="error">Team not found. Log in again with your owner PIN.</div>;
  }

  const { quick, min } = nextBidAmounts(auction, settings as AuctionSettings, effectiveTeamId);
  let disabledReason = "";
  if (auction.status === "not-started") disabledReason = "Auction not started";
  else if (auction.status === "paused") disabledReason = "Auction is paused";
  else if (auction.status === "complete") disabledReason = "Auction complete";
  else if (!current) disabledReason = "Waiting for next player";
  else if (!current.revealed) disabledReason = "Not revealed yet";
  else if (!ts.eligible) disabledReason = ts.reason ?? "Not eligible";
  else if (current.highBid?.teamId === effectiveTeamId) disabledReason = "You're leading";
  else if (quick > ts.maxBid) disabledReason = `Exceeds max bid ${ts.maxBid}`;

  const canBid = !disabledReason && !busy;
  const onBlock = current && pl && current.revealed ? { current, pl } : null;
  const padNo = onBlock ? String(onBlock.current.no).padStart(2, "0") : "";

  return (
    <div className="auc-owner">
      <div className="auc-owner-scroll">
        <header className="auc-owner-head">
          <div className="auc-owner-brand">
            <Logo team={myTeam as unknown as Team} size={40} />
            <div>
              <span className="kicker">Owner · R{auction.round || "—"}</span>
              <h1 className="auc-owner-team">{myTeam.name}</h1>
            </div>
          </div>
          <div className="auc-owner-head-actions">
            <span className={`pill ${auction.status === "paused" ? "done" : "live"}`}>{auction.status}</span>
            <button type="button" className="btn ghost" onClick={logout}>
              Log out
            </button>
          </div>
        </header>

        {role === "admin" && (
          <select
            className="auc-owner-admin-select"
            value={effectiveTeamId}
            onChange={(e) => setAdminTeam(e.target.value)}
            aria-label="Bid as team"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <section
          className="auc-owner-purse"
          style={{ ["--team-color" as string]: myTeam.color } as CSSProperties}
        >
          <div className="auc-owner-purse-stat">
            <span className="auc-owner-purse-label">Balance</span>
            <span className="auc-owner-purse-value">{ts.balance.toLocaleString()}</span>
          </div>
          <div className="auc-owner-purse-stat accent">
            <span className="auc-owner-purse-label">Max bid</span>
            <span className="auc-owner-purse-value">{ts.maxBid.toLocaleString()}</span>
          </div>
          <div className="auc-owner-purse-meta">
            <span className="pill done">
              {ts.bought}/{settings.minPlayers} bought
            </span>
            <span className="pill done">Need {ts.slotsToMin}</span>
          </div>
          {ts.squad.length > 0 && (
            <ul className="auc-owner-squad">
              {ts.squad.map((s) => (
                <li key={s.no}>
                  <span>
                    #{String(s.no).padStart(2, "0")} {playerMap.get(s.no)?.name ?? ""}
                  </span>
                  <b>{s.amount}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="auc-owner-player">
          {onBlock ? (
            <>
              <div className="auc-owner-player-top">
                <div className="auc-owner-photo">
                  {onBlock.pl.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={onBlock.pl.photo} alt="" />
                  ) : (
                    <span>{onBlock.pl.name[0]}</span>
                  )}
                </div>
                <div className="auc-owner-player-copy">
                  <span className="auc-owner-eyebrow">On the block · #{padNo}</span>
                  <h2 className="auc-owner-name">{onBlock.pl.name}</h2>
                  <span className={`skill auc-owner-skill ${onBlock.pl.skill}`}>{onBlock.pl.skill}</span>
                </div>
              </div>

              {/* Private contact — desktop/tablet only; hidden on phones so bid stays above the fold */}
              <div className="auc-owner-meta">
                <div className="auc-owner-meta-card">
                  <span className="auc-owner-meta-label">Tower / Flat</span>
                  <span className="auc-owner-meta-value">{priv?.tower || "—"}</span>
                </div>
                <div className="auc-owner-meta-card">
                  <span className="auc-owner-meta-label">Age</span>
                  <span className="auc-owner-meta-value">{priv?.age || "—"}</span>
                </div>
                <div className="auc-owner-meta-card wide">
                  <span className="auc-owner-meta-label">Phone</span>
                  <span className="auc-owner-meta-value">{priv?.phone || "—"}</span>
                </div>
              </div>

              <div
                className={`auc-owner-high ${onBlock.current.highBid ? "has-bid" : ""} ${iLead ? "mine" : ""}`}
                style={
                  highTeam
                    ? ({ ["--bid-team" as string]: highTeam.color } as CSSProperties)
                    : undefined
                }
              >
                {onBlock.current.highBid && highTeam ? (
                  <>
                    <div className="auc-owner-high-team">
                      <Logo team={highTeam as unknown as Team} size={40} />
                      <div>
                        <span className="auc-owner-high-label">
                          {iLead ? "You are leading" : "Leading team"}
                        </span>
                        <span className="auc-owner-high-name">{highTeam.name}</span>
                      </div>
                    </div>
                    <div className="auc-owner-high-amt-wrap">
                      <span className="auc-owner-high-label">Current bid</span>
                      <span className="auc-owner-high-amt">{onBlock.current.highBid.amount}</span>
                      <span className="auc-owner-high-base">Base {onBlock.current.openingBase}</span>
                    </div>
                  </>
                ) : (
                  <div className="auc-owner-high-waiting">
                    <span className="auc-owner-high-label">No bids yet</span>
                    <span className="auc-owner-high-amt muted">Base {onBlock.current.openingBase}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="auc-owner-wait">
              <p className="muted">{disabledReason || "Waiting for next player…"}</p>
            </div>
          )}
        </section>
      </div>

      <section className="auc-owner-actions">
        <button
          className="btn gold auc-owner-bid-main"
          type="button"
          disabled={!canBid}
          onClick={() => runBid(quick)}
        >
          {busy ? "Bidding…" : `Bid ${quick}`}
        </button>
        {disabledReason && <p className="auc-owner-reason">{disabledReason}</p>}
        <div className="auc-owner-custom">
          <input
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`Custom · min ${min}`}
            aria-label="Custom bid"
          />
          <button
            className="btn"
            type="button"
            disabled={!canBid || !typed}
            onClick={() => runBid(Number(typed))}
          >
            Place
          </button>
        </div>
        {msg && <p className="error">{msg}</p>}
      </section>

      {toast && (
        <div className="auc-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
