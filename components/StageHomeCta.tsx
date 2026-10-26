"use client";

import Link from "next/link";
import { effectiveStage } from "@/lib/season";
import { useLive } from "./LiveProvider";

/** Public stage callouts on the Live home page (registration / auction). */
export function StageHomeCta() {
  const { role, state, seasonHref } = useLive();
  if (!state) return null;

  const stage = effectiveStage(state.config);
  const auctionLive = stage === "auction";
  const regOpen = stage === "registration" && (state.config.registration?.open ?? true);

  if (regOpen) {
    return (
      <div className="auc-home-cta card stack">
        <div className="sechead">
          <div>
            <span className="kicker">Registrations open</span>
            <h2 style={{ textTransform: "none", letterSpacing: 0, marginTop: 4, fontSize: 22 }}>
              Join this season
            </h2>
          </div>
          <span className="pill live">Registration</span>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link className="btn gold" href={seasonHref("/register")}>
            Register to play
          </Link>
          {role === "admin" && (
            <Link className="btn" href={seasonHref("/admin/registrations")}>
              Review sign-ups
            </Link>
          )}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Players submit once. Organisers approve places before the auction.
        </p>
      </div>
    );
  }

  if (auctionLive) {
    return (
      <div className="auc-home-cta card stack">
        <div className="sechead">
          <div>
            <span className="kicker">Live auction</span>
            <h2 style={{ textTransform: "none", letterSpacing: 0, marginTop: 4, fontSize: 22 }}>
              {role === "owner" ? "Ready to bid" : "Follow the auction"}
            </h2>
          </div>
          <span className="pill live">Auction</span>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {role === "owner" || role === "admin" ? (
            <Link className="btn gold" href={seasonHref("/auction/owner")}>
              {role === "owner" ? "Open bid screen" : "Bid as owner"}
            </Link>
          ) : (
            <Link className="btn gold" href={seasonHref("/staff")}>
              Owner login &amp; bid
            </Link>
          )}
          <Link className="btn" href={seasonHref("/auction/live")}>
            Watch live
          </Link>
          <Link className="btn ghost" href={seasonHref("/auction/board")}>
            Purse board
          </Link>
        </div>
        {!role && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Owners: open <b>Staff</b>, pick Owner + your team, enter the PIN from the admin — then bid.
          </p>
        )}
      </div>
    );
  }

  return null;
}
