"use client";

import { useEffect, useState } from "react";
import {
  captureInstallPromptEarly,
  clearDeferredInstall,
  getDeferredInstall,
  isIosSafari,
  isStandalone,
  onCanInstall,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaInstall";
import { useLive } from "./LiveProvider";

const DISMISS_KEY = "tnhvpl-pwa-dismiss-until";
/** After "Not now", wait this long before showing the banner again. */
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function isDismissed(): boolean {
  try {
    // Older builds used a permanent flag — convert to a short cooldown so prompt can return.
    const legacy = localStorage.getItem("tnhvpl-pwa-dismiss");
    if (legacy === "1") {
      localStorage.removeItem("tnhvpl-pwa-dismiss");
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    }
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return true;
  }
}

function setDismissed(days = 7) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + (days > 0 ? days * 24 * 60 * 60 * 1000 : DISMISS_MS)));
  } catch {
    /* ignore */
  }
}

/** Banner: Android/Chrome uses beforeinstallprompt; iOS Safari shows Add to Home Screen tips. */
export function InstallPrompt() {
  const { state } = useLive();
  const appLabel = state?.meta?.short || state?.config.tournament.short || "TNHVPL";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    captureInstallPromptEarly();
    if (isStandalone() || isDismissed()) return;

    const sync = () => {
      const ev = getDeferredInstall();
      if (ev) {
        setDeferred(ev);
        setVisible(true);
      }
    };
    sync();
    const off = onCanInstall(sync);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      clearDeferredInstall();
      setDismissed(3650);
    };
    window.addEventListener("appinstalled", onInstalled);

    if (isIosSafari()) {
      setShowIos(true);
      setVisible(true);
    }

    return () => {
      off();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    setDeferred(null);
    setDismissed(7);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    clearDeferredInstall();
    setVisible(false);
    if (outcome === "accepted") setDismissed(3650);
  };

  if (!visible) return null;

  return (
    <div className="install-banner" role="dialog" aria-label="Install app">
      <div className="install-banner-body">
        <strong>Install {appLabel}</strong>
        {showIos && !deferred ? (
          <p>
            Tap <b>Share</b> then <b>Add to Home Screen</b> for a full-screen app icon.
          </p>
        ) : (
          <p>Add to your home screen for quick live scores.</p>
        )}
      </div>
      <div className="install-banner-actions">
        {deferred && (
          <button type="button" className="btn gold" onClick={install}>
            Install
          </button>
        )}
        <button type="button" className="btn ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
