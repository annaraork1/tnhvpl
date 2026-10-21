"use client";

import { useEffect, useState } from "react";

/** Locale date/time that only renders after mount — avoids SSR hydration mismatches. */
export function ClientTime({
  value,
  mode = "datetime",
  className,
}: {
  value: number | string | Date;
  mode?: "datetime" | "time" | "date";
  className?: string;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      setText("");
      return;
    }
    if (mode === "time") {
      setText(d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }));
    } else if (mode === "date") {
      setText(d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }));
    } else {
      setText(d.toLocaleString("en-IN"));
    }
  }, [value, mode]);

  if (!text) return null;
  return <span className={className}>{text}</span>;
}
