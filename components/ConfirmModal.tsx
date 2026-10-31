"use client";

/** In-app confirm dialog (replaces window.confirm for scorer / PWA). */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="banner confirm-banner" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="card stack">
        <h2 id="confirm-modal-title">{title}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {message}
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn ghost" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? "red" : "gold"}`}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
