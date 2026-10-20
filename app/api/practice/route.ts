import { NextResponse } from "next/server";
import { checkAction, derive } from "@/lib/engine";
import {
  abandonPractice,
  canScore,
  completePractice,
  createPractice,
  deleteCompletedPractice,
  getPractice,
  listCompletedPractices,
  PracticeError,
  resultFromEvents,
  toPublic,
  updatePracticeEvents,
  verifyHost,
} from "@/lib/practiceStore";
import type { MatchEvent, Side } from "@/lib/types";

export const dynamic = "force-dynamic";

const dev = process.env.NODE_ENV !== "production";
const ADMIN_PIN = process.env.ADMIN_PIN || (dev ? "1234" : "");

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function isAdmin(req: Request) {
  const pin = req.headers.get("x-pin");
  return Boolean(ADMIN_PIN && pin && pin === ADMIN_PIN);
}

const isSide = (s: unknown): s is Side => s === "A" || s === "B";

/** List completed practices. */
export async function GET() {
  const matches = await listCompletedPractices();
  return NextResponse.json({ ok: true, matches }, { headers: { "Cache-Control": "no-store" } });
}

/** Practice mutations (create / score / quick / complete / abandon / delete). */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Bad request");
  }
  const type = String(body.type ?? "");
  const hostToken = typeof body.hostToken === "string" ? body.hostToken : null;
  const admin = isAdmin(req);

  try {
    if (type === "create") {
      const { match, hostToken: token } = await createPractice({
        mode: body.mode === "quick" ? "quick" : "live",
        labelA: body.labelA as string | undefined,
        labelB: body.labelB as string | undefined,
        sideA: body.sideA,
        sideB: body.sideB,
        format: body.format,
        timeoutSeconds: body.timeoutSeconds as number | undefined,
        allowPublicScore: Boolean(body.allowPublicScore),
      });
      return NextResponse.json({
        ok: true,
        hostToken: token,
        match: toPublic(match, { hostToken: token }),
      });
    }

    const id = String(body.id ?? "");
    const match = await getPractice(id);
    if (!match) return err("Practice not found", 404);

    if (type === "score") {
      if (match.mode !== "live") return err("This practice is quick-result only", 409);
      if (match.status === "done") return err("Match is finished", 409);
      if (!canScore(match, hostToken)) return err("Only the host can score (or enable public scoring)", 403);

      const action = String(body.action ?? "");
      const fmt = match.format;
      const toSec = match.timeoutSeconds;

      const updated = await updatePracticeEvents(id, (m) => {
        if (m.status === "done") return "Match is finished";
        if (action === "undo") {
          if (!m.ev.length) return "Nothing to undo";
          m.ev.pop();
          if (!m.ev.length) m.status = "draft";
          return m;
        }
        let e: MatchEvent;
        if (action === "start") {
          if (!isSide(body.serve)) return "Choose who serves first";
          e = { k: "start", serve: body.serve, t: Date.now() };
        } else if (action === "point" || action === "timeout") {
          if (!isSide(body.side)) return "Bad side";
          e =
            action === "point"
              ? { k: "pt", s: body.side, t: Date.now() }
              : { k: "to", s: body.side, t: Date.now() };
        } else if (action === "resume") e = { k: "resume", t: Date.now() };
        else if (action === "nextSet") e = { k: "next", t: Date.now() };
        else return "Unknown score action";

        const problem = checkAction(m.ev, fmt, e, toSec);
        if (problem) return problem;
        m.ev.push(e);
        m.status = "live";
        return m;
      });

      const st = derive(updated.ev, updated.format, updated.timeoutSeconds);
      let final = updated;
      if (st.status === "done") {
        const result = resultFromEvents(updated.ev, updated.format, updated.timeoutSeconds);
        final = await completePractice({
          ...updated,
          setsWon: result.setsWon,
          setScores: result.setScores,
          winner: result.winner,
        });
      }
      return NextResponse.json({
        ok: true,
        match: toPublic(final, { hostToken }),
        state: derive(final.ev, final.format, final.timeoutSeconds),
      });
    }

    if (type === "quickResult") {
      if (!verifyHost(match, hostToken) && !admin) return err("Host token required", 403);
      if (match.status === "done") return err("Already completed", 409);
      const setsWon = body.setsWon as { a?: number; b?: number } | undefined;
      const a = Number(setsWon?.a);
      const b = Number(setsWon?.b);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return err("Enter sets won for both sides");
      if (a === b) return err("Sets won cannot be tied");
      const need = Math.ceil(match.format.bestOf / 2);
      if (Math.max(a, b) < need) return err(`Winner needs at least ${need} sets`);

      let setScores: { a: number; b: number }[] | undefined;
      if (Array.isArray(body.setScores)) {
        setScores = body.setScores
          .map((s) => ({ a: Number((s as { a: number }).a), b: Number((s as { b: number }).b) }))
          .filter((s) => Number.isInteger(s.a) && Number.isInteger(s.b) && s.a >= 0 && s.b >= 0);
        if (!setScores.length) setScores = undefined;
      }

      const winner: Side = a > b ? "A" : "B";
      const final = await completePractice({
        ...match,
        mode: "quick",
        setsWon: { a, b },
        setScores,
        winner,
        ev: match.ev,
      });
      return NextResponse.json({ ok: true, match: toPublic(final, { hostToken }) });
    }

    if (type === "complete") {
      if (!verifyHost(match, hostToken) && !admin) return err("Host token required", 403);
      if (match.status === "done") return err("Already completed", 409);
      const st = derive(match.ev, match.format, match.timeoutSeconds);
      if (st.status !== "done") return err("Match is not finished yet", 409);
      const result = resultFromEvents(match.ev, match.format, match.timeoutSeconds);
      const final = await completePractice({
        ...match,
        setsWon: result.setsWon,
        setScores: result.setScores,
        winner: result.winner,
      });
      return NextResponse.json({ ok: true, match: toPublic(final, { hostToken }) });
    }

    if (type === "abandon") {
      if (!verifyHost(match, hostToken) && !admin) return err("Only the host or admin can abandon", 403);
      await abandonPractice(id);
      return NextResponse.json({ ok: true });
    }

    if (type === "delete") {
      if (!admin) return err("Admin PIN needed", 403);
      await deleteCompletedPractice(id);
      return NextResponse.json({ ok: true });
    }

    return err("Unknown action");
  } catch (e) {
    if (e instanceof PracticeError) return err(e.message, 409);
    console.error(e);
    return err("Server error", 500);
  }
}
