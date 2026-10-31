"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLive } from "@/components/LiveProvider";
import { GalleryUpload } from "@/components/GalleryUpload";
import type { GalleryPhotoDto } from "@/components/GalleryBrowser";

export function MatchGallery({ matchId }: { matchId: string }) {
  const { state, seasonHref } = useLive();
  const [photos, setPhotos] = useState<GalleryPhotoDto[]>([]);
  const [openUpload, setOpenUpload] = useState(false);

  const load = useCallback(async () => {
    if (!state) return;
    const q = new URLSearchParams({ season: state.tournamentKey, matchId });
    const r = await fetch(`/api/gallery?${q}`, { cache: "no-store" }).then((x) => x.json());
    if (r.ok) setPhotos(r.photos || []);
  }, [state, matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  return (
    <section className="stack match-gallery">
      <div className="sechead">
        <h2>Photos</h2>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn gold" onClick={() => setOpenUpload((v) => !v)}>
            {openUpload ? "Cancel" : "Add photos"}
          </button>
          <Link className="btn" href={seasonHref("/gallery")}>
            Full gallery
          </Link>
        </div>
      </div>
      {openUpload && (
        <div className="card">
          <GalleryUpload
            matchId={matchId}
            compact
            onUploaded={() => {
              void load();
              setOpenUpload(false);
            }}
          />
        </div>
      )}
      {photos.length === 0 ? (
        <p className="note">No photos for this match yet.</p>
      ) : (
        <div className="gallery-strip">
          {photos.slice(0, 12).map((p) => (
            <Link key={p.id} href={seasonHref(`/gallery?photo=${p.id}`)} className="gallery-strip-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl || p.blobUrl} alt={p.caption || ""} loading="lazy" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
