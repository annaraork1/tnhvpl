/** Browser confirm for destructive admin / staff actions. */
export function askConfirm(message: string): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(message);
}

/** Confirm by typing an exact word (e.g. DELETE). Cancel / mismatch → false. */
export function askTypedConfirm(message: string, requiredWord: string): boolean {
  if (typeof window === "undefined") return false;
  if (!window.confirm(message)) return false;
  const typed = window.prompt(`Type ${requiredWord} to confirm`);
  return typed === requiredWord;
}
