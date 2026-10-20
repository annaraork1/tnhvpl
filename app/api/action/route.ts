import { NextResponse } from "next/server";
import { normalizeAwards, teamForPlayer, validateAwards } from "@/lib/awards";
import { checkAction, computeAll, derive, formatFor } from "@/lib/engine";
import {
  ActionError,
  createTournamentSeason,
  loadState,
  resetAll,
  updateConfig,
  updateMatch,
  updateRegistry,
} from "@/lib/store";
import { DEFAULT_LOGO } from "@/lib/tournaments";
import type { Awards, Config, Fixture, MatchEvent, Settings, Side, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

const dev = process.env.NODE_ENV !== "production";
const ADMIN_PIN = process.env.ADMIN_PIN || (dev ? "1234" : "");
const SCORER_PIN = process.env.SCORER_PIN || (dev ? "1111" : "");

type Role = "admin" | "scorer" | null;
function roleFor(pin: string | null): Role {
  if (!pin) return null;
  if (ADMIN_PIN && pin === ADMIN_PIN) return "admin";
  if (SCORER_PIN && pin === SCORER_PIN) return "scorer";
  return null;
}

const MATCH_ACTIONS = new Set(["start", "point", "timeout", "resume", "nextSet", "undo"]);
const SCORER_OK = new Set([...MATCH_ACTIONS, "saveAwards", "setBestPlayer"]);
const isSide = (s: unknown): s is Side => s === "A" || s === "B";

export async function POST(req: Request) {
  if (!ADMIN_PIN) return err("ADMIN_PIN is not set on the server. Add it in Vercel → Settings → Environment Variables.", 500);
  const role = roleFor(req.headers.get("x-pin"));
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Bad request", 400);
  }
  const type = String(body.type ?? "");
  if (type === "checkPin") return role ? NextResponse.json({ ok: true, role }) : err("Wrong PIN", 401);
  if (!role) return err("Wrong PIN", 401);
  if (!SCORER_OK.has(type) && role !== "admin") return err("Admin PIN needed", 403);

  try {
    const season = typeof body.season === "string" ? body.season : null;
    const state = await loadState(season);
    const prefix = state.tournamentKey;
    const id = String(body.id ?? "");
    const fx = state.config.fixtures.find((f) => f.id === id);
    const players = state.players;

    if (MATCH_ACTIONS.has(type)) {
      if (!fx) return err("Unknown match", 404);
      const fmt = formatFor(fx, state.config.settings);
      if (type === "start") {
        const r = computeAll(state).resolved[id];
        if (!r?.a || !r?.b) return err("The teams for this match aren't decided yet", 409);
      }
      const toSec = state.config.settings.timeoutSeconds ?? 30;
      await updateMatch(prefix, id, (m) => {
        if (type === "undo") {
          if (!m.ev.length) return "Nothing to undo";
          m.ev.pop();
          const after = derive(m.ev, fmt, toSec);
          if (after.status !== "done") m.bestPlayer = null;
          return m;
        }
        let e: MatchEvent;
        if (type === "start") {
          if (!isSide(body.serve)) return "Choose who serves first";
          e = { k: "start", serve: body.serve };
        } else if (type === "point" || type === "timeout") {
          if (!isSide(body.side)) return "Bad side";
          e = type === "point" ? { k: "pt", s: body.side } : { k: "to", s: body.side };
        } else if (type === "resume") e = { k: "resume" };
        else e = { k: "next" };
        const problem = checkAction(m.ev, fmt, e, toSec);
        if (problem) return problem;
        e.t = Date.now();
        m.ev.push(e);
        return m;
      });
    } else if (type === "setBestPlayer") {
      if (!fx) return err("Unknown match", 404);
      const calc = computeAll(state);
      if (calc.ms[id]?.status !== "done") return err("Pick best player after the match finishes", 409);
      const r = calc.resolved[id];
      if (!r?.a || !r?.b) return err("Teams not decided", 409);
      const raw = body.playerNo;
      if (raw === null || raw === "" || raw === undefined) {
        await updateMatch(prefix, id, (m) => ({ ...m, bestPlayer: null }));
      } else {
        const playerNo = Number(raw);
        if (!Number.isInteger(playerNo)) return err("Bad player", 400);
        const t = teamForPlayer(playerNo, state.config.teams, players);
        if (!t || (t.id !== r.a && t.id !== r.b)) return err("Player must be from one of the two teams", 400);
        await updateMatch(prefix, id, (m) => ({ ...m, bestPlayer: { playerNo, teamId: t.id } }));
      }
    } else if (type === "resetMatch") {
      if (!fx) return err("Unknown match", 404);
      await updateMatch(prefix, id, (m) => ({ ...m, ev: [], bestPlayer: null }));
    } else if (type === "setTeams") {
      if (!fx) return err("Unknown match", 404);
      const ids = new Set(state.config.teams.map((t) => t.id));
      const a = body.a ? String(body.a) : undefined;
      const b = body.b ? String(body.b) : undefined;
      if ((a && !ids.has(a)) || (b && !ids.has(b))) return err("Unknown team", 400);
      if (a && b && a === b) return err("A team cannot play itself", 400);
      await updateMatch(prefix, id, (m) => ({ ...m, over: a || b ? { a, b } : undefined }));
    } else if (type === "saveSettings") {
      const s = body.settings as Settings;
      const problem = validateSettings(s);
      if (problem) return err(problem, 400);
      await updateConfig(prefix, (c) => ({ ...c, settings: s }));
    } else if (type === "saveTeams") {
      const list = body.teams as Team[];
      if (!Array.isArray(list)) return err("Bad teams", 400);
      const playersIn = Array.isArray(body.players) ? (body.players as Config["players"]) : null;
      await updateConfig(prefix, (c) => {
        const nextTeams = list.map((u, i) => {
          const prev = c.teams.find((t) => t.id === u.id);
          const id =
            String(u.id || prev?.id || `team${i + 1}`)
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "")
              .slice(0, 24) || `team${i + 1}`;
          const squad = Array.isArray(u.squad)
            ? u.squad.map(Number).filter((n) => Number.isInteger(n) && n > 0)
            : prev?.squad ?? [];
          return {
            id,
            name: String(u.name || prev?.name || "Team").slice(0, 40),
            short: String(u.short || prev?.short || id.slice(0, 3).toUpperCase()).slice(0, 6),
            owner: String(u.owner ?? prev?.owner ?? "").slice(0, 40),
            color: /^#[0-9a-fA-F]{6}$/.test(u.color) ? u.color : prev?.color || "#4CC9F0",
            logo: String(u.logo || prev?.logo || DEFAULT_LOGO).slice(0, 400_000),
            squad,
          };
        });
        let players = c.players;
        if (playersIn) {
          players = playersIn.map((p) => ({
            no: Number(p.no),
            name: String(p.name || "Player").slice(0, 40),
            skill: ["Beginner", "Intermediate", "Advanced"].includes(String(p.skill))
              ? String(p.skill)
              : "Intermediate",
            photo: p.photo == null || p.photo === "" ? null : String(p.photo).slice(0, 400_000),
            team: p.team ? String(p.team).slice(0, 24) : undefined,
          })).filter((p) => Number.isInteger(p.no) && p.no > 0);
        }
        return { ...c, teams: nextTeams, players };
      });
    } else if (type === "saveFixtures") {
      const list = body.fixtures as Pick<Fixture, "id" | "date" | "day" | "time">[];
      if (!Array.isArray(list)) return err("Bad fixtures", 400);
      await updateConfig(prefix, (c) => ({
        ...c,
        fixtures: c.fixtures.map((f) => {
          const u = list.find((x) => x.id === f.id);
          return u
            ? { ...f, date: String(u.date || f.date), day: String(u.day || f.day), time: String(u.time || f.time) }
            : f;
        }),
      }));
    } else if (type === "saveTournament") {
      const t = body.tournament as Config["tournament"];
      await updateConfig(prefix, (c) => ({
        ...c,
        tournament: {
          ...c.tournament,
          name: String(t?.name || c.tournament.name).slice(0, 60),
          short: String(t?.short || c.tournament.short).slice(0, 20),
          subtitle: String(t?.subtitle ?? c.tournament.subtitle).slice(0, 80),
          dates: String(t?.dates ?? c.tournament.dates).slice(0, 60),
        },
      }));
      // Keep registry labels in sync for the season being edited.
      await updateRegistry((reg) => ({
        ...reg,
        tournaments: reg.tournaments.map((m) =>
          m.key === prefix
            ? {
                ...m,
                name: String(t?.name || m.name).slice(0, 60),
                short: String(t?.short || m.short).slice(0, 20),
                subtitle: String(t?.subtitle ?? m.subtitle).slice(0, 80),
                dates: String(t?.dates ?? m.dates).slice(0, 60),
              }
            : m,
        ),
      }));
    } else if (type === "saveAwards") {
      const calc = computeAll(state);
      const final = state.config.fixtures.find((f) => f.stage === "Final");
      if (!final || calc.ms[final.id]?.status !== "done") {
        return err("Awards can be set after the Final is finished", 409);
      }
      const awards = normalizeAwards(body.awards as Awards);
      const problem = validateAwards(awards, state.config, players);
      if (problem) return err(problem, 400);
      await updateConfig(prefix, (c) => ({ ...c, awards }));
    } else if (type === "createTournament") {
      const key = String(body.key ?? "").trim().toLowerCase();
      const mode = body.mode === "blank" ? "blank" : "clone";
      await createTournamentSeason({
        key,
        name: String(body.name ?? key),
        short: String(body.short ?? "TNHVPL"),
        subtitle: String(body.subtitle ?? ""),
        dates: String(body.dates ?? ""),
        logo: String(body.logo ?? DEFAULT_LOGO),
        mode,
        cloneFrom: typeof body.cloneFrom === "string" ? body.cloneFrom : undefined,
      });
    } else if (type === "setActiveTournament") {
      const key = String(body.key ?? "").trim().toLowerCase();
      await updateRegistry((reg) => {
        if (!reg.tournaments.some((t) => t.key === key)) return "Unknown tournament";
        return { ...reg, activeKey: key };
      });
    } else if (type === "updateTournamentMeta") {
      const key = String(body.key ?? prefix).trim().toLowerCase();
      await updateRegistry((reg) => {
        if (!reg.tournaments.some((t) => t.key === key)) return "Unknown tournament";
        return {
          ...reg,
          tournaments: reg.tournaments.map((m) => {
            if (m.key !== key) return m;
            return {
              ...m,
              name: body.name != null ? String(body.name).slice(0, 60) : m.name,
              short: body.short != null ? String(body.short).slice(0, 20) : m.short,
              subtitle: body.subtitle != null ? String(body.subtitle).slice(0, 80) : m.subtitle,
              dates: body.dates != null ? String(body.dates).slice(0, 60) : m.dates,
              logo: body.logo != null ? String(body.logo).slice(0, 400_000) : m.logo,
            };
          }),
        };
      });
      // Mirror name fields into season config when editing the loaded season.
      if (key === prefix && (body.name != null || body.subtitle != null || body.dates != null || body.short != null)) {
        await updateConfig(prefix, (c) => ({
          ...c,
          tournament: {
            ...c.tournament,
            name: body.name != null ? String(body.name).slice(0, 60) : c.tournament.name,
            short: body.short != null ? String(body.short).slice(0, 20) : c.tournament.short,
            subtitle: body.subtitle != null ? String(body.subtitle).slice(0, 80) : c.tournament.subtitle,
            dates: body.dates != null ? String(body.dates).slice(0, 60) : c.tournament.dates,
          },
        }));
      }
    } else if (type === "resetAll") {
      if (body.confirm !== "RESET") return err("Type RESET to confirm", 400);
      await resetAll(prefix);
    } else return err("Unknown action", 400);

    const viewSeason = typeof body.season === "string" ? body.season : prefix;
    return NextResponse.json({ ok: true, state: await loadState(viewSeason) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ActionError) return err(e.message, 409);
    console.error(e);
    return err("Server error", 500);
  }
}

