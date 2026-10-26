"use client";

import { StaffLogin } from "@/components/StaffLogin";

export default function StaffPage() {
  return (
    <>
      <section className="stack">
        <span className="kicker">Organisers</span>
        <h1>Staff</h1>
        <p className="muted" style={{ margin: 0 }}>
          Scorers, admins, auctioneers and team owners sign in here with a PIN. Spectators can stay on Live.
        </p>
      </section>
      <StaffLogin />
    </>
  );
}
