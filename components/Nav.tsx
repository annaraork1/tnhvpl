"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_LOGO } from "@/lib/tournaments";
import { useLive } from "./LiveProvider";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/standings", label: "Table" },
  { href: "/teams", label: "Teams" },
  { href: "/awards", label: "Awards" },
  { href: "/staff", label: "Staff" },
  { href: "/practice", label: "Practice" },
  { href: "/seasons", label: "Seasons" },
  { href: "/rules", label: "Rules" },
];

export function Nav() {
  const path = usePathname();
  const { state, error, seasonHref } = useLive();
  // Practice match pages keep the site header (completed / setup / continue).
  // Live scoring uses a fixed fullscreen .scorer that covers the nav.
  if (path.startsWith("/display") || path.startsWith("/auction/projector") || /^\/score\/.+/.test(path)) return null;
  const logo = state?.meta?.logo || DEFAULT_LOGO;
  const short = state?.meta?.short ?? state?.config.tournament.short ?? "TNHVPL";
  const subtitle = state?.meta?.subtitle ?? state?.config.tournament.subtitle ?? "";
  const seasonLabel = subtitle.includes("Season")
    ? subtitle.split("·").pop()?.trim() || subtitle
    : state?.tournamentKey?.replace(/^tnhvpl-?/i, "Season ") || "Season";

  return (
    <header className="nav">
      <div className="navin">
        <Link href={seasonHref("/")} className="brand">
          <img src={logo} alt="" width={40} height={40} />
          <span>
            <b>{short}</b>
            <small>{seasonLabel}</small>
          </span>
        </Link>
        <nav aria-label="Main">
          {LINKS.map((l) => {
            const global = l.href === "/seasons" || l.href === "/practice";
            const href = global ? l.href : seasonHref(l.href);
            const on =
              l.href === "/practice"
                ? path === "/practice" || path.startsWith("/practice/")
                : l.href === "/seasons"
                  ? path === "/seasons"
                  : l.href === "/staff"
                    ? path === "/staff" || path.startsWith("/staff/")
                    : path === l.href;
            return (
              <Link key={l.href} href={href} className={on ? "on" : ""}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {state?.viewingArchive && (
        <div className="offline archive-bar">
          Viewing archive <b>{state.tournamentKey}</b> ·{" "}
          <Link href="/">Back to active season</Link>
          {" · "}
          <Link href="/seasons">All seasons</Link>
        </div>
      )}
      {error && <div className="offline">{error}</div>}
      {state?.storage === "memory" && process.env.NODE_ENV === "production" && (
        <div className="offline">Demo mode: no database connected, scores are not saved. See README.</div>
      )}
    </header>
  );
}
