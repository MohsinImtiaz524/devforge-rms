import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";
import { X, Plus, RefreshCw } from "lucide-react";

export function DataState({ state, retry, children }) {
  if (state.loading)
    return (
      <div
        className="pa-skeleton-grid"
        aria-busy="true"
        aria-label="Loading records"
      >
        <div className="pa-skeleton">
          <span />
          <span />
        </div>
        <div className="pa-skeleton">
          <span />
          <span />
        </div>
      </div>
    );
  if (state.error)
    return (
      <div className="pa-error" role="alert">
        {state.error}
        <button onClick={retry}>Try again</button>
      </div>
    );
  return children(state.data);
}
export function AdminPanel({ title, description, children }) {
  return (
    <section className="pa-panel">
      {(title || description) && (
        <header>
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
export function AdminTable({
  columns,
  rows,
  keyFor = (row) => row.id,
  empty = "No records found.",
}) {
  return (
    <div className="pa-table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={keyFor(row) ?? i}>
              {columns.map((c) => (
                <td key={c.label}>
                  {c.render ? c.render(row) : String(row[c.key] ?? "\u2014")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="pa-empty">{empty}</div>}
    </div>
  );
}
export function Toolbar({ children, onAdd, addLabel = "Add", onRefresh }) {
  return (
    <div className="pa-directory-tools">
      {children}
      {onAdd && (
        <button className="pa-primary" onClick={onAdd}>
          <Plus size={15} />
          {addLabel}
        </button>
      )}
      {onRefresh && (
        <button onClick={onRefresh}>
          <RefreshCw size={15} />
          Refresh
        </button>
      )}
    </div>
  );
}
export function Field({ label, children, ...props }) {
  const labelId = useId();
  const control =
    children && isValidElement(children) && typeof children.type === "string"
      ? cloneElement(children, { "aria-labelledby": labelId })
      : children;
  return (
    <label className="pa-field">
      <span id={labelId}>{label}</span>
      {control || <input {...props} aria-labelledby={labelId} />}
    </label>
  );
}
export function Checks({ label, options, value, onChange }) {
  return (
    <fieldset className="pa-checks">
      <legend>{label}</legend>
      {options.map((o) => {
        const id = typeof o === "string" ? o : o.id;
        return (
          <label key={id}>
            <input
              type="checkbox"
              checked={value.includes(id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, id]
                    : value.filter((x) => x !== id),
                )
              }
            />
            {typeof o === "string" ? o.replaceAll("_", " ") : o.label}
          </label>
        );
      })}
    </fieldset>
  );
}
export function AdminDialog({
  title,
  onClose,
  onSubmit,
  busy,
  error,
  children,
  submitLabel = "Save",
  submitDisabled = false,
  wide = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("input,select,textarea,button")?.focus();
    return () => previous?.focus();
  }, []);
  function key(e) {
    if (e.key === "Escape" && !busy) onClose();
    if (e.key === "Tab") {
      const nodes = [
        ...ref.current.querySelectorAll(
          "input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),a[href]",
        ),
      ].filter((n) => n.getClientRects().length);
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    }
  }
  return (
    <div className="pa-backdrop">
      <section
        className={"pa-dialog " + (wide ? "pa-dialog-wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        ref={ref}
        onKeyDown={key}
      >
        <header>
          <h2 id="admin-dialog-title">{title}</h2>
          <button disabled={busy} onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          {children}
          {error && (
            <div className="pa-error" role="alert">
              {error}
            </div>
          )}
          <footer>
            <button type="button" disabled={busy} onClick={onClose}>
              {onSubmit ? "Cancel" : "Close"}
            </button>
            {onSubmit && (
              <button
                className="pa-primary"
                disabled={busy || submitDisabled}
                type="submit"
              >
                {busy ? "Saving..." : submitLabel}
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}
