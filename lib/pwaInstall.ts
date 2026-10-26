/** Early capture of beforeinstallprompt — must run before React effects or the event is lost. */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __tnhvplDeferredInstall?: BeforeInstallPromptEvent | null;
  }
}

const CAN_INSTALL = "tnhvpl-can-install";

let listening = false;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone;
  return mq || !!ios;
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

/** Idempotent: stash BIP on window as soon as Chrome fires it. */
export function captureInstallPromptEarly() {
  if (typeof window === "undefined" || listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__tnhvplDeferredInstall = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(CAN_INSTALL));
  });
  window.addEventListener("appinstalled", () => {
    window.__tnhvplDeferredInstall = null;
  });
}

export function getDeferredInstall(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__tnhvplDeferredInstall ?? null;
}

export function clearDeferredInstall() {
  if (typeof window === "undefined") return;
  window.__tnhvplDeferredInstall = null;
}

export function onCanInstall(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CAN_INSTALL, cb);
  return () => window.removeEventListener(CAN_INSTALL, cb);
}

/** Trigger Chrome/Edge install UI when available. Returns outcome or why it could not run. */
export async function promptPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable" | "ios" | "standalone"> {
  if (isStandalone()) return "standalone";
  if (isIosSafari()) return "ios";
  const deferred = getDeferredInstall();
  if (!deferred) return "unavailable";
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  clearDeferredInstall();
  return outcome;
}

export { CAN_INSTALL };
