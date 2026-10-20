"use client";

import { useEffect, useRef } from "react";
import type { MatchState } from "@/lib/types";

type Intensity = "set" | "match";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}

const DEFAULT_COLORS = ["#f5bc28", "#e4572e", "#2ead6b", "#f5f1e6", "#4ea1ff", "#ff6bcb"];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Burst confetti from the top of the viewport. Safe to call repeatedly. */
export function fireConfetti(opts?: { colors?: string[]; intensity?: Intensity }) {
  if (typeof window === "undefined" || prefersReducedMotion()) return;

  const intensity = opts?.intensity ?? "set";
  const colors = opts?.colors?.filter(Boolean).length ? opts.colors! : DEFAULT_COLORS;
  const count = intensity === "match" ? 140 : 80;
  const duration = intensity === "match" ? 3200 : 2200;

  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const parts: Particle[] = [];
  const burst = (fromY: number, n: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = 6 + Math.random() * (intensity === "match" ? 12 : 9);
      parts.push({
        x: Math.random() * W(),
        y: fromY,
        vx: Math.cos(angle) * speed * (0.4 + Math.random()),
        vy: Math.sin(angle) * speed - (2 + Math.random() * 4),
        w: 5 + Math.random() * 7,
        h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: colors[i % colors.length],
        life: 1,
      });
    }
  };

  burst(-10, count, Math.PI * 0.95);
  if (intensity === "match") burst(H() * 0.35, Math.floor(count * 0.45), Math.PI * 1.1);

  const started = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = now - started;
    if (t > duration && parts.every((p) => p.life <= 0)) {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, W(), H());
    for (const p of parts) {
      p.vy += 0.18;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - t / duration);
      if (p.life <= 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    raf = requestAnimationFrame(tick);
  };
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(tick);
}

/**
 * Fires confetti when a set ends (awaiting next) or the match ends.
 * Skips the initial mount so opening a finished match doesn't celebrate again.
 */
export function useWinConfetti(
  matchKey: string,
  m: Pick<MatchState, "status" | "awaitingNext" | "setsA" | "setsB" | "cur">,
  colors: string[] = DEFAULT_COLORS,
) {
  const prevSig = useRef<string | null>(null);
  const prevKey = useRef(matchKey);
  const colorsKey = colors.join("|");

  useEffect(() => {
    if (prevKey.current !== matchKey) {
      prevKey.current = matchKey;
      prevSig.current = null;
    }

    const sig =
      m.status === "done"
        ? `done:${m.setsA}-${m.setsB}`
        : m.awaitingNext
          ? `set:${m.cur}:${m.setsA}-${m.setsB}`
          : "play";

    if (prevSig.current === null) {
      prevSig.current = sig;
      return;
    }
    if (prevSig.current === sig) return;

    const was = prevSig.current;
    prevSig.current = sig;
    const palette = colorsKey.split("|").filter(Boolean);

    if (sig.startsWith("done")) {
      fireConfetti({ intensity: "match", colors: palette });
    } else if (sig.startsWith("set") && was === "play") {
      fireConfetti({ intensity: "set", colors: palette });
    }
  }, [matchKey, m.status, m.awaitingNext, m.setsA, m.setsB, m.cur, colorsKey]);
}

/** Drop-in: celebrate set / match wins for a fixture. */
export function WinConfetti({
  matchKey,
  m,
  colors,
}: {
  matchKey: string;
  m: Pick<MatchState, "status" | "awaitingNext" | "setsA" | "setsB" | "cur">;
  colors?: string[];
}) {
  useWinConfetti(matchKey, m, colors);
  return null;
}
