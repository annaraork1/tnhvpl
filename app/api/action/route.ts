import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { checkAuctionEvent, deriveAuction, pickDrawNumber } from "@/lib/auction";
import { normalizeAwards, teamForPlayer, validateAwards } from "@/lib/awards";
import { checkAction, computeAll, derive, formatFor } from "@/lib/engine";
import { generateFixtures } from "@/lib/fixtures";
import { stageBlocksAction } from "@/lib/stageLocks";
import { hashOwnerPin, verifyOwnerPin } from "@/lib/ownerAuth";
import {
  assignAuctionNumbers,
  entryToPublicPlayer,
  formatPhoneDisplay,
  normalizeAge,
  normalizeAvailable,
  normalizeSkill,
  normalizeTower,
  titleCaseName,
} from "@/lib/registration";
import { defaultAuctionSettings, defaultRegistrationSettings, effectiveStage } from "@/lib/season";
import {
  emptyAuction,
  emptyOwners,
  emptyPrivate,
  loadAuction,
  loadOwners,
  loadRegistrationEntries,
  loadRegistrationEntry,
  newPlayerId,
  newRegId,
  savePhoto,
  saveRegistrationEntry,
  updateAuction,
  updateOwners,
  updatePrivate,
} from "@/lib/seasonStore";
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
import type {
  AuctionEvent,
  AuctionSettings,
  Awards,
  Config,
  Fixture,
  FixtureGenSettings,
  MatchEvent,
  Player,
  PlayerPrivate,
  RegistrationEntry,
  RegistrationSettings,
  SeasonStage,
  Settings,
  Side,
  Team,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const dev = process.env.NODE_ENV !== "production";
const ADMIN_PIN = process.env.ADMIN_PIN || (dev ? "1234" : "");
const SCORER_PIN = process.env.SCORER_PIN || (dev ? "1111" : "");
const AUCTIONEER_PIN = process.env.AUCTIONEER_PIN || (dev ? "2222" : "");

type Role = "admin" | "scorer" | "auctioneer" | "owner";

function staffRoleFor(pin: string | null): Role | null {
  if (!pin) return null;
  if (ADMIN_PIN && pin === ADMIN_PIN) return "admin";
  if (SCORER_PIN && pin === SCORER_PIN) return "scorer";
  if (AUCTIONEER_PIN && pin === AUCTIONEER_PIN) return "auctioneer";
  return null;
}

const MATCH_ACTIONS = new Set(["start", "point", "timeout", "resume", "nextSet", "undo"]);
const SCORER_OK = new Set([...MATCH_ACTIONS, "saveAwards", "setBestPlayer"]);
const AUCTIONEER_OK = new Set([
  "auctionStart",
  "auctionDraw",
  "auctionReveal",
  "auctionBid",
  "auctionSold",
  "auctionUnsold",
  "auctionUndo",
  "auctionFix",
  "auctionNextRound",
  "auctionPause",
  "auctionResume",
  "auctionPenalty",
]);
const OWNER_OK = new Set(["auctionBid"]);
const isSide = (s: unknown): s is Side => s === "A" || s === "B";

function allowAction(role: Role, type: string): boolean {
  if (role === "admin") return true;
  if (role === "scorer") return SCORER_OK.has(type);
  if (role === "auctioneer") return AUCTIONEER_OK.has(type);
  if (role === "owner") return OWNER_OK.has(type);
  return false;
}

export async function POST(req: Request) {
  if (!ADMIN_PIN) return err("ADMIN_PIN is not set on the server. Add it in Vercel → Settings → Environment Variables.", 500);
  const pin = req.headers.get("x-pin");
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Bad request", 400);
  }
  const type = String(body.type ?? "");
  const season = typeof body.season === "string" ? body.season : null;
  const teamIdHint = typeof body.teamId === "string" ? body.teamId : null;

  // Resolve role: staff PINs first, else owner PIN for a team in the season.
  let role: Role | null = staffRoleFor(pin);
  let ownerTeamId: string | undefined;

  if (!role && pin && (type === "checkPin" || OWNER_OK.has(type) || teamIdHint)) {
    try {
      const stateForOwner = await loadState(season);
      const owners = await loadOwners(stateForOwner.tournamentKey);
      const teamId = teamIdHint;
      if (teamId && owners.teams[teamId] && verifyOwnerPin(pin, owners.salt, owners.teams[teamId].pinHash)) {
        role = "owner";
        ownerTeamId = teamId;
      } else if (type === "checkPin" && teamId) {
        return err("Wrong PIN", 401);
      }
    } catch {
      /* fall through */
    }
  }

  if (type === "checkPin") {
    if (!role) return err("Wrong PIN", 401);
    return NextResponse.json(
      { ok: true, role, ...(ownerTeamId ? { teamId: ownerTeamId } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!role) return err("Wrong PIN", 401);
  if (!allowAction(role, type)) return err("Not allowed for this role", 403);

  try {
    const state = await loadState(season);
    const prefix = state.tournamentKey;
    const lockMsg = stageBlocksAction(state.config, type, { force: body.force === true });
    if (lockMsg) return err(lockMsg, 403);
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
        let players: Player[] = c.players;
        if (playersIn) {
          players = playersIn
            .map((p: Player) => ({
              no: Number(p.no),
              name: String(p.name || "Player").slice(0, 40),
              skill: ["Beginner", "Intermediate", "Advanced"].includes(String(p.skill))
                ? String(p.skill)
                : "Intermediate",
              photo: p.photo == null || p.photo === "" ? null : String(p.photo).slice(0, 400_000),
              team: p.team ? String(p.team).slice(0, 24) : undefined,
            }))
            .filter((p: Player) => Number.isInteger(p.no) && p.no > 0);
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
    } else if (type === "generateFixturesPreview") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const input = body.input as FixtureGenSettings;
      if (!input?.days?.length) return err("Add at least one day", 400);
      const teamOrder =
        Array.isArray(input.teamOrder) && input.teamOrder.length
          ? input.teamOrder.map(String)
          : state.config.teams.map((t) => t.id);
      const result = generateFixtures({
        teamIds: teamOrder,
        days: input.days,
        leagueSlotMinutes: Number(input.leagueSlotMinutes) || 45,
        playoffSlotMinutes: Number(input.playoffSlotMinutes) || 60,
        breakBeforePlayoffsMinutes: Number(input.breakBeforePlayoffsMinutes) || 0,
        playoffFormat: input.playoffFormat || "qualifier",
        roundRobin: input.roundRobin || "single",
      });
      return NextResponse.json(
        {
          ok: !result.error,
          error: result.error,
          fixtures: result.fixtures,
          report: result.report,
          state: await loadState(typeof body.season === "string" ? body.season : prefix),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } else if (type === "saveGeneratedFixtures") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const list = body.fixtures as Fixture[];
      if (!Array.isArray(list) || !list.length) return err("No fixtures", 400);
      const hasEvents = Object.values(state.matches).some((m) => m.ev?.length);
      if (hasEvents && body.force !== true) {
        return err("Matches already have scores. Pass force:true to replace.", 409);
      }
      const fixtureGen = body.fixtureGen as FixtureGenSettings | undefined;
      await updateConfig(prefix, (c) => ({
        ...c,
        fixtures: list.map((f, i) => ({
          id: String(f.id || `m${i + 1}`),
          no: Number(f.no) || i + 1,
          stage: String(f.stage || "League"),
          day: String(f.day || ""),
          date: String(f.date || ""),
          time: String(f.time || ""),
          a: f.a,
          b: f.b,
        })),
        fixtureGen: fixtureGen ?? c.fixtureGen,
        stage: "matches",
        stageLog: [
          ...(c.stageLog ?? []),
          {
            at: Date.now(),
            from: effectiveStage(c),
            to: "matches" as const,
            by: "admin",
            note: `Saved ${list.length} fixtures`,
          },
        ],
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
        cloneStyle: body.cloneStyle === "archive" ? "archive" : "workflow",
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
    } else if (type === "ownerPinStatus") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const owners = await loadOwners(prefix);
      const pins: Record<string, boolean> = {};
      for (const t of state.config.teams) pins[t.id] = !!owners.teams[t.id]?.pinHash;
      return NextResponse.json(
        { ok: true, pins, state: await loadState(typeof body.season === "string" ? body.season : prefix) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } else if (type === "setOwnerPin") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const tid = String(body.teamId ?? "");
      if (!state.config.teams.some((t) => t.id === tid)) return err("Unknown team", 400);
      const newPin = String(body.pin ?? "").trim();
      if (newPin.length < 4 || newPin.length > 12) return err("Owner PIN must be 4–12 characters", 400);
      await updateOwners(prefix, (doc) => {
        const salt = doc.salt || emptyOwners().salt;
        return {
          ...doc,
          salt,
          teams: {
            ...doc.teams,
            [tid]: { pinHash: hashOwnerPin(newPin, salt), updatedAt: Date.now() },
          },
        };
      });
    } else if (type === "clearOwnerPin") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const tid = String(body.teamId ?? "");
      await updateOwners(prefix, (doc) => {
        const teams = { ...doc.teams };
        delete teams[tid];
        return { ...doc, teams };
      });
    } else if (type === "saveAuctionSettings") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const a = body.auction as AuctionSettings;
      if (!a || typeof a !== "object") return err("Bad auction settings", 400);
      await updateConfig(prefix, (c) => ({
        ...c,
        auction: { ...defaultAuctionSettings(), ...a },
      }));
    } else if (type === "saveRegistrationSettings") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const r = body.registration as RegistrationSettings;
      if (!r || typeof r !== "object") return err("Bad registration settings", 400);
      await updateConfig(prefix, (c) => ({
        ...c,
        registration: { ...defaultRegistrationSettings(), ...r },
      }));
    } else if (type === "setStage") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const to = String(body.to ?? "") as SeasonStage;
      const allowed: SeasonStage[] = ["registration", "auction", "fixtures", "matches", "completed"];
      if (!allowed.includes(to)) return err("Bad stage", 400);
      const by = String(body.by ?? "admin");
      const note = body.note != null ? String(body.note).slice(0, 200) : undefined;
      const force = body.force === true;
      if (body.confirm !== to && !force) return err(`Type ${to} to confirm`, 400);
      await updateConfig(prefix, (c) => ({
        ...c,
        stage: to,
        stageLog: [
          ...(c.stageLog ?? []),
          { at: Date.now(), from: effectiveStage(c), to, by, note },
        ],
      }));
    } else if (type === "listRegistrations") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const entries = await loadRegistrationEntries(prefix);
      return NextResponse.json(
        { ok: true, entries, state: await loadState(typeof body.season === "string" ? body.season : prefix) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } else if (type === "regUpdate") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      if (effectiveStage(state.config) !== "registration") {
        return err("Registration is locked. Unlock registration first to edit players.", 403);
      }
      const id = String(body.id ?? "");
      const cur = await loadRegistrationEntry(prefix, id);
      if (!cur) return err("Unknown registration", 404);
      const status = body.status != null ? String(body.status) : cur.status;
      if (!["pending", "approved", "rejected", "excluded"].includes(status)) return err("Bad status", 400);
      const next: RegistrationEntry = {
        ...cur,
        status: status as RegistrationEntry["status"],
        excludeReason: body.excludeReason != null ? String(body.excludeReason).slice(0, 200) : cur.excludeReason,
        dupOf: body.dupOf != null ? String(body.dupOf) : cur.dupOf,
        name: body.name != null ? titleCaseName(String(body.name)) : cur.name,
        skill: body.skill != null ? normalizeSkill(String(body.skill)) : cur.skill,
        photo: body.photo !== undefined ? (body.photo ? String(body.photo).slice(0, 400_000) : null) : cur.photo,
        priv: {
          ...cur.priv,
          phone: body.phone != null ? formatPhoneDisplay(String(body.phone)) : cur.priv.phone,
          tower: body.tower != null ? normalizeTower(String(body.tower)) : cur.priv.tower,
          age: body.age != null ? normalizeAge(String(body.age)) : cur.priv.age,
          email: body.email != null ? String(body.email).slice(0, 120) : cur.priv.email,
          available: body.available != null ? normalizeAvailable(String(body.available)) : cur.priv.available,
          notes: body.notes != null ? String(body.notes).slice(0, 500) : cur.priv.notes,
          photoRef: body.photoRef != null ? String(body.photoRef) : cur.priv.photoRef,
          guardianName:
            body.guardianName != null
              ? titleCaseName(String(body.guardianName)).slice(0, 80) || undefined
              : cur.priv.guardianName,
          guardianPhone:
            body.guardianPhone != null
              ? formatPhoneDisplay(String(body.guardianPhone)) || undefined
              : cur.priv.guardianPhone,
        },
      };
      await saveRegistrationEntry(prefix, next);
    } else if (type === "regImport") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const rows = body.rows as Array<
        Partial<RegistrationEntry> & { priv?: Partial<PlayerPrivate>; exclude?: boolean; include?: boolean }
      >;
      if (!Array.isArray(rows) || !rows.length) return err("No rows", 400);
      let n = 0;
      for (const row of rows) {
        if (row.exclude === true || row.include === false) continue;
        const id = newRegId();
        const entry: RegistrationEntry = {
          id,
          createdAt: Date.now() + n,
          status: "pending",
          name: titleCaseName(String(row.name ?? "")),
          skill: normalizeSkill(String(row.skill ?? "Intermediate")),
          photo: row.photo ? String(row.photo).slice(0, 400_000) : null,
          priv: {
            phone: formatPhoneDisplay(String(row.priv?.phone ?? "")),
            tower: normalizeTower(String(row.priv?.tower ?? "")),
            age: normalizeAge(String(row.priv?.age ?? "")),
            email: row.priv?.email ? String(row.priv.email).slice(0, 120) : undefined,
            available: normalizeAvailable(String(row.priv?.available ?? "")),
            contribution: row.priv?.contribution ? String(row.priv.contribution).slice(0, 200) : undefined,
            source: "import",
            sourceRow: row.priv?.sourceRow,
            photoRef: row.priv?.photoRef ? String(row.priv.photoRef) : undefined,
          },
        };
        if (!entry.name) continue;
        await saveRegistrationEntry(prefix, entry);
        n++;
      }
      if (body.columnMap && typeof body.columnMap === "object") {
        await updateConfig(prefix, (c) => ({
          ...c,
          registration: {
            ...(c.registration ?? defaultRegistrationSettings()),
            columnMap: body.columnMap as Record<string, string>,
          },
        }));
      }
    } else if (type === "regAddManual") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      const id = newRegId();
      const entry: RegistrationEntry = {
        id,
        createdAt: Date.now(),
        status: "approved",
        name: titleCaseName(String(body.name ?? "")),
        skill: normalizeSkill(String(body.skill ?? "Intermediate")),
        photo: body.photo ? String(body.photo).slice(0, 400_000) : null,
        priv: {
          phone: formatPhoneDisplay(String(body.phone ?? "")),
          tower: normalizeTower(String(body.tower ?? "")),
          age: normalizeAge(String(body.age ?? "")),
          email: body.email ? String(body.email).slice(0, 120) : undefined,
          available: normalizeAvailable(String(body.available ?? "Yes")),
          source: "admin",
        },
      };
      if (!entry.name) return err("Name required", 400);
      await saveRegistrationEntry(prefix, entry);
    } else if (type === "lockRegistration") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      if (body.confirm !== "LOCK") return err("Type LOCK to confirm", 400);
      const entries = await loadRegistrationEntries(prefix);
      const approved = entries.filter((e) => e.status === "approved");
      if (!approved.length) return err("No approved players to lock", 400);
      const regSettings = state.config.registration ?? defaultRegistrationSettings();
      const numbered = assignAuctionNumbers(approved, regSettings.numbering);
      const players: Player[] = [];
      const privateMap: Record<string, PlayerPrivate> = {};
      for (const { entry, no } of numbered) {
        const id = newPlayerId();
        let photoUrl: string | null = entry.photo;
        if (entry.photo && entry.photo.startsWith("data:")) {
          const hash = await savePhoto(prefix, id, entry.photo);
          photoUrl = `/api/photo/${prefix}/${id}?v=${hash}`;
        }
        players.push(entryToPublicPlayer(entry, no, id, photoUrl));
        privateMap[id] = {
          id,
          phone: entry.priv.phone,
          tower: entry.priv.tower,
          age: entry.priv.age,
          email: entry.priv.email,
          available: entry.priv.available,
          contribution: entry.priv.contribution,
          notes: entry.priv.notes,
          guardianName: entry.priv.guardianName,
          guardianPhone: entry.priv.guardianPhone,
          source: entry.priv.source,
          sourceRow: entry.priv.sourceRow,
          photoRef: entry.priv.photoRef,
        };
      }
      await updatePrivate(prefix, () => ({ v: 0, players: privateMap }));
      await updateConfig(prefix, (c) => ({
        ...c,
        players,
        stage: "auction",
        stageLog: [
          ...(c.stageLog ?? []),
          {
            at: Date.now(),
            from: effectiveStage(c),
            to: "auction",
            by: "admin",
            note: `Locked ${players.length} players`,
          },
        ],
        registration: { ...(c.registration ?? defaultRegistrationSettings()), open: false },
      }));
    } else if (type === "unlockRegistration") {
      if (role !== "admin") return err("Admin PIN needed", 403);
      if (body.confirm !== "UNLOCK") return err("Type UNLOCK to confirm", 400);
      const stage = effectiveStage(state.config);
      if (stage !== "auction" && stage !== "fixtures") {
        return err("Unlock is only available from Auction (or Fixtures before matches).", 400);
      }
      const auctionDoc = await loadAuction(prefix);
      const auctionStarted = !!auctionDoc.startedAt || (auctionDoc.ev?.length ?? 0) > 0;
      if (auctionStarted && body.force !== true) {
        return err(
          "Auction already has activity. Confirm again with force to clear auction bids and reopen registration.",
          409,
        );
      }
      await updateAuction(prefix, () => emptyAuction());
      await updatePrivate(prefix, () => emptyPrivate());
      await updateConfig(prefix, (c) => ({
        ...c,
        players: [],
        teams: c.teams.map((t) => ({ ...t, squad: [] })),
        stage: "registration",
        stageLog: [
          ...(c.stageLog ?? []),
          {
            at: Date.now(),
            from: effectiveStage(c),
            to: "registration",
            by: "admin",
            note: auctionStarted ? "Unlocked registration (cleared auction + squads)" : "Unlocked registration",
          },
        ],
        registration: { ...(c.registration ?? defaultRegistrationSettings()), open: true },
      }));
    } else if (
      type === "auctionStart" ||
      type === "auctionDraw" ||
      type === "auctionReveal" ||
      type === "auctionBid" ||
      type === "auctionSold" ||
      type === "auctionUnsold" ||
      type === "auctionUndo" ||
      type === "auctionFix" ||
      type === "auctionNextRound" ||
      type === "auctionPause" ||
      type === "auctionResume" ||
      type === "auctionPenalty" ||
      type === "auctionFinish"
    ) {
      if (type === "auctionFinish" && role !== "admin") return err("Admin PIN needed", 403);

      const auctionSettings = state.config.auction ?? defaultAuctionSettings();
      const teams = state.config.teams;
      const byLabel =
        role === "admin" ? "admin" : role === "auctioneer" ? "auctioneer" : role === "owner" ? "owner" : role;
      const now = Date.now();

      if (type === "auctionFinish") {
        const doc = await loadAuction(prefix);
        if (doc.completedAt) {
          // Idempotent: already finished.
        } else {
          const st = deriveAuction(doc.ev, auctionSettings, teams, players);
          if (st.status !== "complete") return err("Auction is not complete", 409);
          await updateAuction(prefix, (d) => {
            if (d.completedAt) return d;
            return { ...d, completedAt: now };
          });
          const squadByTeam: Record<string, number[]> = Object.fromEntries(teams.map((t) => [t.id, [] as number[]]));
          for (const [noStr, sale] of Object.entries(st.sold)) {
            const no = Number(noStr);
            if (!squadByTeam[sale.teamId]) squadByTeam[sale.teamId] = [];
            squadByTeam[sale.teamId].push(no);
          }
          for (const id of Object.keys(squadByTeam)) squadByTeam[id].sort((a, b) => a - b);
          await updateConfig(prefix, (c) => ({
            ...c,
            teams: c.teams.map((t) => ({ ...t, squad: squadByTeam[t.id] ?? [] })),
            players: c.players.map((p) => {
              const sale = st.sold[p.no];
              return sale ? { ...p, team: sale.teamId } : { ...p, team: undefined };
            }),
            stage: "fixtures",
            stageLog: [
              ...(c.stageLog ?? []),
              {
                at: now,
                from: effectiveStage(c),
                to: "fixtures" as SeasonStage,
                by: "admin",
                note: "Auction finished",
              },
            ],
          }));
        }
      } else if (type === "auctionUndo") {
        await updateAuction(prefix, (d) => {
          if (!d.ev.length) return "Nothing to undo";
          return { ...d, ev: d.ev.slice(0, -1) };
        });
      } else {
        await updateAuction(prefix, (d) => {
          const st = deriveAuction(d.ev, auctionSettings, teams, players);
          let e: AuctionEvent;

          if (type === "auctionStart") {
            e = { k: "start", t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e], startedAt: d.startedAt ?? now };
          }

          if (type === "auctionDraw") {
            if (st.status === "paused") return "Auction is paused";
            if (st.status === "round-complete") return "Start the next round first";
            if (st.current) return "Finish the current player first";
            if (!st.pool.length) return "Pool is empty";
            const no = pickDrawNumber(st.pool, players, auctionSettings.drawOrder, (max) => randomInt(max));
            e = { k: "draw", no, round: st.round, t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionReveal") {
            e = { k: "reveal", t: now };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionBid") {
            const teamId = String(body.teamId ?? "");
            const amount = Number(body.amount);
            if (!teamId) return "Pick a team";
            if (!Number.isFinite(amount) || amount <= 0) return "Bad amount";
            if (role === "owner") {
              if (!ownerTeamId) return "Owner team unknown";
              if (teamId !== ownerTeamId) return "You can only bid for your team";
            }
            if (!st.current) return "No player on the block";
            const by: "owner" | "auctioneer" = role === "owner" ? "owner" : "auctioneer";
            e = { k: "bid", no: st.current.no, teamId, amount, by, t: now };
            const expectRaw = body.expect;
            let expect: { no: number; highAmount: number } | undefined;
            if (expectRaw && typeof expectRaw === "object" && !Array.isArray(expectRaw)) {
              const er = expectRaw as Record<string, unknown>;
              const eno = Number(er.no);
              const ehigh = Number(er.highAmount);
              if (Number.isFinite(eno) && Number.isFinite(ehigh)) expect = { no: eno, highAmount: ehigh };
            }
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e, expect);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionSold") {
            if (!st.current) return "No player on the block";
            e = { k: "sold", no: st.current.no, t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionUnsold") {
            if (!st.current) return "No player on the block";
            e = { k: "unsold", no: st.current.no, t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionNextRound") {
            e = { k: "nextRound", t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionPause") {
            e = { k: "pause", t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionResume") {
            e = { k: "resume", t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionPenalty") {
            const teamId = String(body.teamId ?? "");
            const no = Number(body.no);
            if (!teamId) return "Pick a team";
            if (!Number.isInteger(no) || no <= 0) return "Bad player number";
            e = { k: "penalty", teamId, no, t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          if (type === "auctionFix") {
            const no = Number(body.no);
            if (!Number.isInteger(no) || no <= 0) return "Bad player number";
            const toRaw = body.to;
            if (!toRaw || typeof toRaw !== "object" || Array.isArray(toRaw)) return "Bad fix target";
            const toObj = toRaw as Record<string, unknown>;
            const status = String(toObj.status ?? "");
            let to: Extract<AuctionEvent, { k: "fix" }>["to"];
            if (status === "sold") {
              const teamId = String(toObj.teamId ?? "");
              const amount = Number(toObj.amount);
              if (!teamId) return "Pick a team";
              if (!Number.isFinite(amount) || amount <= 0) return "Bad amount";
              to = { status: "sold", teamId, amount };
            } else if (status === "unsold") {
              to = { status: "unsold" };
            } else if (status === "pool") {
              to = { status: "pool" };
            } else {
              return "Bad fix status";
            }
            e = { k: "fix", no, to, t: now, by: byLabel };
            const problem = checkAuctionEvent(d.ev, auctionSettings, teams, players, e);
            if (problem) return problem;
            return { ...d, ev: [...d.ev, e] };
          }

          return "Unknown auction action";
        });
      }
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
    if (f.targets.length > f.bestOf) {
      return f.bestOf === 1
        ? "Best of 1 needs a single points-per-set value"
        : `Best of ${f.bestOf} allows at most ${f.bestOf} set targets`;
    }
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
