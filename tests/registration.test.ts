import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignAuctionNumbers,
  findDuplicates,
  formatPhoneDisplay,
  guessColumnMap,
  mapRow,
  matchPhotoFilename,
  normalizeImportRow,
  normalizeSkill,
  normalizeTower,
  parseCsv,
  phoneKey,
  titleCaseName,
} from "../lib/registration.ts";
import type { RegistrationEntry } from "../lib/types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const samplePath = join(dir, "../docs/season-workflow/reference/registration-sample.csv");

test("title case and skill / tower / phone normalisation", () => {
  assert.equal(titleCaseName("arjun s"), "Arjun S");
  assert.equal(titleCaseName("PRAKASH N"), "Prakash N");
  assert.equal(normalizeSkill("Begineer"), "Beginner");
  assert.equal(normalizeTower("Tower 21042"), "21042");
  assert.equal(normalizeTower("T-4064"), "T-4064");
  assert.equal(phoneKey("98450 12345"), "9845012345");
  assert.equal(formatPhoneDisplay("9000000000").replace(/\s/g, ""), "9000000000");
});

test("CSV sample maps and normalises messy rows", () => {
  const text = readFileSync(samplePath, "utf8");
  const { headers, rows } = parseCsv(text);
  assert.ok(headers.length >= 8);
  const map = guessColumnMap(headers);
  assert.equal(map["Name"], "name");
  assert.equal(map["Skill Level"], "skill");
  const first = normalizeImportRow(mapRow(headers, rows[0], map));
  assert.equal(first.name, "Ravi Kumar");
  assert.equal(first.skill, "Beginner");
  assert.ok(first.flags.includes("under-18"));
  const begineer = normalizeImportRow(mapRow(headers, rows[1], map));
  assert.equal(begineer.skill, "Beginner");
  assert.equal(begineer.name, "Arjun S");
  const tower = normalizeImportRow(mapRow(headers, rows[3], map));
  assert.equal(tower.tower, "21042");
  assert.ok(tower.flags.includes("unavailable"));
  const sr = normalizeImportRow(mapRow(headers, rows[4], map));
  assert.ok(sr.flags.includes("sr-citizen"));
});

test("duplicate detection by phone and name+tower", () => {
  const mk = (id: string, name: string, phone: string, tower: string): RegistrationEntry => ({
    id,
    createdAt: Date.now(),
    status: "pending",
    name,
    skill: "Beginner",
    photo: null,
    priv: { phone, tower, age: "20", source: "import" },
  });
  const entries = [
    mk("a", "Rahul", "9000006666", "21082"),
    mk("b", "Rahul", "9000006666", "T-4064"),
    mk("c", "Other", "111", "21082"),
  ];
  const dups = findDuplicates(entries);
  assert.ok(dups.get("a")?.includes("b"));
  assert.ok(dups.get("b")?.includes("a"));
});

test("photo filename matching after last ' - '", () => {
  const entries = [
    { id: "1", name: "Ravi Kumar" },
    { id: "2", name: "Arjun S" },
  ];
  assert.equal(matchPhotoFilename("IMG_123 - Ravi Kumar.jpg", entries)?.id, "1");
  assert.equal(matchPhotoFilename("IMG_123 - Ravi Kumar.jpg", entries)?.confidence, "exact");
  assert.equal(matchPhotoFilename("nope.jpg", entries), null);
});

test("auction numbering form-order and by-skill", () => {
  const mk = (id: string, skill: RegistrationEntry["skill"], t: number): RegistrationEntry => ({
    id,
    createdAt: t,
    status: "approved",
    name: id,
    skill,
    photo: null,
    priv: { phone: "", tower: "", age: "", source: "admin" },
  });
  const list = [mk("b", "Beginner", 2), mk("a", "Advanced", 1), mk("i", "Intermediate", 3)];
  const byForm = assignAuctionNumbers(list, "form-order");
  assert.deepEqual(
    byForm.map((x) => x.entry.id),
    ["a", "b", "i"],
  );
  const bySkill = assignAuctionNumbers(list, "by-skill");
  assert.equal(bySkill[0].entry.skill, "Advanced");
  assert.equal(bySkill[0].no, 1);
});
