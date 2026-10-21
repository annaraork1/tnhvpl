import type { PracticeMatchPublic, PracticeSummary } from "./practiceTypes";
import type { MatchState } from "./types";

type Ok<T> = { ok: true } & T;
type Fail = { ok: false; error: string };

export type PracticeLiveBoardItem = {
  match: PracticeMatchPublic;
  state: MatchState;
};

async function parse<T>(res: Response): Promise<Ok<T> | Fail> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    return { ok: false, error: String(data.error || res.statusText || "Failed") };
  }
  return { ok: true, ...(data as T) };
}

export async function fetchPracticeBoard() {
  const res = await fetch("/api/practice", { cache: "no-store" });
  return parse<{ matches: PracticeSummary[]; live: PracticeLiveBoardItem[] }>(res);
}

/** @deprecated use fetchPracticeBoard */
export async function fetchPracticeHistory() {
  const r = await fetchPracticeBoard();
  if (!r.ok) return r;
  return { ok: true as const, matches: r.matches };
}

export async function fetchPractice(id: string, hostToken: string | null) {
  const q = hostToken ? `?hostToken=${encodeURIComponent(hostToken)}` : "";
  const res = await fetch(`/api/practice/${encodeURIComponent(id)}${q}`, { cache: "no-store" });
  return parse<{ match: PracticeMatchPublic; state: MatchState | null }>(res);
}

export async function practiceAct(
  body: Record<string, unknown>,
  opts?: { pin?: string | null },
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.pin) headers["x-pin"] = opts.pin;
  const res = await fetch("/api/practice", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return parse<{
    match?: PracticeMatchPublic;
    hostToken?: string;
    state?: MatchState;
  }>(res);
}
