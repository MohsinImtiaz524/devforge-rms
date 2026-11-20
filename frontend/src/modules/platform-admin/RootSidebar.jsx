import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Orbit, X, LogOut } from "lucide-react";
export default function RootSidebar({
  items,
  activeId,
  drawerOpen,
  onClose,
  onLogout,
  busy,
  user,
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("orbit_root_sidebar_collapsed") === "true",
  );
  const ref = useRef(null);
  useEffect(() => {
    localStorage.setItem("orbit_root_sidebar_collapsed", String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("button")?.focus();
    function key(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...ref.current.querySelectorAll("a[href],button:not(:disabled)"),
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
    addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [drawerOpen, onClose]);
  return (
    <>
      {drawerOpen && (
        <button
          className="root-sidebar-scrim"
          aria-label="Close root navigation"
          onClick={onClose}
        />
      )}
      <aside
        ref={ref}
        className={
          "root-sidebar " +
          (collapsed ? "is-collapsed " : "") +
          (drawerOpen ? "is-open" : "")
        }
        aria-label="Root administrator navigation"
      >
        <header>
          <a href="/app/admin" aria-label="Orbit OS root workspace">
            <Orbit size={25} />
            <strong>Orbit OS</strong>
          </a>
          <button
            className="root-collapse"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            className="root-drawer-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className="root-identity">
          <span>Root workspace</span>
          <strong>{user.name || user.username}</strong>
        </div>
        <nav>
          {items.map((item, i) => (
            <div key={item.key}>
              {item.group !== items[i - 1]?.group && (
                <p className="root-nav-group">{item.group}</p>
              )}
              <button
                title={item.label}
                aria-label={item.label}
                aria-current={activeId === item.key ? "page" : undefined}
                className={activeId === item.key ? "is-active" : ""}
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </nav>
        <footer>
          <button disabled={busy} onClick={onLogout}>
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </footer>
      </aside>
    </>
  );
}
