import { createHash, randomBytes } from "node:crypto";
import {
  ActionError,
  auctionKey,
  delRaw,
  ownersKey,
  photoKey,
  privateKey,
  readRaw,
  regEntryKey,
  regIndexKey,
  update,
  writeRaw,
} from "./store";
import { newSalt } from "./ownerAuth";
import type {
  AuctionDoc,
  OwnersDoc,
  PrivateDoc,
  RegistrationEntry,
  RegIndexDoc,
} from "./types";

export function emptyPrivate(): PrivateDoc {
  return { v: 0, players: {} };
}

export function emptyOwners(): OwnersDoc {
  return { v: 0, salt: newSalt(), teams: {} };
}

export function emptyAuction(): AuctionDoc {
  return { v: 0, ev: [] };
}

export function emptyRegIndex(): RegIndexDoc {
  return { v: 0, ids: [] };
}

export async function loadPrivate(prefix: string): Promise<PrivateDoc> {
  const [doc] = await readRaw<PrivateDoc>([privateKey(prefix)]);
  return doc && typeof doc === "object" && doc.players ? doc : emptyPrivate();
}

export async function updatePrivate(prefix: string, fn: (d: PrivateDoc) => PrivateDoc | string) {
  return update(privateKey(prefix), emptyPrivate, fn);
}

export async function loadOwners(prefix: string): Promise<OwnersDoc> {
  const [doc] = await readRaw<OwnersDoc>([ownersKey(prefix)]);
  return doc && typeof doc === "object" && doc.salt ? doc : emptyOwners();
}

export async function updateOwners(prefix: string, fn: (d: OwnersDoc) => OwnersDoc | string) {
  return update(ownersKey(prefix), emptyOwners, fn);
}

export async function loadAuction(prefix: string): Promise<AuctionDoc> {
  const [doc] = await readRaw<AuctionDoc>([auctionKey(prefix)]);
  return doc && typeof doc === "object" && Array.isArray(doc.ev) ? doc : emptyAuction();
}

export async function updateAuction(prefix: string, fn: (d: AuctionDoc) => AuctionDoc | string) {
  return update(auctionKey(prefix), emptyAuction, fn);
}

export async function loadRegIndex(prefix: string): Promise<RegIndexDoc> {
  const [doc] = await readRaw<RegIndexDoc>([regIndexKey(prefix)]);
  return doc && typeof doc === "object" && Array.isArray(doc.ids) ? doc : emptyRegIndex();
}

export async function loadRegistrationEntries(prefix: string): Promise<RegistrationEntry[]> {
  const index = await loadRegIndex(prefix);
  if (!index.ids.length) return [];
  const rows = await readRaw<RegistrationEntry>(index.ids.map((id) => regEntryKey(prefix, id)));
  return index.ids
    .map((id, i) => rows[i])
    .filter((e): e is RegistrationEntry => !!e && typeof e === "object" && !!e.id);
}

export async function loadRegistrationEntry(prefix: string, id: string): Promise<RegistrationEntry | null> {
  const [e] = await readRaw<RegistrationEntry>([regEntryKey(prefix, id)]);
  return e && typeof e === "object" && e.id ? e : null;
}

export async function saveRegistrationEntry(prefix: string, entry: RegistrationEntry): Promise<void> {
  await writeRaw(regEntryKey(prefix, entry.id), entry);
  await update(regIndexKey(prefix), emptyRegIndex, (idx) => {
    if (idx.ids.includes(entry.id)) return idx;
    return { ...idx, ids: [...idx.ids, entry.id] };
  });
}

export async function deleteRegistrationEntry(prefix: string, id: string): Promise<void> {
  await delRaw(regEntryKey(prefix, id));
  await update(regIndexKey(prefix), emptyRegIndex, (idx) => ({
    ...idx,
    ids: idx.ids.filter((x) => x !== id),
  }));
}

/** Photo stored as data URL string (not versioned CAS). */
export async function savePhoto(prefix: string, playerId: string, dataUrl: string): Promise<string> {
  const hash = createHash("sha256").update(dataUrl).digest("hex").slice(0, 12);
  await writeRaw(photoKey(prefix, playerId), { dataUrl, hash });
  return hash;
}

export async function loadPhoto(
  prefix: string,
  playerId: string,
): Promise<{ dataUrl: string; hash: string } | null> {
  const [doc] = await readRaw<{ dataUrl: string; hash: string }>([photoKey(prefix, playerId)]);
  if (!doc || typeof doc.dataUrl !== "string") return null;
  return doc;
}

export function newRegId(): string {
  return `r_${randomBytes(8).toString("base64url")}`;
}

export function newPlayerId(): string {
  return `p_${randomBytes(8).toString("base64url")}`;
}

export { ActionError };
