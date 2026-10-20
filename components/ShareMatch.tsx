"use client";

import { useState } from "react";

function matchUrl(id: string) {
  if (typeof window === "undefined") return `/match/${id}`;
  return `${window.location.origin}/match/${id}`;
}

/** Share or copy the public spectator link for a match. */
export function ShareMatch({
  id,
  title,
  className = "btn",
}: {
  id: string;
  title?: string;
  className?: string;
}) {
  const [note, setNote] = useState("");

  const share = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = matchUrl(id);
    const text = title ? `${title} — live score` : "Live match score";
    try {
      if (navigator.share) {
        await navigator.share({ title: title ?? "Match", text, url });
        return;
      }
    } catch (err) {
      // User cancelled share sheet — don't fall through to copy.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied");
      setTimeout(() => setNote((n) => (n === "Link copied" ? "" : n)), 2000);
    } catch {
      setNote("Could not copy link");
      setTimeout(() => setNote(""), 2000);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={share} aria-label="Share match link">
        Share link
      </button>
      {note && <span className="toast">{note}</span>}
    </>
  );
}
