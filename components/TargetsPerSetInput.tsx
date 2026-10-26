"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatTargetsText,
  parseTargetsText,
  targetsFitBestOf,
  targetsPlaceholder,
} from "@/lib/targetsInput";

/**
 * Free-text points-per-set field. Keeps commas while typing (unlike binding
 * directly to `targets.join(",")`, which ate separators on every keystroke).
 */
export function TargetsPerSetInput({
  value,
  bestOf,
  onChange,
  id,
}: {
  value: number[];
  bestOf: number;
  onChange: (targets: number[]) => void;
  id?: string;
}) {
  const [text, setText] = useState(() => formatTargetsText(value));
  const focused = useRef(false);
  const error = targetsFitBestOf(bestOf, value);

  useEffect(() => {
    if (!focused.current) setText(formatTargetsText(value));
  }, [value]);

  return (
    <div className="stack" style={{ gap: 4 }}>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder={targetsPlaceholder(bestOf)}
        value={text}
        aria-label="Points per set"
        aria-invalid={!!error}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = parseTargetsText(raw);
          if (parsed.length) onChange(parsed);
        }}
        onBlur={() => {
          focused.current = false;
          const parsed = parseTargetsText(text);
          if (parsed.length) {
            onChange(parsed);
            setText(formatTargetsText(parsed));
          } else {
            setText(formatTargetsText(value));
          }
        }}
      />
      <small className="muted" style={{ margin: 0 }}>
        {bestOf === 1
          ? "Best of 1 → one score to win the set (e.g. 25)."
          : `Up to ${bestOf} numbers for sets 1–${bestOf} (e.g. ${targetsPlaceholder(bestOf)}). Last value repeats if needed.`}
      </small>
      {error && (
        <p className="error" style={{ margin: 0, fontSize: 13 }}>
          {error}
        </p>
      )}
    </div>
  );
}
