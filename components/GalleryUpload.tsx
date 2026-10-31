"use client";

import { useRef, useState } from "react";
import { useLive } from "@/components/LiveProvider";
import { compressGalleryPhoto } from "@/lib/galleryCompress";

const GALLERY_PIN_KEY = "tnhvpl-gallery-pin";

type Props = {
  matchId?: string | null;
  defaultTags?: string;
  onUploaded?: () => void;
  compact?: boolean;
};

export function GalleryUpload({ matchId = null, defaultTags = "", onUploaded, compact }: Props) {
  const { state, pin, role } = useLive();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState(defaultTags);
  const [caption, setCaption] = useState("");
  const [galleryPin, setGalleryPin] = useState(() => {
    try {
      return localStorage.getItem(GALLERY_PIN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!state) return null;
  const season = state.tournamentKey;
  const staffPin = role === "admin" || role === "scorer" ? pin : "";

  async function uploadFile(file: File) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const { full, thumb } = await compressGalleryPhoto(file);
      const form = new FormData();
      form.set("season", season);
      if (matchId) form.set("matchId", matchId);
      if (tags.trim()) form.set("tags", tags);
      if (caption.trim()) form.set("caption", caption);
      form.set("width", String(full.width));
      form.set("height", String(full.height));
      form.set("file", full.blob, `photo.${full.contentType.includes("webp") ? "webp" : "jpg"}`);
      form.set("thumb", thumb.blob, `thumb.${thumb.contentType.includes("webp") ? "webp" : "jpg"}`);

      const authPin = staffPin || galleryPin.trim();
      if (galleryPin.trim()) {
        try {
          localStorage.setItem(GALLERY_PIN_KEY, galleryPin.trim());
        } catch {
          /* ignore */
        }
      }

      const r = await fetch("/api/gallery/upload", {
        method: "POST",
        headers: authPin ? { "x-pin": authPin } : {},
        body: form,
      }).then((x) => x.json());

      if (!r.ok) throw new Error(r.error || "Upload failed");
      setMsg(r.message || "Uploaded");
      setCaption("");
      onUploaded?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={`gallery-upload${compact ? " compact" : ""}`}>
      {!compact && <h3>Add a photo</h3>}
      <p className="note" style={{ marginTop: 0 }}>
        Photos only (JPEG/PNG). Compressed on your phone before upload
        {staffPin
          ? " · published immediately"
          : galleryPin
            ? " · gallery PIN publishes immediately"
            : " · without a PIN it waits for admin approval"}
        .
      </p>
      <div className="form">
        {!staffPin && (
          <label>
            Gallery PIN (optional)
            <input
              type="password"
              autoComplete="off"
              value={galleryPin}
              onChange={(e) => setGalleryPin(e.target.value)}
              placeholder="Leave blank to submit for approval"
            />
          </label>
        )}
        {!matchId && (
          <label>
            Tags
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="auction, opening, awards"
            />
          </label>
        )}
        {matchId && (
          <label>
            Extra tags (optional)
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="celebration, team-photo" />
          </label>
        )}
        <label>
          Caption (optional)
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Short note" />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
          }}
        />
        <button
          type="button"
          className="btn gold"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Compressing & uploading…" : "Choose photo"}
        </button>
      </div>
      {msg && <p className="note">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
