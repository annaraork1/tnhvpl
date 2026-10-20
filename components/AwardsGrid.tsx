"use client";

import { AWARD_LABELS, filledAwards } from "@/lib/awards";
import type { Awards } from "@/lib/types";
import { useLive } from "./LiveProvider";
import { Logo } from "./ui";

/** Team-colored award cards with player photos (home + /awards). */
export function AwardsGrid({ awards, emptyNote }: { awards: Awards; emptyNote?: string }) {
  const { state, team } = useLive();
  if (!state) return null;
  const show = state.config.settings.showPhotos;
  const list = filledAwards(awards);
  if (!list.length) {
    return emptyNote ? <p className="note">{emptyNote}</p> : null;
  }
  return (
    <div className="awards">
      {list.map(({ id, entry }) => {
        const p = state.players.find((x) => x.no === entry.playerNo);
        const t = team(entry.teamId);
        if (!p || !t) return null;
        return (
          <article key={id} className="card award" style={{ ["--tc" as string]: t.color }}>
            <span className="kicker">{AWARD_LABELS[id]}</span>
            {show && p.photo ? (
              <img src={p.photo} alt="" loading="lazy" />
            ) : (
              <div className="noimg">{p.name[0]}</div>
            )}
            <b>{p.name}</b>
            <div className="award-team">
              <Logo team={t} size={22} />
              <span>{t.name}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
