"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLive } from "@/components/LiveProvider";
import { Loading, PinGate } from "@/components/ui";
import { askConfirm } from "@/lib/confirm";
import { fileToLogoDataUrl } from "@/lib/logoUpload";
import {
  findDuplicates,
  guessColumnMap,
  mapRow,
  matchPhotoFilename,
  normalizeImportRow,
  parseCsv,
  type RegField,
} from "@/lib/registration";
import { defaultRegistrationSettings, effectiveStage } from "@/lib/season";
import type { RegistrationEntry } from "@/lib/types";

export default function AdminRegistrationsPage() {
  return (
    <PinGate need="admin">
      <Inner />
    </PinGate>
  );
}

type EditDraft = {
  id: string;
  name: string;
  skill: string;
  phone: string;
  tower: string;
  age: string;
  email: string;
  available: string;
  notes: string;
  guardianName: string;
  guardianPhone: string;
  photo: string | null;
  status: RegistrationEntry["status"];
};

function entryToDraft(e: RegistrationEntry): EditDraft {
  return {
    id: e.id,
    name: e.name,
    skill: e.skill,
    phone: e.priv.phone ?? "",
    tower: e.priv.tower ?? "",
    age: e.priv.age ?? "",
    email: e.priv.email ?? "",
    available: e.priv.available || "Yes",
    notes: e.priv.notes ?? "",
    guardianName: e.priv.guardianName ?? "",
    guardianPhone: e.priv.guardianPhone ?? "",
    photo: e.photo,
    status: e.status,
  };
}

