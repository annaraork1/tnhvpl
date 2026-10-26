"use client";

import { useEffect, useState } from "react";
import { useLive } from "./LiveProvider";

const DISMISS_KEY = "tnhvpl-pwa-dismiss";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone;
  return mq || !!ios;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

/** Banner: Android uses beforeinstallprompt; iOS shows Add to Home Screen tips. Hidden once installed or dismissed. */
export function InstallPrompt() {
  const { state } = useLive();
  const appLabel = state?.meta?.short || state?.config.tournament.short || "TNHVPL";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("appinstalled", onInstalled);

    if (isIosSafari()) {
      setShowIos(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (outcome === "accepted") {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
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
