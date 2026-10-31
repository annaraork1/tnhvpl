"use client";

import { Suspense } from "react";
import { GalleryBrowser } from "@/components/GalleryBrowser";
import { useLive } from "@/components/LiveProvider";
import { Loading } from "@/components/ui";

function GalleryInner() {
  const { state, role } = useLive();
  if (!state) return <Loading />;
  return (
    <>
      <div className="sechead">
        <div>
          <span className="kicker">Season moments</span>
          <h1>Gallery</h1>
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Match photos and tournament moments. Tap a shot to view or download.
        {role === "admin" ? " Pending public uploads show above for approval." : ""}
      </p>
      <GalleryBrowser showUpload showFilters showModeration={role === "admin"} />
    </>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GalleryInner />
    </Suspense>
  );
}
