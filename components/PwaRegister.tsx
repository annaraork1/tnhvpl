"use client";

import { useEffect } from "react";
import { captureInstallPromptEarly } from "@/lib/pwaInstall";

/** Unlock screen orientation so installed PWAs follow the phone’s autorotate. */
function unlockOrientation() {
  try {
    const orient = window.screen?.orientation as ScreenOrientation & { unlock?: () => void };
    orient?.unlock?.();
  } catch {
    /* ignore — not all browsers allow unlock outside fullscreen */
  }
}

/** Register the installable service worker once on the client. */
export function PwaRegister() {
  // Capture beforeinstallprompt as early as this client module loads (before paint effects).
  captureInstallPromptEarly();

  useEffect(() => {
    captureInstallPromptEarly();
    unlockOrientation();
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      unlockOrientation();
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
