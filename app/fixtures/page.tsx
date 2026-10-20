"use client";

import { useLive } from "@/components/LiveProvider";
import { Loading, MatchRow, fmtDate } from "@/components/ui";

export default function Fixtures() {
  const { state } = useLive();
  if (!state) return <Loading />;
  const fx = [...state.config.fixtures].sort((a, b) => a.no - b.no);
  const days = Array.from(new Set(fx.map((f) => f.date)));
  return (
    <>
      <h1>Fixtures</h1>
      {days.map((d) => (
        <section key={d} className="stack">
          <h2>
            {fx.find((f) => f.date === d)?.day} · {fmtDate(d)}
          </h2>
          <div className="mlist">
            {fx
              .filter((f) => f.date === d)
              .map((f) => (
                <MatchRow key={f.id} fx={f} />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
