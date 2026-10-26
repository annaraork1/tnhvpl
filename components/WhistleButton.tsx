"use client";

import { useRef } from "react";

const SRC = "/sounds/whistle_sound.mp3";
/** Extra loudness above the already-normalized file (1 = unity). Clips if too high. */
const GAIN = 2.5;

/** Umpire whistle — one short blast per tap (scorer screens only). */
export function WhistleButton({ className = "btn ghost" }: { className?: string }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const loadingRef = useRef<Promise<AudioBuffer> | null>(null);

  const ensureBuffer = async (ctx: AudioContext): Promise<AudioBuffer> => {
    if (bufferRef.current) return bufferRef.current;
    if (!loadingRef.current) {
      loadingRef.current = fetch(SRC)
        .then((r) => {
          if (!r.ok) throw new Error("whistle missing");
          return r.arrayBuffer();
        })
        .then((buf) => ctx.decodeAudioData(buf.slice(0)))
        .then((decoded) => {
          bufferRef.current = decoded;
          return decoded;
        })
        .catch((err) => {
          loadingRef.current = null;
          throw err;
        });
    }
    return loadingRef.current;
  };

  const play = () => {
    void (async () => {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        if (!ctxRef.current) ctxRef.current = new AC();
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") await ctx.resume();

        const buffer = await ensureBuffer(ctx);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = GAIN;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
      } catch {
        /* ignore autoplay / missing file / decode errors */
      }
    })();
  };

  return (
    <button type="button" className={className} onClick={play} aria-label="Umpire whistle">
      Whistle
    </button>
  );
}
