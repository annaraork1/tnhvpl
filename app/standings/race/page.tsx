"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLive } from "@/components/LiveProvider";
import { RaceCalculator } from "@/components/RaceCalculator";
import { Loading } from "@/components/ui";
import { PLAYOFF_QUALIFY } from "@/lib/qualify";

function RacePageInner() {
  const { seasonHref } = useLive();
  const params = useSearchParams();
  const team = params.get("team");
  const targetRaw = Number(params.get("target"));
  const target = Number.isFinite(targetRaw) && targetRaw > 0 ? targetRaw : PLAYOFF_QUALIFY;

  return (
    <>
      <div className="sechead">
        <h1>Race calculator</h1>
        <Link className="btn ghost" href={seasonHref("/standings")}>
          ← Points table
        </Link>
      </div>
      <RaceCalculator initialTeamId={team} initialTarget={target} />
    </>
  );
}

export default function RacePage() {
  return (
    <Suspense fallback={<Loading />}>
      <RacePageInner />
    </Suspense>
  );
}
