"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLive } from "./LiveProvider";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/standings", label: "Table" },
  { href: "/teams", label: "Teams" },
  { href: "/awards", label: "Awards" },
  { href: "/rules", label: "Rules" },
];

export function Nav() {
  const path = usePathname();
  const { state, error } = useLive();
  if (path.startsWith("/display") || /^\/score\/.+/.test(path)) return null; // full-screen views
  return (
    <header className="nav">
      <div className="navin">
        <Link href="/" className="brand">
          <img src="/logo.png" alt="" width={40} height={40} />
          <span>
            <b>{state?.config.tournament.short ?? "TNHVPL"}</b>
            <small>Season 5</small>
          </span>
        </Link>
        <nav aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      {error && <div className="offline">{error}</div>}
      {state?.storage === "memory" && process.env.NODE_ENV === "production" && (
        <div className="offline">Demo mode: no database connected, scores are not saved. See README.</div>
      )}
    </header>
  );
}
