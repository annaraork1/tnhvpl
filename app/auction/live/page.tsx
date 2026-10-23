"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { useLive } from "@/components/LiveProvider";
import { Loading, Logo } from "@/components/ui";
import { useAuctionPoll } from "@/components/useAuctionPoll";
import type { Team } from "@/lib/types";

/**
 * Public live auction viewer — no login.
 * Shows current lot (name / skill / photo only), leading bid, and recent sales.
 * Private fields (tower, age, phone) are never shown.
 */
export default function AuctionLivePage() {
  const { seasonHref, state } = useLive();
  const { data, error } = useAuctionPoll({ intervalMs: 1000 });
  const auction = data?.auction;
  const teams = data?.teams ?? [];
  const players = data?.players ?? [];
  const settings = data?.settings;

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.no, p])), [players]);

  if (!data || !auction || !settings) {
    return error ? <div className="error">{error}</div> : <Loading label="Loading live auction…" />;
  }

  const current = auction.current;
  const pl = current ? playerMap.get(current.no) : undefined;
  const high = current?.highBid;
  const highTeam = high ? teamMap.get(high.teamId) : undefined;
  const title =
    state?.meta?.name || state?.config.tournament.name || state?.tournamentKey || "Auction";

  const recentSold = Object.entries(auction.sold)
    .map(([no, s]) => ({ no: Number(no), ...s, name: playerMap.get(Number(no))?.name }))
    .sort((a, b) => b.round - a.round || b.no - a.no)
    .slice(0, 8);

  const padNo = current ? String(current.no).padStart(2, "0") : "";

  return (
    <div className="auc-live">
      <header className="auc-live-head">
        <div>
          <span className="kicker">Public · no login</span>
          <h1 className="auc-live-title">{title}</h1>
          <p className="auc-live-meta">
            Round {auction.round || "—"} · Sold {Object.keys(auction.sold).length}/{players.length}
            {" · "}
            <span className={`pill ${auction.status === "complete" ? "done" : "live"}`}>{auction.status}</span>
          </p>
        </div>
        <Link className="btn ghost" href={seasonHref("/auction/board")}>
          Purse board
        </Link>
      </header>

      <section className="auc-live-lot">
        {auction.status === "not-started" && (
          <p className="auc-live-wait">Auction hasn’t started yet.</p>
        )}
        {auction.status === "complete" && <p className="auc-live-wait">Auction complete.</p>}
        {auction.status === "round-complete" && (
          <p className="auc-live-wait">
            Round {auction.round} done · {auction.unsold.length} unsold
          </p>
        )}

        {current && (
          <>
            <div className="auc-live-player">
              <div className="auc-live-photo">
                {current.revealed && pl?.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pl.photo} alt="" />
                ) : (
                  <span>{current.revealed ? (pl?.name?.[0] ?? "?") : "?"}</span>
                )}
              </div>
              <div className="auc-live-copy">
                <span className="auc-live-eyebrow">On the block · #{padNo}</span>
                {current.revealed && pl ? (
                  <>
                    <h2 className="auc-live-name">{pl.name}</h2>
                    <span className={`skill ${pl.skill}`}>{pl.skill}</span>
                  </>
                ) : (
                  <h2 className="auc-live-name">Drawing…</h2>
                )}
              </div>
            </div>

            {current.revealed && (
              <div
                className={`auc-live-bid ${high ? "has-bid" : ""}`}
                style={
                  highTeam
                    ? ({ ["--bid-team" as string]: highTeam.color } as CSSProperties)
                    : undefined
                }
              >
                {high && highTeam ? (
                  <>
                    <div className="auc-live-bid-team">
                      <Logo team={highTeam as unknown as Team} size={48} />
                      <div>
                        <span className="auc-live-bid-label">Leading</span>
                        <span className="auc-live-bid-name">{highTeam.name}</span>
                      </div>
                    </div>
                    <div className="auc-live-bid-amt-wrap">
                      <span className="auc-live-bid-label">Current bid</span>
                      <span className="auc-live-bid-amt">{high.amount}</span>
                    </div>
                  </>
                ) : (
                  <div className="auc-live-bid-waiting">
                    <span className="auc-live-bid-label">Waiting for bids</span>
                    <span className="auc-live-bid-amt muted">Base {current.openingBase}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!current && auction.status !== "not-started" && auction.status !== "complete" && auction.status !== "round-complete" && (
          <p className="auc-live-wait">Waiting for next player…</p>
        )}
      </section>

      <section className="auc-live-sold">
        <div className="sechead">
          <h2 style={{ margin: 0, fontSize: 18 }}>Recently sold</h2>
          <Link href={seasonHref("/auction/board")}>All teams →</Link>
        </div>
        {recentSold.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No sales yet.
          </p>
        ) : (
          <ul className="auc-live-sold-list">
            {recentSold.map((s) => {
              const t = teamMap.get(s.teamId);
              return (
                <li key={s.no}>
                  <span className="auc-live-sold-player">
                    #{String(s.no).padStart(2, "0")} {s.name ?? "Player"}
                  </span>
                  <span className="auc-live-sold-team">
                    {t && <Logo team={t as unknown as Team} size={22} />}
                    {t?.short ?? s.teamId}
                  </span>
                  <span className="auc-live-sold-amt">{s.amount}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
