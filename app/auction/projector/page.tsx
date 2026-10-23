"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { fireConfetti } from "@/components/Confetti";
import { AuctionStaffGate, Loading, Logo } from "@/components/ui";
import { useAuctionPoll } from "@/components/useAuctionPoll";
import { playerId } from "@/lib/season";
import type { Team } from "@/lib/types";

export default function AuctionProjectorPage() {
  return (
    <AuctionStaffGate>
      <ProjectorInner />
    </AuctionStaffGate>
  );
}

function ProjectorInner() {
  const { data, error, season } = useAuctionPoll({ private: true, intervalMs: 1000 });
  const auction = data?.auction;
  const teams = data?.teams ?? [];
  const players = data?.players ?? [];
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.no, p])), [players]);

  const current = auction?.current;
  const pl = current ? playerMap.get(current.no) : undefined;
  const priv =
    pl && data?.privateMap
      ? data.privateMap[playerId({ id: pl.id, no: pl.no })] ??
        Object.values(data.privateMap).find((x) => x.id === pl.id)
      : undefined;

  const lastSold = useRef<string | null>(null);
  useEffect(() => {
    if (!auction) return;
    const sig = `${Object.keys(auction.sold).length}:${auction.current?.no ?? "-"}`;
    if (lastSold.current == null) {
      lastSold.current = sig;
      return;
    }
    if (sig === lastSold.current) return;
    const prevCount = Number(lastSold.current.split(":")[0]);
    const nextCount = Object.keys(auction.sold).length;
    lastSold.current = sig;
    if (nextCount > prevCount && !auction.current) {
      const last = Object.entries(auction.sold).sort((a, b) => b[1].round - a[1].round)[0];
      const color = last ? teamMap.get(last[1].teamId)?.color : undefined;
      fireConfetti({ intensity: "set", colors: color ? [color, "#d4af37", "#f5f1e6"] : undefined });
    }
  }, [auction, teamMap]);

  if (!data || !auction) {
    return (
      <div className="auc-projector">
        {error ? <p className="error">{error}</p> : <Loading label="Loading…" />}
      </div>
    );
  }

  const high = current?.highBid;
  const highTeam = high ? teamMap.get(high.teamId) : undefined;
  const betweenPlayers = !current && auction.status !== "not-started" && auction.status !== "complete";
  const seasonLabel = season ? String(season).replace(/-/g, " ").toUpperCase() : "TNHVPL";

  const recentSale =
    !current && Object.keys(auction.sold).length
      ? Object.entries(auction.sold)
          .map(([no, s]) => ({ no: Number(no), ...s }))
          .sort((a, b) => b.round - a.round || b.no - a.no)[0]
      : null;

  const padNo = current ? String(current.no).padStart(2, "0") : "";

  return (
    <div className="auc-projector">
      <div className="auc-slide">
        <div className="auc-slide-top">
          <span className="kicker">
            Round {auction.round}
            {auction.round > 1 ? " · re-bid" : ""}
          </span>
          <span className={`pill ${auction.status === "paused" ? "done" : "live"}`}>{auction.status}</span>
        </div>

        {auction.status === "not-started" && (
          <h1 style={{ fontSize: "clamp(40px, 8vw, 72px)", textAlign: "center" }}>Waiting to start</h1>
        )}

        {auction.status === "complete" && (
          <h1 style={{ fontSize: "clamp(40px, 8vw, 72px)", textAlign: "center" }}>Auction complete</h1>
        )}

        {auction.status === "round-complete" && (
          <h1 style={{ fontSize: "clamp(36px, 7vw, 64px)", textAlign: "center" }}>
            Round {auction.round} done · {auction.unsold.length} unsold
          </h1>
        )}

        {current && (
          <div className="auc-slide-body">
            <div className="auc-slide-photo-wrap">
              <div className="auc-slide-photo-frame">
                <div className="auc-slide-photo">
                  {current.revealed && pl?.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pl.photo} alt="" />
                  ) : (
                    <span className="auc-slide-photo-initial">
                      {current.revealed ? (pl?.name?.[0] ?? "?") : "?"}
                    </span>
                  )}
                </div>
              </div>
              <div className="auc-slide-player-badge">Player #{padNo}</div>
            </div>

            <div className="auc-slide-info">
              <span className="auc-slide-eyebrow">{seasonLabel} · Player auction</span>

              {current.revealed && pl ? (
                <>
                  <h1 className="auc-slide-name">{pl.name}</h1>
                  <span className={`skill auc-slide-skill ${pl.skill}`}>{pl.skill}</span>

                  <div className="auc-slide-meta">
                    <div className="auc-slide-meta-card">
                      <span className="auc-slide-meta-label">Tower / Flat no.</span>
                      <span className="auc-slide-meta-value">{priv?.tower || "—"}</span>
                    </div>
                    <div className="auc-slide-meta-card">
                      <span className="auc-slide-meta-label">Age</span>
                      <span className="auc-slide-meta-value">{priv?.age || "—"}</span>
                    </div>
                    <div className="auc-slide-meta-card wide">
                      <span className="auc-slide-meta-label">Phone number</span>
                      <span className="auc-slide-meta-value">{priv?.phone || "—"}</span>
                    </div>
                  </div>

                </>
              ) : (
                <h1 className="auc-slide-name" style={{ fontSize: "clamp(64px, 14vw, 120px)" }}>
                  ???
                </h1>
              )}
            </div>
          </div>
        )}

        {current?.revealed && (
          <div
            className={`auc-slide-bidbar ${high && highTeam ? "has-bid" : "waiting"}`}
            style={highTeam ? ({ ["--bid-team"]: highTeam.color } as CSSProperties) : undefined}
          >
            {high && highTeam ? (
              <>
                <div className="auc-slide-bidbar-lead">
                  <Logo team={highTeam as unknown as Team} size={72} />
                  <div className="auc-slide-bidbar-team">
                    <span className="auc-slide-bidbar-label">Leading bid</span>
                    <span className="auc-slide-bidbar-name">{highTeam.name}</span>
                    <span className="auc-slide-bidbar-short">{highTeam.short}</span>
                  </div>
                </div>
                <div className="auc-slide-bidbar-amt-wrap">
                  <span className="auc-slide-bidbar-label">Current bid</span>
                  <span className="auc-slide-bidbar-amt">{high.amount}</span>
                  <span className="auc-slide-bidbar-base">Base {current.openingBase}</span>
                </div>
                {current.bids.length > 1 && (
                  <div className="auc-slide-bidbar-trail" aria-label="Recent bids">
                    {[...current.bids]
                      .slice(-4)
                      .reverse()
                      .map((b, i) => {
                        const t = teamMap.get(b.teamId);
                        return (
                          <span key={`${b.teamId}-${b.amount}-${b.t}-${i}`} className="auc-slide-bidbar-chip">
                            {t?.short ?? b.teamId} · {b.amount}
                          </span>
                        );
                      })}
                  </div>
                )}
              </>
            ) : (
              <div className="auc-slide-bidbar-waiting">
                <span className="auc-slide-bidbar-label">Waiting for bids</span>
                <span className="auc-slide-bidbar-amt muted-amt">Base {current.openingBase}</span>
              </div>
            )}
          </div>
        )}

        {betweenPlayers && !current && recentSale && (
          <div className="stack" style={{ gap: 24, textAlign: "center" }}>
            <div>
              <span className="kicker">Last sold</span>
              <h1 style={{ fontSize: "clamp(36px, 7vw, 56px)", textTransform: "none" }}>
                #{recentSale.no} → {teamMap.get(recentSale.teamId)?.name ?? recentSale.teamId}
              </h1>
              <p style={{ fontFamily: "var(--display)", fontSize: 40, color: "var(--gold)", margin: 0 }}>
                {recentSale.amount}
              </p>
            </div>
            <PurseSummary teams={teams} auction={auction} />
          </div>
        )}

        {betweenPlayers && !current && !recentSale && <PurseSummary teams={teams} auction={auction} />}
      </div>
    </div>
  );
}

function PurseSummary({
  teams,
  auction,
}: {
  teams: { id: string; name: string; short: string; color: string; logo: string }[];
  auction: NonNullable<ReturnType<typeof useAuctionPoll>["data"]>["auction"];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        width: "100%",
        textAlign: "left",
      }}
    >
      {teams.map((t) => {
        const ts = auction.teams[t.id];
        return (
          <div key={t.id} className="card" style={{ borderTop: `4px solid ${t.color}`, padding: 12 }}>
            <div className="row" style={{ gap: 8 }}>
              <Logo team={t as unknown as Team} size={28} />
              <b>{t.short}</b>
            </div>
            <div style={{ fontFamily: "var(--display)", fontSize: 28, marginTop: 4 }}>{ts?.balance ?? "—"}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {ts?.bought ?? 0} bought · max {ts?.maxBid ?? "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