function Inner() {
  const { state, act, seasonHref } = useLive();
  const [entries, setEntries] = useState<RegistrationEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "excluded" | "rejected" | "duplicates">("pending");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [importPreview, setImportPreview] = useState<
    { include: boolean; row: ReturnType<typeof normalizeImportRow>; raw: Record<string, string> }[] | null
  >(null);
  const [columnMap, setColumnMap] = useState<Record<string, RegField>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/action", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pin": typeof localStorage !== "undefined" ? localStorage.getItem("tnhvpl-pin") || "" : "",
      },
      body: JSON.stringify({ type: "listRegistrations", season: state?.tournamentKey }),
    });
    const j = await res.json();
    if (j.ok && Array.isArray(j.entries)) setEntries(j.entries);
  }, [state?.tournamentKey]);

  useEffect(() => {
    if (state) void load();
  }, [state, load]);

  const dups = useMemo(() => findDuplicates(entries), [entries]);

  const shown = useMemo(() => {
    if (filter === "duplicates") return entries.filter((e) => dups.has(e.id));
    if (filter === "all") return entries;
    return entries.filter((e) => e.status === filter);
  }, [entries, filter, dups]);

  if (!state) return <Loading />;

  const stage = effectiveStage(state.config);
  const reg = state.config.registration ?? defaultRegistrationSettings();

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? "" : x)), 3000);
  };

  const setStatus = async (id: string, status: RegistrationEntry["status"], excludeReason?: string) => {
    setBusy(true);
    const r = await act("regUpdate", { id, status, excludeReason });
    setBusy(false);
    flash(r.ok ? "Updated" : r.error ?? "Failed");
    if (r.ok) void load();
  };

  const onCsv = async (file: File) => {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    const map = (reg.columnMap as Record<string, RegField>) || guessColumnMap(headers);
    setColumnMap(map);
    setImportPreview(
      rows.map((values) => {
        const raw = mapRow(headers, values, map);
        return { include: true, row: normalizeImportRow(raw), raw };
      }),
    );
  };

  const runImport = async () => {
    if (!importPreview) return;
    setBusy(true);
    const rows = importPreview
      .filter((p) => p.include)
      .map((p) => ({
        name: p.row.name,
        skill: p.row.skill,
        priv: {
          phone: p.row.phone,
          tower: p.row.tower,
          age: p.row.age,
          email: p.row.email || undefined,
          available: p.row.available,
          contribution: p.row.contribution || undefined,
          photoRef: p.row.photoRef || undefined,
          source: "import" as const,
        },
      }));
    const r = await act("regImport", { rows, columnMap });
    setBusy(false);
    flash(r.ok ? `Imported ${rows.length}` : r.error ?? "Failed");
    if (r.ok) {
      setImportPreview(null);
      void load();
    }
  };

  const onPhotoZip = async (file: File) => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && /\.(jpe?g|png|webp)$/i.test(n));
    let matched = 0;
    let uncertain = 0;
    setBusy(true);
    for (const name of names) {
      const hit = matchPhotoFilename(name, entries);
      if (!hit) continue;
      if (hit.confidence === "fuzzy") {
        uncertain++;
        continue;
      }
      const blob = await zip.files[name].async("blob");
      const dataUrl = await fileToLogoDataUrl(new File([blob], name, { type: blob.type || "image/jpeg" }), 320, 0.8);
      await act("regUpdate", { id: hit.id, photo: dataUrl });
      matched++;
    }
    setBusy(false);
    flash(`Photos: ${matched} matched${uncertain ? `, ${uncertain} uncertain (skipped)` : ""}`);
    void load();
  };

  const canEdit = stage === "registration";

  const lock = async () => {
    if (!askConfirm("Lock registration? Approved players get auction numbers and the season moves to Auction.")) return;
    const confirm = window.prompt("Type LOCK to confirm");
    if (confirm !== "LOCK") return;
    setBusy(true);
    const r = await act("lockRegistration", { confirm: "LOCK" });
    setBusy(false);
    flash(r.ok ? "Locked — stage is Auction" : r.error ?? "Failed");
  };

  const unlock = async () => {
    if (
      !askConfirm(
        "Unlock registration? This returns to Registration, clears the auction player pool and team squads, and reopens sign-up. Registration entries (approvals) are kept.",
      )
    ) {
      return;
    }
    const confirm = window.prompt("Type UNLOCK to confirm");
    if (confirm !== "UNLOCK") return;
    setBusy(true);
    let r = await act("unlockRegistration", { confirm: "UNLOCK" });
    if (!r.ok && /force/i.test(r.error ?? "")) {
      const ok = askConfirm(
        `${r.error}\n\nForce unlock? This clears any auction bids and sold players.`,
      );
      if (ok) r = await act("unlockRegistration", { confirm: "UNLOCK", force: true });
    }
    setBusy(false);
    flash(r.ok ? "Unlocked — back to Registration" : r.error ?? "Failed");
    if (r.ok) {
      setEdit(null);
      void load();
    }
  };

  const saveEdit = async () => {
    if (!edit || !canEdit) return;
    setBusy(true);
    const r = await act("regUpdate", {
      id: edit.id,
      name: edit.name,
      skill: edit.skill,
      phone: edit.phone,
      tower: edit.tower,
      age: edit.age,
      email: edit.email,
      available: edit.available,
      notes: edit.notes,
      guardianName: edit.guardianName,
      guardianPhone: edit.guardianPhone,
      photo: edit.photo,
      status: edit.status,
    });
    setBusy(false);
    if (!r.ok) {
      flash(r.error ?? "Failed");
      return;
    }
    flash("Saved");
    setEdit(null);
    void load();
  };

  return (
    <>
      <div className="sechead">
        <div>
          <Link className="muted" href={seasonHref("/admin")}>
            ← Admin
          </Link>
          <h1>Registrations</h1>
        </div>
        <span className="pill live">{stage}</span>
      </div>

      <section className="card stack">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={busy || !canEdit}
            onClick={async () => {
              setBusy(true);
              await act("saveRegistrationSettings", {
                registration: { ...reg, open: !reg.open },
              });
              setBusy(false);
              flash(reg.open ? "Closed" : "Opened");
            }}
          >
            {reg.open ? "Close sign-up" : "Open sign-up"}
          </button>
          <Link className="btn ghost" href={seasonHref("/register")}>
            Public form
          </Link>
          {canEdit ? (
            <button type="button" className="btn gold" disabled={busy} onClick={lock}>
              Lock → Auction
            </button>
          ) : (
            <button type="button" className="btn" disabled={busy || stage === "matches" || stage === "completed"} onClick={unlock}>
              Unlock ← Registration
            </button>
          )}
        </div>
        <p className="note" style={{ margin: 0 }}>
          {entries.filter((e) => e.status === "approved").length} approved · {entries.filter((e) => e.status === "pending").length} pending ·{" "}
          {entries.length} total
          {!canEdit && " · Locked — unlock to edit players or change approvals"}
        </p>
      </section>

      <section className="card stack">
        <div className="sechead" style={{ margin: 0 }}>
          <h2 style={{ margin: 0 }}>Import CSV / Excel</h2>
          <a className="btn ghost" href="/registration-template.csv" download="registration-template.csv">
            Download template
          </a>
        </div>
        <p className="note" style={{ margin: 0 }}>
          Columns: Name, Age, Contact Number, Tower, Skill Level (Beginner / Intermediate / Advanced), Available (Yes/No),
          Photo filename or Drive link, Email, Contribution. Photos: upload a ZIP named like{" "}
          <code>IMG - Player Name.jpg</code> after import.
        </p>
        {!canEdit && <p className="muted" style={{ margin: 0 }}>Import is disabled while registration is locked.</p>}
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          disabled={!canEdit || busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (/\.xlsx?$/i.test(f.name)) {
              const XLSX = await import("xlsx");
              const buf = await f.arrayBuffer();
              const wb = XLSX.read(buf);
              const sheet = wb.Sheets[wb.SheetNames[0]];
              const csv = XLSX.utils.sheet_to_csv(sheet);
              const { headers, rows } = parseCsv(csv);
              const map = guessColumnMap(headers);
              setColumnMap(map);
              setImportPreview(
                rows.map((values) => {
                  const raw = mapRow(headers, values, map);
                  return { include: true, row: normalizeImportRow(raw), raw };
                }),
              );
            } else await onCsv(f);
          }}
        />
        <label className="stack" style={{ gap: 4 }}>
          <span>Photo zip (match `IMG - Name.jpg`)</span>
          <input
            type="file"
            accept=".zip"
            disabled={!canEdit || busy}
            onChange={(e) => e.target.files?.[0] && void onPhotoZip(e.target.files[0])}
          />
        </label>
        {importPreview && (
          <>
            <div className="tablewrap">
              <table className="standings">
                <thead>
                  <tr>
                    <th></th>
                    <th className="l">Name</th>
                    <th>Skill</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          checked={p.include}
                          onChange={(e) => {
                            const next = [...importPreview];
                            next[i] = { ...p, include: e.target.checked };
                            setImportPreview(next);
                          }}
                        />
                      </td>
                      <td className="l">{p.row.name}</td>
                      <td>{p.row.skill}</td>
                      <td>{p.row.flags.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button type="button" className="btn gold" disabled={busy} onClick={runImport}>
                Import selected
              </button>
              <button type="button" className="btn ghost" onClick={() => setImportPreview(null)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </section>

      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {(["pending", "approved", "excluded", "rejected", "duplicates", "all"] as const).map((f) => (
          <button key={f} type="button" className={`btn ${filter === f ? "gold" : "ghost"}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className="stack">
        {shown.map((e) => {
          const ageNum = Number(e.priv.age);
          const flags: string[] = [];
          if (Number.isFinite(ageNum) && ageNum < 18) flags.push("under-18");
          if (/sr\s*citizen/i.test(e.priv.age)) flags.push("sr-citizen");
          if (e.priv.available === "No") flags.push("unavailable");
          if (!e.photo && !e.priv.photoRef) flags.push("no-photo");
          if (dups.has(e.id)) flags.push("dup");
          return (
            <article key={e.id} className="card stack" style={{ gap: 8 }}>
              <div className="sechead" style={{ margin: 0 }}>
                <div>
                  <b>{e.name}</b>{" "}
                  <span className={`skill ${e.skill}`}>{e.skill}</span>
                </div>
                <span className="pill">{e.status}</span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {e.priv.phone} · Tower {e.priv.tower} · Age {e.priv.age}
                {e.priv.available ? ` · Available ${e.priv.available}` : ""}
              </p>
              {(e.guardianConsent || e.priv.guardianName || e.priv.guardianPhone) && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Guardian
                  {e.priv.guardianName ? `: ${e.priv.guardianName}` : ""}
                  {e.priv.guardianPhone ? ` · ${e.priv.guardianPhone}` : ""}
                  {e.guardianConsent ? " · consent ✓" : ""}
                </p>
              )}
              {flags.length > 0 && <p className="note" style={{ margin: 0 }}>{flags.join(" · ")}</p>}
              {e.photo && (
                <img src={e.photo} alt="" width={64} height={64} style={{ borderRadius: 8, objectFit: "cover" }} />
              )}
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !canEdit}
                  onClick={() => setEdit(entryToDraft(e))}
                >
                  Edit
                </button>
                {e.status !== "approved" && (
                  <button type="button" className="btn" disabled={busy || !canEdit} onClick={() => setStatus(e.id, "approved")}>
                    Approve
                  </button>
                )}
                {e.status !== "excluded" && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy || !canEdit}
                    onClick={() => {
                      const reason = window.prompt("Exclude reason") || "Excluded";
                      void setStatus(e.id, "excluded", reason);
                    }}
                  >
                    Exclude
                  </button>
                )}
                {e.status !== "rejected" && (
                  <button type="button" className="btn ghost" disabled={busy || !canEdit} onClick={() => setStatus(e.id, "rejected")}>
                    Reject
                  </button>
                )}
                {e.status !== "pending" && (
                  <button type="button" className="btn ghost" disabled={busy || !canEdit} onClick={() => setStatus(e.id, "pending")}>
                    Pending
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!shown.length && <p className="empty">No entries in this filter.</p>}
      </div>
      {msg && <p className="note">{msg}</p>}

      {edit && (
        <div
          className="reg-modal-backdrop"
          role="presentation"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setEdit(null);
          }}
        >
          <div className="reg-modal card stack" role="dialog" aria-modal="true" aria-labelledby="reg-edit-title">
            <div className="sechead" style={{ margin: 0 }}>
              <h2 id="reg-edit-title" style={{ margin: 0 }}>
                Edit registration
              </h2>
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
                Close
              </button>
            </div>
            {!canEdit && <p className="error">Registration is locked — unlock to save changes.</p>}
            <div className="fields">
              <label>
                Name
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} disabled={!canEdit} />
              </label>
              <label>
                Skill
                <select value={edit.skill} onChange={(e) => setEdit({ ...edit, skill: e.target.value })} disabled={!canEdit}>
                  {(reg.skillLevels?.length ? reg.skillLevels : ["Beginner", "Intermediate", "Advanced"]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value as RegistrationEntry["status"] })}
                  disabled={!canEdit}
                >
                  {(["pending", "approved", "excluded", "rejected"] as const).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phone
                <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} disabled={!canEdit} />
              </label>
              <label>
                Tower / flat
                <input value={edit.tower} onChange={(e) => setEdit({ ...edit, tower: e.target.value })} disabled={!canEdit} />
              </label>
              <label>
                Age
                <input value={edit.age} onChange={(e) => setEdit({ ...edit, age: e.target.value })} disabled={!canEdit} />
              </label>
              <label>
                Email
                <input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} disabled={!canEdit} />
              </label>
              <label>
                Available
                <select
                  value={edit.available}
                  onChange={(e) => setEdit({ ...edit, available: e.target.value })}
                  disabled={!canEdit}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="">—</option>
                </select>
              </label>
              <label>
                Guardian name
                <input
                  value={edit.guardianName}
                  onChange={(e) => setEdit({ ...edit, guardianName: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label>
                Guardian phone
                <input
                  value={edit.guardianPhone}
                  onChange={(e) => setEdit({ ...edit, guardianPhone: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Notes
                <input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} disabled={!canEdit} />
              </label>
            </div>
            <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              {edit.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={edit.photo} alt="" width={72} height={72} style={{ borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <span className="muted">No photo</span>
              )}
              <label className="btn ghost" style={{ cursor: canEdit ? "pointer" : "not-allowed" }}>
                Change photo
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={!canEdit}
                  onChange={async (ev) => {
                    const f = ev.target.files?.[0];
                    if (!f || !edit) return;
                    try {
                      const dataUrl = await fileToLogoDataUrl(f, 320, 0.8);
                      setEdit({ ...edit, photo: dataUrl });
                    } catch (err) {
                      flash(err instanceof Error ? err.message : "Photo failed");
                    }
                  }}
                />
              </label>
              {edit.photo && (
                <button type="button" className="btn ghost" disabled={!canEdit} onClick={() => setEdit({ ...edit, photo: null })}>
                  Remove photo
                </button>
              )}
            </div>
            <div className="row">
              <button type="button" className="btn gold" disabled={busy || !canEdit} onClick={() => void saveEdit()}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
