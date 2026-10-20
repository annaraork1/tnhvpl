"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLive } from "@/components/LiveProvider";
import { LiveScore } from "@/components/LiveScore";
import { ShareMatch } from "@/components/ShareMatch";
import { Loading } from "@/components/ui";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { state, calc, team } = useLive();
  if (!state || !calc) return <Loading />;
  const fx = state.config.fixtures.find((f) => f.id === id);
  if (!fx) return <div className="empty">Match not found</div>;
  const m = calc.ms[fx.id];
  const r = calc.resolved[fx.id];
  const fmt = m.format;
  const title = `${team(r.a)?.name ?? r.labelA} vs ${team(r.b)?.name ?? r.labelB}`;
  return (
    <>
      <LiveScore fx={fx} link={false} share={false} />
      <p className="note" style={{ textAlign: "center" }}>
        Best of {fmt.bestOf} · sets to {fmt.targets.join("-")} · win by {fmt.winBy}
        {fmt.cap ? ` · cap ${fmt.cap}` : ""}. Updates by itself.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <ShareMatch id={fx.id} title={title} className="btn gold" />
        <Link className="btn" href="/fixtures">
          All fixtures
        </Link>
        {m.status !== "done" && (
          <Link className="btn" href={`/score/${fx.id}`}>
            Score this match
          </Link>
        )}
      </div>
    </>
  );
}
