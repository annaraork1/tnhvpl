"use client";

import { useEffect } from "react";
import { captureInstallPromptEarly } from "@/lib/pwaInstall";

/** Register the installable service worker once on the client. */
export function PwaRegister() {
  // Capture beforeinstallprompt as early as this client module loads (before paint effects).
  captureInstallPromptEarly();

  useEffect(() => {
    captureInstallPromptEarly();
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