function validateSettings(s: Settings): string | null {
  if (!s || typeof s !== "object") return "Bad settings";
  for (const f of [s.league, s.playoff]) {
    if (!f || ![1, 3, 5].includes(f.bestOf)) return "Best of must be 1, 3 or 5";
    if (!Array.isArray(f.targets) || !f.targets.length || f.targets.some((n) => !Number.isInteger(n) || n < 1 || n > 99))
      return "Set targets must be whole numbers";
    if (!Number.isInteger(f.winBy) || f.winBy < 1 || f.winBy > 5) return "Win by must be 1–5";
    if (!Number.isInteger(f.cap) || f.cap < 0) return "Cap must be 0 (none) or a score";
    if (f.cap > 0 && f.cap < Math.max(...f.targets)) return "Cap must be higher than the set target";
    if (!Number.isInteger(f.timeouts) || f.timeouts < 0 || f.timeouts > 5) return "Timeouts must be 0–5";
  }
  if (!Number.isInteger(s.timeoutSeconds) || s.timeoutSeconds < 5 || s.timeoutSeconds > 300)
    return "Timeout length must be 5–300 seconds";
  if (!s.points || typeof s.points !== "object") return "Bad points";
  for (const v of Object.values(s.points))
    if (!Number.isFinite(v?.w) || !Number.isFinite(v?.l)) return "Points must be numbers";
  if (!Array.isArray(s.tiebreak)) return "Bad tie-break order";
  return null;
}

function err(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
