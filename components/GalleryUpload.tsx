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
  /** Force multi-select (defaults to on for admin). */
  multiple?: boolean;
};

export function GalleryUpload({
  matchId = null,
  defaultTags = "",
  onUploaded,
  compact,
  multiple,
}: Props) {
  const { state, pin, role } = useLive();
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
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
  const [progress, setProgress] = useState("");

  if (!state) return null;
  const season = state.tournamentKey;
  const staffPin = role === "admin" || role === "scorer" ? pin : "";
  const allowMulti = multiple ?? role === "admin";

  async function uploadOne(file: File, authPin: string): Promise<void> {
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

    const r = await fetch("/api/gallery/upload", {
      method: "POST",
      headers: authPin ? { "x-pin": authPin } : {},
      body: form,
    }).then((x) => x.json());

    if (!r.ok) throw new Error(r.error || "Upload failed");
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setProgress("");

    const authPin = staffPin || galleryPin.trim();
    if (galleryPin.trim()) {
      try {
        localStorage.setItem(GALLERY_PIN_KEY, galleryPin.trim());
      } catch {
        /* ignore */
      }
    }

    let ok = 0;
    const failures: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        setProgress(
          files.length === 1
            ? "Compressing & uploading…"
            : `Compressing & uploading ${i + 1} of ${files.length}…`,
        );
        try {
          await uploadOne(file, authPin);
          ok += 1;
        } catch (e) {
          const reason = e instanceof Error ? e.message : "Upload failed";
          failures.push(`${file.name || `Photo ${i + 1}`}: ${reason}`);
        }
      }

      if (ok > 0) {
        setMsg(
          ok === 1
            ? "Uploaded 1 photo."
            : `Uploaded ${ok} photo${ok === 1 ? "" : "s"}.`,
        );
        setCaption("");
        onUploaded?.();
      }
      if (failures.length) {
        setErr(failures.slice(0, 3).join(" · ") + (failures.length > 3 ? ` · +${failures.length - 3} more` : ""));
      }
    } finally {
      setBusy(false);
      setProgress("");
      if (libraryRef.current) libraryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    void uploadFiles(Array.from(list));
  }

  return (
    <div className={`gallery-upload${compact ? " compact" : ""}`}>
      {!compact && <h3>{allowMulti ? "Add photos" : "Add a photo"}</h3>}
      <p className="note" style={{ marginTop: 0 }}>
        Photos only (JPEG/PNG). Compressed on your phone before upload
        {allowMulti ? " · admin can select multiple" : ""}
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
          Caption (optional{allowMulti ? " — applied to each photo" : ""})
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Short note" />
        </label>
        {/* Library picker — no capture attribute so phones open the photo library */}
        <input
          ref={libraryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          multiple={allowMulti}
          disabled={busy}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={onPick}
        />
        {/* Camera — capture prefers the rear camera when available (always single) */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          disabled={busy}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={onPick}
        />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn gold" disabled={busy} onClick={() => libraryRef.current?.click()}>
            {busy
              ? progress || "Compressing & uploading…"
              : allowMulti
                ? "Choose photos"
                : "Choose from gallery"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => cameraRef.current?.click()}>
            Take photo
          </button>
        </div>
      </div>
      {msg && <p className="note">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
