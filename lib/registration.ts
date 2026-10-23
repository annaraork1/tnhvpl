import type { Player, RegistrationEntry, RegistrationSettings } from "./types";

const SKILL_FIX: Record<string, "Beginner" | "Intermediate" | "Advanced"> = {
  beginner: "Beginner",
  begineer: "Beginner",
  begginer: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export type RegField =
  | "name"
  | "age"
  | "phone"
  | "tower"
  | "skill"
  | "available"
  | "photo"
  | "consent"
  | "email"
  | "contribution"
  | "ignore";

const HEADER_GUESS: { re: RegExp; field: RegField }[] = [
  { re: /^timestamp$/i, field: "ignore" },
  { re: /contribution/i, field: "contribution" },
  { re: /contact|phone|mobile/i, field: "phone" },
  { re: /tower|flat/i, field: "tower" },
  { re: /skill/i, field: "skill" },
  { re: /available/i, field: "available" },
  { re: /photo/i, field: "photo" },
  { re: /consent/i, field: "consent" },
  { re: /email/i, field: "email" },
  { re: /^name$/i, field: "name" },
  { re: /^age$/i, field: "age" },
];

export function guessColumnMap(headers: string[]): Record<string, RegField> {
  const map: Record<string, RegField> = {};
  const used = new Set<RegField>();
  for (const h of headers) {
    const hit = HEADER_GUESS.find((g) => g.re.test(h) && (g.field === "ignore" || !used.has(g.field)));
    const field = hit?.field ?? "ignore";
    map[h] = field;
    if (field !== "ignore") used.add(field);
  }
  return map;
}

export function titleCaseName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return s;
  const lower = s.toLowerCase();
  const upper = s.toUpperCase();
  if (s === lower || s === upper) {
    return s
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }
  return s;
}

export function normalizeSkill(raw: string): "Beginner" | "Intermediate" | "Advanced" {
  const key = raw.trim().toLowerCase();
  return SKILL_FIX[key] ?? "Intermediate";
}

/** Digits only for comparison; display keeps +91 style when present. */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatPhoneDisplay(raw: string): string {
  const d = normalizePhoneDigits(raw);
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2)}`;
  if (d.length === 10) return d;
  return raw.trim();
}

export function phoneKey(raw: string): string {
  const d = normalizePhoneDigits(raw);
  return d.length >= 10 ? d.slice(-10) : d;
}

export function normalizeTower(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^Tower\s+/i, "");
  t = t.replace(/\s+/g, " ");
  return t;
}

export function normalizeAge(raw: string): string {
  return raw.trim();
}

export function normalizeAvailable(raw: string): "Yes" | "No" | "" {
  const s = raw.trim().toLowerCase();
  if (s === "yes" || s === "y") return "Yes";
  if (s === "no" || s === "n") return "No";
  return "";
}

export interface NormalizedRegRow {
  name: string;
  skill: "Beginner" | "Intermediate" | "Advanced";
  phone: string;
  tower: string;
  age: string;
  email: string;
  available: "Yes" | "No" | "";
  contribution: string;
  photoRef: string;
  flags: string[];
}

export function normalizeImportRow(raw: Record<string, string>): NormalizedRegRow {
  const name = titleCaseName(raw.name ?? "");
  const skill = normalizeSkill(raw.skill ?? "");
  const phone = formatPhoneDisplay(raw.phone ?? "");
  const tower = normalizeTower(raw.tower ?? "");
  const age = normalizeAge(raw.age ?? "");
  const email = (raw.email ?? "").trim();
  const available = normalizeAvailable(raw.available ?? "");
  const contribution = (raw.contribution ?? "").trim();
  const photoRef = (raw.photo ?? "").trim();
  const flags: string[] = [];
  const ageNum = Number(age);
  if (Number.isFinite(ageNum) && ageNum < 18) flags.push("under-18");
  if (/sr\s*citizen/i.test(age)) flags.push("sr-citizen");
  if (available === "No") flags.push("unavailable");
  if (!photoRef) flags.push("missing-photo");
  if (!name) flags.push("missing-name");
  return { name, skill, phone, tower, age, email, available, contribution, photoRef, flags };
}

export function mapRow(
  headers: string[],
  values: string[],
  columnMap: Record<string, RegField>,
): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((h, i) => {
    const field = columnMap[h];
    if (!field || field === "ignore") return;
    out[field] = values[i] ?? "";
  });
  return out;
}

/** Simple CSV parse (handles quoted fields with commas/newlines lightly). */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => {
    cur.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (cur.some((c) => c.trim())) rows.push(cur);
    cur = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") pushCell();
    else if (ch === "\n") pushRow();
    else if (ch === "\r") {
      /* skip */
    } else cell += ch;
  }
  if (cell.length || cur.length) pushRow();
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}

export function findDuplicates(entries: RegistrationEntry[]): Map<string, string[]> {
  /** id → other ids that look like dups */
  const out = new Map<string, string[]>();
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const dups: string[] = [];
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const b = entries[j];
      const samePhone = phoneKey(a.priv.phone) && phoneKey(a.priv.phone) === phoneKey(b.priv.phone);
      const sameNameTower =
        a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
        normalizeTower(a.priv.tower).toLowerCase() === normalizeTower(b.priv.tower).toLowerCase() &&
        a.name.trim().length > 0;
      if (samePhone || sameNameTower) dups.push(b.id);
    }
    if (dups.length) out.set(a.id, dups);
  }
  return out;
}

/** Match zip filename `… - Respondent Name.jpg` to entry name (case-insensitive). */
export function matchPhotoFilename(
  filename: string,
  entries: { id: string; name: string }[],
): { id: string; confidence: "exact" | "fuzzy" } | null {
  const base = filename.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const parts = base.split(" - ");
  const namePart = (parts.length > 1 ? parts[parts.length - 1] : base).trim().toLowerCase();
  if (!namePart) return null;
  const exact = entries.find((e) => e.name.trim().toLowerCase() === namePart);
  if (exact) return { id: exact.id, confidence: "exact" };
  const fuzzy = entries.find((e) => {
    const n = e.name.trim().toLowerCase();
    return n.includes(namePart) || namePart.includes(n);
  });
  if (fuzzy) return { id: fuzzy.id, confidence: "fuzzy" };
  return null;
}

export function assignAuctionNumbers(
  approved: RegistrationEntry[],
  mode: RegistrationSettings["numbering"],
): { entry: RegistrationEntry; no: number }[] {
  let ordered = [...approved];
  if (mode === "by-skill") {
    const rank = { Advanced: 0, Intermediate: 1, Beginner: 2 };
    ordered.sort((a, b) => (rank[a.skill] ?? 9) - (rank[b.skill] ?? 9) || a.createdAt - b.createdAt);
  } else if (mode === "random") {
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  } else {
    ordered.sort((a, b) => a.createdAt - b.createdAt);
  }
  return ordered.map((entry, i) => ({ entry, no: i + 1 }));
}

export function entryToPublicPlayer(
  entry: RegistrationEntry,
  no: number,
  id: string,
  photoUrl: string | null,
): Player {
  return {
    no,
    id,
    name: entry.name,
    skill: entry.skill,
    photo: photoUrl ?? entry.photo,
    team: undefined,
  };
}
