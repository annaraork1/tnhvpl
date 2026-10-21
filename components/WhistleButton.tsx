"use client";

import { useRef } from "react";

const SRC = "/sounds/whistle_sound.mp3";

/** Umpire whistle — one short blast per tap (scorer screens only). */
export function WhistleButton({ className = "btn ghost" }: { className?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(SRC);
        audioRef.current.preload = "auto";
      }
      const a = audioRef.current;
      a.currentTime = 0;
      void a.play().catch(() => {});
    } catch {
      /* ignore autoplay / missing file */
    }
  };

  return (
    <button type="button" className={className} onClick={play} aria-label="Umpire whistle">
      Whistle
    </button>
  );
}
