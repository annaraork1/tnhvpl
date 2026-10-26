"use client";

import { useEffect, useState } from "react";
import {
  captureInstallPromptEarly,
  getDeferredInstall,
  isIosSafari,
  isStandalone,
  onCanInstall,
  promptPwaInstall,
} from "@/lib/pwaInstall";

/**
 * Compact Install control for the home title row — works when the bottom banner
 * did not appear (or was dismissed). Hides once the app is already installed.
 */
export function InstallAppButton({ className = "btn ghost install-app-btn" }: { className?: string }) {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    captureInstallPromptEarly();
    if (isStandalone()) {
      setInstalled(true);
      setReady(true);
      return;
    }
    setIos(isIosSafari());
    setCanPrompt(!!getDeferredInstall());
    setReady(true);
    const off = onCanInstall(() => setCanPrompt(!!getDeferredInstall()));
    const onInstalled = () => {
      setInstalled(true);
      setCanPrompt(false);
      setHint("");
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      off();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(""), 6000);
    return () => clearTimeout(t);
  }, [hint]);

  // Already installed / SSR — don't reserve space
  if (!ready || installed) return null;

  const onClick = async () => {
    setBusy(true);
    const result = await promptPwaInstall();
    setBusy(false);
    if (result === "accepted" || result === "standalone") {
      setInstalled(true);
      setHint("");
      setCanPrompt(false);
      return;
    }
    if (result === "ios") {
      setHint("Tap Share, then Add to Home Screen.");
      return;
    }
    if (result === "dismissed") {
      setCanPrompt(!!getDeferredInstall());
      return;
    }
    // unavailable — Chrome has not fired beforeinstallprompt for this visit yet
    if (ios) {
      setHint("Tap Share, then Add to Home Screen.");
    } else {
      setHint("This browser hasn’t offered a one-tap install yet. Open the menu (⋮) and choose Install app.");
    }
  };

  return (
    <div className="install-app-wrap">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => void onClick()}
        aria-label={canPrompt ? "Install app" : "How to install this app"}
        title={canPrompt ? "Install app" : "Install help"}
      >
        {busy ? "…" : "Install"}
      </button>
      {hint && (
        <p className="install-app-hint" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
