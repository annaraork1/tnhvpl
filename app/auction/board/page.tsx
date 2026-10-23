"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLive } from "@/components/LiveProvider";
import { Loading, Logo } from "@/components/ui";
import { useAuctionPoll } from "@/components/useAuctionPoll";
import { effectiveStage } from "@/lib/season";
import type { Team } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-IN");
}

export default function AuctionBoardPage() {
  const { state, seasonHref } = useLive();
  const { data, error } = useAuctionPoll({ intervalMs: 1000 });
  const auction = data?.auction;
  const teams = data?.teams ?? [];
  const players = data?.players ?? [];
  const settings = data?.settings;
  const playerMap = useMemo(() => new Map(players.map((p) => [p.no, p])), [players]);

  if (!data || !auction || !settings) {
    return error ? <div className="error">{error}</div> : <Loading label="Loading purse board…" />;
  }

  const soldCount = Object.keys(auction.sold).length;
  const total = players.length;
  const stage = state ? effectiveStage(state.config) : "auction";
  const showPrices = stage === "auction" || settings.showPricesPublic;
  const title =
    state?.meta?.name || state?.config.tournament.name || state?.tournamentKey || "Auction";

  return (
    <div className="purse-board">
      <header className="purse-board-head">
        <h1 className="purse-board-title">
          {title} · Live auction
        </h1>
        <p className="purse-board-meta">
          Players sold: {soldCount} · Left in pool: {auction.pool.length} of {total}
          {auction.round ? ` · Round ${auction.round}` : ""}
          {auction.leftoverStage ? " · Leftover stage open" : ""}
          {" · "}
          <span className={`pill ${auction.status === "complete" ? "done" : "live"}`}>{auction.status}</span>
          {" · "}
          <Link href={seasonHref("/auction/live")}>Current player →</Link>
        </p>
      </header>

      <div className="purse-board-scroll">
        <table className="purse-table">
          <thead>
            <tr>
              <th scope="col" className="purse-stub" />
              {teams.map((t) => (
                <th key={t.id} scope="col" style={{ ["--tc" as string]: t.color }}>
                  <span className="purse-team">
                    <Logo team={t as unknown as Team} size={32} />
                    <span>{t.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Players bought</th>
              {teams.map((t) => {
                const ts = auction.teams[t.id];
                return (
                  <td key={`b-${t.id}`}>
                    {ts ? (
                      <>
                        <b>{ts.bought}</b>
                        <span className="purse-slash"> / {settings.minPlayers}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th scope="row">Balance</th>
              {teams.map((t) => {
                const ts = auction.teams[t.id];
                return (
                  <td key={`bal-${t.id}`} className="purse-gold">
                    {ts ? fmt(ts.balance) : "—"}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th scope="row">Players left to buy</th>
              {teams.map((t) => {
                const ts = auction.teams[t.id];
                return <td key={`l-${t.id}`}>{ts ? ts.slotsToMin : "—"}</td>;
              })}
            </tr>
            <tr>
              <th scope="row">Max bid now</th>
              {teams.map((t) => {
                const ts = auction.teams[t.id];
                return (
                  <td key={`m-${t.id}`} className="purse-max">
                    {ts ? fmt(ts.maxBid) : "—"}
                    {!ts?.eligible && ts?.reason ? <div className="purse-reason">{ts.reason}</div> : null}
                  </td>
                );
              })}
            </tr>
            <tr className="purse-squad-row">
              <th scope="row">Squad</th>
              {teams.map((t) => {
                const ts = auction.teams[t.id];
                return (
                  <td key={`s-${t.id}`} className="purse-squad">
                    <div className="purse-owner">Owner: {t.owner || "—"}</div>
                    {!ts?.squad.length && <div className="muted">No players yet</div>}
                    <ul className="purse-squad-list">
                      {(ts?.squad ?? []).map((s) => {
                        const p = playerMap.get(s.no);
                        return (
                          <li key={s.no}>
                            <span>{p?.name ?? `Player #${s.no}`}</span>
                            {showPrices && <span className="purse-price">{fmt(s.amount)}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="purse-footnote">
        Squad shows{showPrices ? ": player name · winning bid" : " player names"}. Max bid keeps enough purse for the
        remaining minimum squad at base price.
      </p>
    </div>
  );
}
