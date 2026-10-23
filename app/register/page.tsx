"use client";

import { useMemo, useState } from "react";
import { useLive } from "@/components/LiveProvider";
import { Loading } from "@/components/ui";
import { fileToLogoDataUrl } from "@/lib/logoUpload";
import { defaultRegistrationSettings, effectiveStage } from "@/lib/season";

export default function RegisterPage() {
  const { state, loading, season } = useLive();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tower, setTower] = useState("");
  const [age, setAge] = useState("");
  const [skill, setSkill] = useState("Intermediate");
  const [available, setAvailable] = useState("Yes");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");

  const reg = state?.config.registration ?? defaultRegistrationSettings();
  const stage = state ? effectiveStage(state.config) : null;
  const open = stage === "registration" && reg.open;
  const ageNum = Number(age);
  const under =
    Number.isFinite(ageNum) &&
    reg.guardianConsentUnder != null &&
    ageNum < reg.guardianConsentUnder;

  const skills = useMemo(() => reg.skillLevels?.length ? reg.skillLevels : ["Beginner", "Intermediate", "Advanced"], [reg.skillLevels]);

  if (loading || !state) return <Loading />;

  if (done) {
    return (
      <section className="card stack">
        <span className="kicker">Registration</span>
        <h1 style={{ textTransform: "none", letterSpacing: 0 }}>Thanks</h1>
        <p>The organisers will confirm your place.</p>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="card stack">
        <span className="kicker">Registration</span>
        <h1 style={{ textTransform: "none", letterSpacing: 0 }}>Closed</h1>
        <p className="muted">Sign-up is not open for this season right now.</p>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          season: season || state.tournamentKey,
          name,
          phone,
          tower,
          age,
          skill,
          available,
          email,
          photo,
          consent,
          guardianConsent,
          guardianName: guardianConsent ? guardianName : undefined,
          guardianPhone: guardianConsent ? guardianPhone : undefined,
          website: honeypot,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setMsg(j.error ?? "Failed");
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setMsg("No connection");
    }
    setBusy(false);
  };

  return (
    <section className="card stack">
      <span className="kicker">{state.meta.name || "Season"}</span>
      <h1 style={{ textTransform: "none", letterSpacing: 0 }}>Player registration</h1>
      <p className="muted" style={{ margin: 0 }}>
        Submit once. Organisers will approve your place before the auction.
      </p>
      <form className="stack" onSubmit={submit}>
        <label className="stack" style={{ gap: 4 }}>
          <span>Name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>Phone</span>
          <input required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>Tower / flat</span>
          <input required value={tower} onChange={(e) => setTower(e.target.value)} placeholder="e.g. 21082" />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>Age</span>
          <input required value={age} onChange={(e) => setAge(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>Skill</span>
          <select value={skill} onChange={(e) => setSkill(e.target.value)}>
            {skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>Available for the season dates?</span>
          <select value={available} onChange={(e) => setAvailable(e.target.value)}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>Email (optional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span>Photo {reg.requirePhoto ? "(required)" : "(optional)"}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPhoto(await fileToLogoDataUrl(f, 320, 0.8));
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "Photo failed");
              }
            }}
          />
          {photo && <img src={photo} alt="" width={80} height={80} style={{ borderRadius: 8, objectFit: "cover" }} />}
        </label>
        <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span style={{ fontSize: 14 }}>{reg.consentText}</span>
        </label>
        {under && (
          <div className="stack" style={{ gap: 10 }}>
            <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
              <input
                type="checkbox"
                checked={guardianConsent}
                onChange={(e) => {
                  setGuardianConsent(e.target.checked);
                  if (!e.target.checked) {
                    setGuardianName("");
                    setGuardianPhone("");
                  }
                }}
                required
              />
              <span style={{ fontSize: 14 }}>Guardian consent (under {reg.guardianConsentUnder})</span>
            </label>
            {guardianConsent && (
              <>
                <label className="stack" style={{ gap: 4 }}>
                  <span>Guardian name</span>
                  <input
                    required
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    autoComplete="name"
                    placeholder="Parent / guardian full name"
                  />
                </label>
                <label className="stack" style={{ gap: 4 }}>
                  <span>Guardian phone</span>
                  <input
                    required
                    inputMode="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="Parent / guardian phone"
                  />
                </label>
              </>
            )}
          </div>
        )}
        {/* honeypot */}
        <input
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ position: "absolute", left: -9999, opacity: 0 }}
          aria-hidden
        />
        <button className="btn gold" type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Submit"}
        </button>
        {msg && <p className="error">{msg}</p>}
      </form>
    </section>
  );
}
