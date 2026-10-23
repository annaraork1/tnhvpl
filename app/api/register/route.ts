import { NextResponse } from "next/server";
import {
  formatPhoneDisplay,
  normalizeAge,
  normalizeAvailable,
  normalizeSkill,
  normalizeTower,
  titleCaseName,
} from "@/lib/registration";
import { defaultRegistrationSettings, effectiveStage } from "@/lib/season";
import { newRegId, saveRegistrationEntry } from "@/lib/seasonStore";
import { hitRateLimit } from "@/lib/rateLimit";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Public season registration (no PIN). */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  // Honeypot
  if (body.website || body.company) {
    return NextResponse.json({ ok: true });
  }

  const season = typeof body.season === "string" ? body.season : null;
  const state = await loadState(season);
  const stage = effectiveStage(state.config);
  const reg = state.config.registration ?? defaultRegistrationSettings();

  if (stage !== "registration" || !reg.open) {
    return NextResponse.json({ ok: false, error: "Registration is closed" }, { status: 403 });
  }
  if (reg.closesAt && Date.now() > reg.closesAt) {
    return NextResponse.json({ ok: false, error: "Registration has closed" }, { status: 403 });
  }

  const ip = clientIp(req);
  const rl = await hitRateLimit(`reg:${state.tournamentKey}:${ip}`, 8, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const name = titleCaseName(String(body.name ?? ""));
  const phone = formatPhoneDisplay(String(body.phone ?? ""));
  const tower = normalizeTower(String(body.tower ?? ""));
  const age = normalizeAge(String(body.age ?? ""));
  const skill = normalizeSkill(String(body.skill ?? "Intermediate"));
  const available = normalizeAvailable(String(body.available ?? ""));
  const email = String(body.email ?? "").trim().slice(0, 120);
  const photo = body.photo == null || body.photo === "" ? null : String(body.photo).slice(0, 400_000);
  const consent = body.consent === true;
  const ageNum = Number(age);
  const under =
    Number.isFinite(ageNum) && reg.guardianConsentUnder != null && ageNum < reg.guardianConsentUnder;
  const guardianConsent = body.guardianConsent === true;
  const guardianName = titleCaseName(String(body.guardianName ?? "")).slice(0, 80);
  const guardianPhone = formatPhoneDisplay(String(body.guardianPhone ?? ""));

  if (!name || name.length < 2) return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "Phone required" }, { status: 400 });
  if (!tower) return NextResponse.json({ ok: false, error: "Tower / flat required" }, { status: 400 });
  if (!consent) return NextResponse.json({ ok: false, error: "Consent required" }, { status: 400 });
  if (reg.requirePhoto && !photo) return NextResponse.json({ ok: false, error: "Photo required" }, { status: 400 });
  if (under && !guardianConsent) {
    return NextResponse.json({ ok: false, error: "Guardian consent required" }, { status: 400 });
  }
  if (under && guardianConsent) {
    if (!guardianName || guardianName.length < 2) {
      return NextResponse.json({ ok: false, error: "Guardian name required" }, { status: 400 });
    }
    if (!guardianPhone) {
      return NextResponse.json({ ok: false, error: "Guardian phone required" }, { status: 400 });
    }
  }

  const id = newRegId();
  await saveRegistrationEntry(state.tournamentKey, {
    id,
    createdAt: Date.now(),
    status: "pending",
    name,
    skill,
    photo,
    priv: {
      phone,
      tower,
      age,
      email: email || undefined,
      available,
      source: "signup",
      ...(under && guardianConsent
        ? { guardianName, guardianPhone }
        : {}),
    },
    guardianConsent: under ? guardianConsent : undefined,
    consentAt: Date.now(),
  });

  return NextResponse.json(
    { ok: true, message: "Thanks, the organisers will confirm your place." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
