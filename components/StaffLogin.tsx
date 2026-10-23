"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { effectiveStage } from "@/lib/season";
import { useLive, type StaffRole } from "./LiveProvider";

type Want = StaffRole;

/** Home-screen staff PIN login / switch between scorer, admin, auctioneer, owner. */
export function StaffLogin() {
  const { role, ownerTeamId, roleReady, login, logout, state, seasonHref } = useLive();
  const stage = effectiveStage(state?.config);
  const auctionLive = stage === "auction";
  const regOpen =
    stage === "registration" && (state?.config.registration?.open ?? true);
  const [want, setWant] = useState<Want>(auctionLive ? "owner" : "scorer");
  const [teamId, setTeamId] = useState("");
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!role && auctionLive) setWant("owner");
  }, [auctionLive, role]);

  if (!roleReady) return null;

  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "scorer"
        ? "Scorer"
        : role === "auctioneer"
          ? "Auctioneer"
          : role === "owner"
            ? `Owner${ownerTeamId ? ` · ${state?.config.teams.find((t) => t.id === ownerTeamId)?.short || ownerTeamId}` : ""}`
            : "";

  const stageLinks =
    regOpen ? (
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
    ) : auctionLive ? (
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
            <Link className="btn gold" href={seasonHref("/auction/owner")}>
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
            Owners: tap <b>Owner login &amp; bid</b>, pick your team, enter the PIN from the admin.
          </p>
        )}
      </div>
    ) : null;

  if (role && !open) {
    return (
      <>
        {stageLinks}
        <section className="card staff-card stack">
          <div className="sechead">
            <div>
              <span className="kicker">Staff</span>
              <h2 style={{ textTransform: "none", letterSpacing: 0, marginTop: 4 }}>
                Logged in as {roleLabel}
              </h2>
            </div>
            <span className={`pill ${role === "admin" ? "done" : "live"}`}>{role}</span>
          </div>
          <div className="row">
            {(role === "admin" || role === "scorer") && (
              <Link className="btn gold" href={seasonHref("/score")}>
                Score matches
              </Link>
            )}
            {role === "admin" && (
              <Link className="btn" href={seasonHref("/admin")}>
                Admin
              </Link>
            )}
            {(role === "admin" || role === "auctioneer") && (
              <>
                <Link className="btn" href={seasonHref("/auction/console")}>
                  Auction console
                </Link>
                <Link className="btn ghost" href={seasonHref("/auction/projector")}>
                  Projector
                </Link>
              </>
            )}
            {role === "owner" && !auctionLive && (
              <Link className="btn gold" href={seasonHref("/auction/owner")}>
                Bid
              </Link>
            )}
            {!auctionLive && (
              <>
                <Link className="btn ghost" href={seasonHref("/auction/live")}>
                  Watch live
                </Link>
                <Link className="btn ghost" href={seasonHref("/auction/board")}>
                  Purse board
                </Link>
              </>
            )}
            <Link className="btn ghost" href={seasonHref("/display")}>
              Big screen
            </Link>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setOpen(true);
                setVal("");
                setMsg("");
                setWant(role === "admin" ? "scorer" : "admin");
              }}
            >
              Switch account
            </button>
            <button type="button" className="btn ghost" onClick={logout}>
              Log out
            </button>
          </div>
        </section>
      </>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    if (want === "owner" && !teamId) {
      setBusy(false);
      setMsg("Pick your team");
      return;
    }
    const r = await login(val, want === "owner" ? { teamId } : undefined);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? "Wrong PIN");
      return;
    }
    if (want === "admin" && r.role !== "admin") {
      logout();
      setMsg("That PIN is not the admin PIN.");
      return;
    }
    if (want === "auctioneer" && r.role !== "auctioneer" && r.role !== "admin") {
      logout();
      setMsg("Use the auctioneer or admin PIN.");
      return;
    }
    if (want === "owner" && r.role !== "owner") {
      logout();
      setMsg("That PIN is not an owner PIN for this team.");
      return;
    }
    if (want === "scorer" && r.role !== "scorer" && r.role !== "admin") {
      logout();
      setMsg("Use the scorer or admin PIN.");
      return;
    }
    setVal("");
    setOpen(false);
  };

  const teams = state?.config.teams ?? [];

  return (
    <>
      {stageLinks}
      <section className="card staff-card">
        <form className="stack" onSubmit={submit}>
          <div className="sechead">
            <div>
              <span className="kicker">Staff</span>
              <h2 style={{ textTransform: "none", letterSpacing: 0, marginTop: 4 }}>
                {open ? "Switch login" : "Log in with PIN"}
              </h2>
            </div>
            {open && (
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            )}
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {want === "owner"
              ? "Pick your team and enter the owner PIN from the admin. It stays on this phone."
              : "Choose a role, then enter that PIN. It stays on this phone."}
          </p>
          <div className="role-toggle" role="group" aria-label="Login as" style={{ flexWrap: "wrap" }}>
            {(["scorer", "admin", "auctioneer", "owner"] as Want[]).map((w) => (
              <button
                key={w}
                type="button"
                className={want === w ? "on" : ""}
                onClick={() => {
                  setWant(w);
                  setMsg("");
                }}
              >
                {w === "scorer" ? "Scorer" : w === "admin" ? "Admin" : w === "auctioneer" ? "Auctioneer" : "Owner"}
              </button>
            ))}
          </div>
          {want === "owner" && (
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              aria-label="Team"
              required
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <div className="row" style={{ alignItems: "stretch" }}>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={`${want === "admin" ? "Admin" : want === "scorer" ? "Scorer" : want === "auctioneer" ? "Auctioneer" : "Owner"} PIN`}
              aria-label="PIN"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn gold" type="submit" disabled={busy || !val.trim()}>
              {busy ? "…" : "Continue"}
            </button>
          </div>
          {msg && <p className="error">{msg}</p>}
        </form>
      </section>
    </>
  );
}
