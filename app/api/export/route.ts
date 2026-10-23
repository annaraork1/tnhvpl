import { NextResponse } from "next/server";
import { deriveAuction } from "@/lib/auction";
import { defaultAuctionSettings } from "@/lib/season";
import { loadAuction, loadPrivate, loadRegistrationEntries } from "@/lib/seasonStore";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

const dev = process.env.NODE_ENV !== "production";
const ADMIN_PIN = process.env.ADMIN_PIN || (dev ? "1234" : "");

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

/** Admin-only CSV exports: ?kind=auction|registrations|squads&season= */
export async function GET(req: Request) {
  const pin = req.headers.get("x-pin");
  if (!ADMIN_PIN || pin !== ADMIN_PIN) {
    return NextResponse.json({ ok: false, error: "Admin PIN needed" }, { status: 401 });
  }
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "auction";
  const season = url.searchParams.get("season");
  const state = await loadState(season);
  const prefix = state.tournamentKey;

  if (kind === "registrations") {
    const entries = await loadRegistrationEntries(prefix);
    const csv = toCsv(
      ["id", "status", "name", "skill", "phone", "tower", "age", "email", "available", "source"],
      entries.map((e) => [
        e.id,
        e.status,
        e.name,
        e.skill,
        e.priv.phone,
        e.priv.tower,
        e.priv.age,
        e.priv.email ?? "",
        e.priv.available ?? "",
        e.priv.source,
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${prefix}-registrations.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (kind === "squads") {
    const rows: (string | number)[][] = [];
    for (const t of state.config.teams) {
      for (const no of t.squad) {
        const p = state.players.find((x) => x.no === no);
        rows.push([t.name, no, p?.name ?? "", p?.skill ?? ""]);
      }
    }
    const csv = toCsv(["team", "no", "name", "skill"], rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${prefix}-squads.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // auction results
  const doc = await loadAuction(prefix);
  const settings = state.config.auction ?? defaultAuctionSettings();
  const st = deriveAuction(doc.ev, settings, state.config.teams, state.players);
  const priv = await loadPrivate(prefix);
  const rows = state.players.map((p) => {
    const sale = st.sold[p.no];
    const team = sale ? state.config.teams.find((t) => t.id === sale.teamId)?.name ?? sale.teamId : "";
    const pr = p.id ? priv.players[p.id] : undefined;
    return [
      p.no,
      p.name,
      p.skill,
      team,
      sale?.amount ?? "",
      sale?.round ?? "",
      pr?.phone ?? "",
      pr?.tower ?? "",
      pr?.age ?? "",
      pr?.email ?? "",
    ];
  });
  const csv = toCsv(
    ["no", "name", "skill", "team", "price", "round", "phone", "tower", "age", "email"],
    rows,
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${prefix}-auction.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
