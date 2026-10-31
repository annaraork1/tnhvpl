"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BestPlayerNote, BestPlayerPicker } from "@/components/BestPlayerPicker";
import { useLive } from "@/components/LiveProvider";
import { LiveScore } from "@/components/LiveScore";
import { MatchGallery } from "@/components/MatchGallery";
import { ShareMatch } from "@/components/ShareMatch";
import { Loading } from "@/components/ui";
import { formatFor } from "@/lib/engine";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { state, calc, team, role, seasonHref } = useLive();
  const [editMotm, setEditMotm] = useState(false);
  if (!state || !calc) return <Loading />;
  const fx = state.config.fixtures.find((f) => f.id === id);
  if (!fx) return <div className="empty">Match not found</div>;
  const m = calc.ms[fx.id];
  const r = calc.resolved[fx.id];
  const fmt = formatFor(fx, state.config.settings);
  const title = `${team(r.a)?.name ?? r.labelA} vs ${team(r.b)?.name ?? r.labelB}`;
  const staff = role === "admin" || role === "scorer";
  const canEditMotm = staff && m.status === "done" && !!r.a && !!r.b;
  const hasMotm = !!state.matches[fx.id]?.bestPlayer;

  return (
    <>
      <LiveScore fx={fx} link={false} share={false} />
      {m.status !== "scheduled" && (
        <p className="note" style={{ textAlign: "center" }}>
          Best of {fmt.bestOf} · sets to {fmt.targets.join("-")} · win by {fmt.winBy}
          {fmt.cap ? ` · cap ${fmt.cap}` : ""}. Updates by itself.
        </p>
      )}
      <BestPlayerNote matchId={fx.id} />
      <div className="row" style={{ justifyContent: "center" }}>
        <ShareMatch id={fx.id} title={title} className="btn gold" />
        <Link className="btn" href={seasonHref("/fixtures")}>
          All fixtures
        </Link>
        {m.status !== "done" && (
          <Link className="btn" href={seasonHref(`/score/${fx.id}`)}>
            Score this match
          </Link>
        )}
        {canEditMotm && (
          <button type="button" className="btn gold" onClick={() => setEditMotm((v) => !v)}>
            {editMotm ? "Close" : hasMotm ? "Update man of the match" : "Set man of the match"}
          </button>
        )}
        {m.status === "done" && staff && (
          <Link className="btn" href={seasonHref(`/score/${fx.id}`)}>
            Open scorer
          </Link>
        )}
      </div>
      {canEditMotm && editMotm && (
        <div className="card motm-edit-card">
          <BestPlayerPicker
            matchId={fx.id}
            teamA={r.a!}
            teamB={r.b!}
            title={hasMotm ? "Update man of the match" : "Set man of the match"}
          />
        </div>
      )}
      <MatchGallery matchId={fx.id} />
    </>
  );
}
