"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLive } from "@/components/LiveProvider";
import { GalleryUpload } from "@/components/GalleryUpload";
import { Loading } from "@/components/ui";
export type GalleryPhotoDto = {
  id: string;
  createdAt: number;
  status: string;
  matchId: string | null;
  tags: string[];
  caption: string;
  blobUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  bytes: number;
  uploader: string;
};

type Props = {
  matchId?: string | null;
  showUpload?: boolean;
  showFilters?: boolean;
  showModeration?: boolean;
};

export function GalleryBrowser({
  matchId = null,
  showUpload = true,
  showFilters = true,
  showModeration = false,
}: Props) {
  const { state, calc, team, pin, role, seasonHref } = useLive();
  const [photos, setPhotos] = useState<GalleryPhotoDto[]>([]);
  const [pending, setPending] = useState<GalleryPhotoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState<string | null>(null);
  const [filterMatch, setFilterMatch] = useState<string | null>(matchId);
  const [lightbox, setLightbox] = useState<GalleryPhotoDto | null>(null);
  const [modMsg, setModMsg] = useState("");
  const [contributeOpen, setContributeOpen] = useState(false);

  const season = state?.tournamentKey;

  const load = useCallback(async () => {
    if (!season) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ season });
      if (filterMatch) q.set("matchId", filterMatch);
      if (tag) q.set("tag", tag);
      const r = await fetch(`/api/gallery?${q}`, { cache: "no-store" }).then((x) => x.json());
      if (r.ok) setPhotos(r.photos || []);
      else setPhotos([]);

      if (showModeration && role === "admin" && pin) {
        const pq = new URLSearchParams({ season, status: "pending" });
        const pr = await fetch(`/api/gallery?${pq}`, {
          headers: { "x-pin": pin },
          cache: "no-store",
        }).then((x) => x.json());
        if (pr.ok) setPending(pr.photos || []);
        else setPending([]);
      } else setPending([]);
    } finally {
      setLoading(false);
    }
  }, [season, filterMatch, tag, showModeration, role, pin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setFilterMatch(matchId);
  }, [matchId]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of photos) for (const t of p.tags) s.add(t);
    return [...s].sort();
  }, [photos]);

  const matchLabel = useCallback(
    (id: string | null) => {
      if (!id || !state || !calc) return null;
      const fx = state.config.fixtures.find((f) => f.id === id);
      if (!fx) return id;
      const r = calc.resolved[id];
      const a = team(r?.a)?.name || r?.labelA || "TBD";
      const b = team(r?.b)?.name || r?.labelB || "TBD";
      return `${fx.stage} · ${a} vs ${b}`;
    },
    [state, calc, team],
  );

  async function moderate(action: "approve" | "reject" | "delete", id: string) {
    if (!season || !pin) return;
    setModMsg("");
    const r = await fetch("/api/gallery/moderate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-pin": pin },
      body: JSON.stringify({ action, id, season }),
    }).then((x) => x.json());
    if (!r.ok) setModMsg(r.error || "Failed");
    else {
      setModMsg(action === "approve" ? "Published" : action === "reject" ? "Rejected" : "Deleted");
      if (lightbox?.id === id) setLightbox(null);
      await load();
    }
  }

  function downloadUrl(p: GalleryPhotoDto) {
    return `/api/gallery/file/${p.id}?season=${encodeURIComponent(season || "")}&download=1`;
  }

  if (!state) return <Loading />;

  return (
    <div className="gallery-browser stack">
      {showFilters && !matchId && (
        <div className="gallery-filters">
          <button
            type="button"
            className={`chip${!filterMatch && !tag ? " on" : ""}`}
            onClick={() => {
              setFilterMatch(null);
              setTag(null);
            }}
          >
            All
          </button>
          {state.config.fixtures.slice(0, 24).map((fx) => {
            const r = calc?.resolved[fx.id];
            const short = `${team(r?.a)?.short || r?.labelA || "A"}–${team(r?.b)?.short || r?.labelB || "B"}`;
            return (
              <button
                key={fx.id}
                type="button"
                className={`chip${filterMatch === fx.id ? " on" : ""}`}
                title={`${fx.stage} ${fx.id}`}
                onClick={() => {
                  setFilterMatch(fx.id);
                  setTag(null);
                }}
              >
                {short}
              </button>
            );
          })}
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${tag === t ? " on" : ""}`}
              onClick={() => {
                setTag(t);
                setFilterMatch(null);
              }}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {showModeration && role === "admin" && pending.length > 0 && (
        <section className="stack gallery-pending">
          <h2>Pending approval ({pending.length})</h2>
          {modMsg && <p className="note">{modMsg}</p>}
          <div className="gallery-grid">
            {pending.map((p) => (
              <article key={p.id} className="gallery-tile pending">
                <button type="button" className="gallery-thumb" onClick={() => setLightbox(p)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbUrl || p.blobUrl} alt={p.caption || "Pending photo"} loading="lazy" />
                </button>
                <div className="gallery-tile-actions">
                  <button type="button" className="btn gold" onClick={() => void moderate("approve", p.id)}>
                    Approve
                  </button>
                  <button type="button" className="btn" onClick={() => void moderate("reject", p.id)}>
                    Reject
                  </button>
                  <button type="button" className="btn ghost" onClick={() => void moderate("delete", p.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <Loading />
      ) : photos.length === 0 ? (
        <div className="empty">
          <p>No photos yet{filterMatch || tag ? " for this filter" : ""}.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="gallery-thumb"
              onClick={() => setLightbox(p)}
              aria-label={p.caption || "View photo"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl || p.blobUrl} alt={p.caption || ""} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {showUpload && (
        <section className="card gallery-contribute">
          {!contributeOpen ? (
            <button type="button" className="btn gold" onClick={() => setContributeOpen(true)}>
              Contribute a photo
            </button>
          ) : (
            <GalleryUpload
              matchId={filterMatch || matchId}
              onUploaded={() => {
                void load();
                setContributeOpen(false);
              }}
            />
          )}
        </section>
      )}

      {lightbox && (
        <div className="gallery-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <div className="gallery-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.blobUrl} alt={lightbox.caption || "Photo"} />
            <div className="gallery-lightbox-meta">
              {lightbox.caption && <p>{lightbox.caption}</p>}
              {lightbox.matchId && (
                <p className="note">
                  <a href={seasonHref(`/match/${lightbox.matchId}`)}>{matchLabel(lightbox.matchId)}</a>
                </p>
              )}
              {lightbox.tags.length > 0 && (
                <p className="note">{lightbox.tags.map((t) => `#${t}`).join(" ")}</p>
              )}
              <div className="row" style={{ justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
                <a className="btn gold" href={downloadUrl(lightbox)} download>
                  Download
                </a>
                {role === "admin" && (
                  <button type="button" className="btn ghost" onClick={() => void moderate("delete", lightbox.id)}>
                    Delete
                  </button>
                )}
                <button type="button" className="btn" onClick={() => setLightbox(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
