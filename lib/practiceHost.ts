/** Client-side host token storage for practice matches (creating browser only). */

const PREFIX = "tnhvpl:practice:host:";

export function saveHostToken(id: string, token: string) {
  try {
    localStorage.setItem(PREFIX + id, token);
    const open = listOpenHostIds();
    if (!open.includes(id)) {
      localStorage.setItem(PREFIX + "open", JSON.stringify([id, ...open].slice(0, 40)));
    }
  } catch {
    /* ignore */
  }
}

export function getHostToken(id: string): string | null {
  try {
    return localStorage.getItem(PREFIX + id);
  } catch {
    return null;
  }
}

export function clearHostToken(id: string) {
  try {
    localStorage.removeItem(PREFIX + id);
    const open = listOpenHostIds().filter((x) => x !== id);
    localStorage.setItem(PREFIX + "open", JSON.stringify(open));
  } catch {
    /* ignore */
  }
}

export function listOpenHostIds(): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + "open");
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
