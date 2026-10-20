"use client";

import Link from "next/link";
import { useState } from "react";
import { useLive, type StaffRole } from "./LiveProvider";

/** Home-screen staff PIN login / switch between scorer and admin. */
export function StaffLogin() {
  const { role, roleReady, login, logout } = useLive();
  const [want, setWant] = useState<StaffRole>("scorer");
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!roleReady) return null;

  if (role && !open) {
    return (
      <section className="card staff-card stack">
        <div className="sechead">
          <div>
            <span className="kicker">Staff</span>
            <h2 style={{ textTransform: "none", letterSpacing: 0, marginTop: 4 }}>
              Logged in as {role === "admin" ? "Admin" : "Scorer"}
            </h2>
          </div>
          <span className={`pill ${role === "admin" ? "done" : "live"}`}>{role}</span>
        </div>
        <div className="row">
          <Link className="btn gold" href="/score">
            Score matches
          </Link>
          {role === "admin" && (
            <Link className="btn" href="/admin">
              Admin
            </Link>
          )}
          <Link className="btn ghost" href="/display">
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
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const r = await login(val);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? "Wrong PIN");
      return;
    }
    if (want === "admin" && r.role !== "admin") {
      logout();
      setMsg("That PIN is for the scorer. Use the admin PIN, or switch to Scorer.");
      return;
    }
    // Admin PIN may use the scorer tools; scorer PIN must pick Scorer.
    setVal("");
    setOpen(false);
  };

  return (
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
          Choose Scorer or Admin, then enter that PIN. It stays on this phone.
        </p>
        <div className="role-toggle" role="group" aria-label="Login as">
          <button
            type="button"
            className={want === "scorer" ? "on" : ""}
            onClick={() => {
              setWant("scorer");
              setMsg("");
            }}
          >
            Scorer
          </button>
          <button
            type="button"
            className={want === "admin" ? "on" : ""}
            onClick={() => {
              setWant("admin");
              setMsg("");
            }}
          >
            Admin
          </button>
        </div>
        <div className="row" style={{ alignItems: "stretch" }}>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={`${want === "admin" ? "Admin" : "Scorer"} PIN`}
            aria-label={`${want === "admin" ? "Admin" : "Scorer"} PIN`}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn gold" type="submit" disabled={busy || !val.trim()}>
            {busy ? "…" : "Continue"}
          </button>
        </div>
        {msg && <p className="error">{msg}</p>}
      </form>
    </section>
  );
}
