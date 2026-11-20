import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Menu,
  Moon,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  X,
  Bell,
  Network,
  CircleDollarSign,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../api/client";
import RootSidebar from "./RootSidebar";
import "../moons/marketplace.css";
const RestaurantManagement = lazy(() => import("./RestaurantManagement"));
const PlatformPayments = lazy(() => import("./PlatformPayments"));
const RootUsers = lazy(() => import("./RootUsers"));
const RootAudit = lazy(() => import("./RootAudit"));
const RootSettings = lazy(() => import("./RootSettings"));
const RootNotifications = lazy(() => import("./RootNotifications"));
const RootCategories = lazy(() => import("./RootCategories"));
const RootRequests = lazy(() => import("./RootRequests"));
const RootMoons = lazy(() => import("../moons/MoonsManager"));
const RootAnnouncements = lazy(
  () => import("../announcements/AnnouncementsManager"),
);
import "./platform-admin.css";

const TABS = {
  overview: "Overview",
  stores: "Restaurants",
  activity: "System activity",
  health: "Integration health",
  "print-analytics": "Print analytics",
  ledger: "Payment ledger",
  hierarchy: "Restaurant management",
  subscriptions: "Platform payments",
  users: "Users & access",
  settings: "Root settings",
  logs: "Audit logs",
  notifications: "Notifications",
  moons: "Moon catalog",
  announcements: "Announcements",
  categories: "Expense categories",
  requests: "Request diagnostics",
};
const money = (value) =>
  "Rs. " +
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const number = (value) => Number(value || 0).toLocaleString();
const date = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleString()
    : "\u2014";
const duration = (value) =>
  value == null ? "\u2014" : (Number(value) / 1000).toFixed(1) + "s";
function currentTab() {
  const path = location.pathname.replace(/\/$/, "").split("/")[3];
  const key = path || location.hash.slice(1) || "overview";
  return Object.hasOwn(TABS, key) ? key : "overview";
}

function useResource(path, enabled, version) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function load() {
      setState({ data: null, loading: true, error: "" });
      try {
        const data = await api(path);
        if (active) setState({ data, loading: false, error: "" });
      } catch (error) {
        if (!active) return;
        if (error.status === 401) {
          location.replace("/app/login");
          return;
        }
        setState({ data: null, loading: false, error: error.message });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [path, enabled, version]);
  return state;
}
function Panel({ title, description, children, className = "" }) {
  return (
    <section className={"pa-panel " + className}>
      <header>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}
function Empty({ children = "No records available." }) {
  return <div className="pa-empty">{children}</div>;
}
function Resource({ state, onRetry, children }) {
  if (state.loading)
    return (
      <div
        className="pa-skeleton-grid"
        aria-label="Loading platform data"
        aria-busy="true"
      >
        {[1, 2, 3].map((key) => (
          <div className="pa-skeleton" key={key}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    );
  if (state.error)
    return (
      <div className="pa-error" role="alert">
        <span>{state.error}</span>
        <button onClick={onRetry}>Try again</button>
      </div>
    );
  return children(state.data);
}
function Metric({ icon: Icon, label, value, note, tone = "" }) {
  return (
    <article className={"pa-metric " + tone}>
      <span className="pa-metric-icon">
        <Icon size={20} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
    </article>
  );
}
function Ledger({ logs = [], compact = false }) {
  if (!logs.length) return <Empty>No payments recorded.</Empty>;
  return (
    <div className="pa-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Restaurant</th>
            <th>Category</th>
            {!compact && (
              <>
                <th>Date</th>
                <th>Description</th>
                <th>Method</th>
              </>
            )}
            <th className="pa-number">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(compact ? logs.slice(0, 5) : logs).map((log, index) => (
            <tr key={log.id || index}>
              <td>{log.shop_name || "Platform"}</td>
              <td>
                <span className="pa-badge">{log.category || "other"}</span>
              </td>
              {!compact && (
                <>
                  <td>{date(log.created_at)}</td>
                  <td>{log.description || log.notes || "\u2014"}</td>
                  <td>{log.payment_method || "\u2014"}</td>
                </>
              )}
              <td className="pa-number">{money(log.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ConfirmDialog({ dialog, busy, error, onClose, onConfirm }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("button")?.focus();
    return () => previous?.focus();
  }, []);
  function keydown(event) {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key !== "Tab") return;
    const controls = [
      ...panel.current.querySelectorAll("button:not(:disabled)"),
    ];
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0]?.focus();
    }
  }
  const reset = dialog.kind === "reset",
    done = dialog.kind === "password";
  return (
    <div
      className="pa-backdrop"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="pa-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pa-dialog-title"
        ref={panel}
        onKeyDown={keydown}
      >
        <header>
          <span className="pa-dialog-icon">
            <ShieldCheck size={24} />
          </span>
          <button aria-label="Close dialog" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <h2 id="pa-dialog-title">
          {done
            ? "Temporary password created"
            : reset
              ? "Reset administrator password?"
              : dialog.store.status === "active"
                ? "Suspend restaurant?"
                : "Reactivate restaurant?"}
        </h2>
        {done ? (
          <>
            <p>
              Temporary password for <strong>{dialog.username}</strong>. Share
              it securely with the restaurant owner.
            </p>
            <output className="pa-password">{dialog.password}</output>
          </>
        ) : (
          <>
            <p>
              <strong>{dialog.store.store_name}</strong>
            </p>
            <p>
              {reset
                ? "This generates a new temporary password for the restaurant administrator. They will need it to sign in."
                : dialog.store.status === "active"
                  ? "Suspended restaurants cannot log in or perform POS transactions until reactivated."
                  : "Restore access for this restaurant."}
            </p>
          </>
        )}
        {error && (
          <p className="pa-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button disabled={busy} onClick={onClose}>
            {done ? "Done" : "Cancel"}
          </button>
          {!done && (
            <button className="pa-primary" disabled={busy} onClick={onConfirm}>
              {busy ? "Saving..." : reset ? "Reset password" : "Confirm change"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export default function PlatformAdmin() {
  const [user, setUser] = useState(null),
    [authError, setAuthError] = useState("");
  const [tab, setTab] = useState(currentTab),
    [drawer, setDrawer] = useState(false);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [version, setVersion] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0);
  const [days, setDays] = useState(5),
    [printShop, setPrintShop] = useState(null);
  const [dialog, setDialog] = useState(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useEffect(() => {
    let active = true;
    api("/api/auth/me")
      .then(({ user: account }) => {
        if (!active) return;
        if (account?.role !== "superadmin") {
          setAuthError(
            "This workspace is available to root administrators only.",
          );
          return;
        }
        if (account.must_change_password) {
          location.replace("/app/change-password");
          return;
        }
        setUser(account);
      })
      .catch((error) => {
        if (active) {
          if (error.status === 401) location.replace("/app/login");
          else setAuthError(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const changed = () => setTab(currentTab());
    addEventListener("hashchange", changed);
    addEventListener("popstate", changed);
    return () => {
      removeEventListener("hashchange", changed);
      removeEventListener("popstate", changed);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    document.cookie =
      "rms_theme=" +
      (dark ? "dark" : "light") +
      "; Path=/; Max-Age=31536000; SameSite=Lax";
  }, [dark]);
  const enabled = Boolean(user);
  const stats = useResource(
    "/api/admin/store-stats",
    enabled && tab === "overview",
    version,
  );
  const stores = useResource(
    "/api/admin/stores?limit=25&offset=" +
      offset +
      "&search=" +
      encodeURIComponent(query),
    enabled && ["overview", "stores"].includes(tab),
    version,
  );
  const ledger = useResource(
    "/api/admin/financial-logs",
    enabled && ["overview", "ledger"].includes(tab),
    version,
  );
  const activity = useResource(
    "/api/admin/activity",
    enabled && tab === "activity",
    version,
  );
  const health = useResource(
    "/api/admin/integration-health",
    enabled && tab === "health",
    version,
  );
  const printData = useResource(
    "/api/admin/print-analytics/shops" +
      (printShop ? "/" + printShop.id : "") +
      "?days=" +
      days,
    enabled && tab === "print-analytics",
    version,
  );
  function selectTab(key) {
    window.history.pushState(null, "", "/app/admin/" + key);
    setTab(key);
    setNotice("");
  }
  async function logout() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      sessionStorage.clear();
      location.replace("/app/login");
    } catch (error) {
      setNotice(error.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function confirmAction() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setActionError("");
    try {
      if (dialog.kind === "reset") {
        const result = await api(
          "/api/admin/store/" + dialog.store.id + "/reset-password",
          { method: "PATCH" },
        );
        setDialog({
          kind: "password",
          username: result.username,
          password: result.newPassword,
        });
      } else {
        await api("/api/admin/store/" + dialog.store.id + "/status", {
          method: "PATCH",
          body: {
            status: dialog.store.status === "active" ? "blocked" : "active",
          },
        });
        setDialog(null);
        setNotice("Restaurant status updated.");
      }
      refresh();
    } catch (error) {
      if (error.status === 401) location.replace("/app/login");
      setActionError(error.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function exportCsv() {
    const rows = stores.data?.stores || [];
    const cell = (value) => {
      const text = String(value ?? "");
      return (
        '"' +
        (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
        '"'
      );
    };
    const csv = [
      [
        "ID",
        "Restaurant",
        "Status",
        "Owner",
        "Email",
        "Products",
        "Staff",
        "Plan",
        "Created",
      ],
      ...rows.map((store) => [
        store.id,
        store.store_name,
        store.status,
        store.owner_name,
        store.owner_email,
        store.product_count,
        store.user_count,
        store.subscription_plan,
        store.created_at,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "orbit-restaurants-page.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const navItems = [
    ...[
      [LayoutDashboard, "overview"],
      [Building2, "stores"],
      [Activity, "activity"],
      [HeartPulse, "health"],
      [Printer, "print-analytics"],
      [Wallet, "ledger"],
    ].map(([Icon, key]) => ({
      key,
      label: TABS[key],
      icon: <Icon size={18} />,
      onClick: () => selectTab(key),
      group: "Platform",
    })),
    ...[
      [Network, "hierarchy", "Restaurant management"],
      [CircleDollarSign, "subscriptions", "Platform payments"],
      [Users, "users", "Users & access"],
      [Settings, "settings", "Settings"],
      [FileText, "logs", "Audit logs"],
    ].map(([Icon, key, label]) => ({
      key,
      label,
      icon: <Icon size={18} />,
      onClick: () => selectTab(key),
      group: "Management",
    })),
    {
      key: "moons",
      label: "Moon catalog",
      icon: <Moon size={18} />,
      onClick: () => selectTab("moons"),
      group: "Management",
    },
    {
      key: "announcements",
      label: "Announcements",
      icon: <Bell size={18} />,
      onClick: () => selectTab("announcements"),
      group: "Management",
    },
    {
      key: "categories",
      label: "Expense categories",
      icon: <FileText size={18} />,
      onClick: () => selectTab("categories"),
      group: "Management",
    },
    {
      key: "requests",
      label: "Request diagnostics",
      icon: <Activity size={18} />,
      onClick: () => selectTab("requests"),
      group: "Management",
    },
    {
      key: "notifications",
      label: "Notifications",
      icon: <Bell size={18} />,
      onClick: () => selectTab("notifications"),
      group: "Management",
    },
  ];
  function storeTable(data) {
    return (
      <>
        <div className="pa-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Status / plan</th>
                <th>Products / staff</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.stores?.map((store, index) => (
                <tr key={store.id + "-" + index}>
                  <td>
                    <div className="pa-store-name">
                      <span>
                        {String(store.store_name || "\u2014")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <div>
                        <strong>{store.store_name}</strong>
                        <small>
                          {store.owner_name || "No administrator"} /{" "}
                          {store.owner_email || "\u2014"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        "pa-badge " +
                        (store.status === "active" ? "good" : "warning")
                      }
                    >
                      {store.status}
                    </span>
                    <small>
                      {store.subscription_plan?.replaceAll("_", " ") ||
                        "No plan"}
                    </small>
                  </td>
                  <td>
                    {number(store.product_count)} products
                    <small>{number(store.user_count)} staff</small>
                  </td>
                  <td>
                    {date(store.created_at)}
                    <small>Shop #{store.id}</small>
                  </td>
                  <td>
                    <div className="pa-row-actions">
                      <button
                        title={"Reset password for " + store.store_name}
                        aria-label={"Reset password for " + store.store_name}
                        onClick={() => {
                          setActionError("");
                          setDialog({ kind: "reset", store });
                        }}
                      >
                        <KeyRound size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setActionError("");
                          setDialog({ kind: "status", store });
                        }}
                      >
                        {store.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.stores?.length && (
            <Empty>No restaurants match your search.</Empty>
          )}
        </div>
        <footer className="pa-pagination">
          <span>
            {data.total ? offset + 1 : 0} -
            {Math.min(offset + 25, data.total || 0)} of {number(data.total)}
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 25))}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              aria-label="Next page"
              disabled={offset + 25 >= Number(data.total || 0)}
              onClick={() => setOffset((value) => value + 25)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </footer>
      </>
    );
  }
  if (authError)
    return (
      <main className="pa-access-error">
        <ShieldCheck size={36} />
        <h1>Platform access restricted</h1>
        <p role="alert">{authError}</p>
        <a href="/app/login">Sign in with a root account</a>
      </main>
    );
  if (!user)
    return (
      <main className="pa-auth-loading" aria-label="Checking platform access">
        <div className="pa-skeleton" />
        <div className="pa-skeleton" />
      </main>
    );
  return (
    <div className="marketplace platform-admin">
      <RootSidebar
        user={user}
        items={navItems}
        activeId={tab}
        drawerOpen={drawer}
        onClose={closeDrawer}
        onLogout={logout}
        busy={busy}
      />
      <div className="market-main">
        <header className="market-topbar pa-topbar">
          <div>
            <button
              className="market-icon-button market-menu-toggle"
              aria-label="Open navigation"
              onClick={() => setDrawer(true)}
            >
              <Menu size={19} />
            </button>
            <span>Orbit OS</span>
            <span className="pa-breadcrumb">/</span>
            <strong>Root administration</strong>
          </div>
          <div>
            <button
              className="market-icon-button"
              onClick={() => selectTab("notifications")}
              aria-label="Notifications"
            >
              <Bell size={17} />
            </button>
            <button
              className="market-icon-button"
              onClick={() => setDark((value) => !value)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="market-avatar" title={user.name || user.username}>
              {(user.name || user.username || "A").slice(0, 1)}
            </span>
          </div>
        </header>
        <main className="pa-content">
          <section className="pa-hero">
            <div>
              <p className="pa-eyebrow">
                <ShieldCheck size={13} /> Your platform, in orbit
              </p>
              <h1>{TABS[tab]}</h1>
              <p>
                One clear view of your restaurants, operations, and platform
                performance.
              </p>
            </div>
            <div className="pa-hero-actions">
              <button onClick={() => selectTab("requests")}>
                Live requests
                <ArrowUpRight size={15} />
              </button>
              <button onClick={refresh}>
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>
          </section>
          {notice && (
            <div className="pa-notice" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {tab === "overview" && (
            <>
              <Resource state={stats} onRetry={refresh}>
                {(data) => (
                  <>
                    <div className="pa-metrics">
                      <Metric
                        icon={Wallet}
                        label="Platform revenue"
                        value={money(data.platformRevenue)}
                        note="Recorded platform income"
                        tone="lavender"
                      />
                      <Metric
                        icon={Building2}
                        label="Restaurants"
                        value={number(data.totalStores)}
                        note={
                          number(data.activeStores) +
                          " active / " +
                          number(data.suspendedStores) +
                          " suspended"
                        }
                      />
                      <Metric
                        icon={CircleDollarSign}
                        label="Monthly subscriptions"
                        value={money(data.mrr)}
                        note="Current month payment records"
                      />
                      <Metric
                        icon={Users}
                        label="Users / products"
                        value={number(data.totalUsers)}
                        note={
                          number(data.totalProducts) + " products across shops"
                        }
                      />
                    </div>
                    <div className="pa-overview-grid">
                      <Panel
                        title="Revenue trend"
                        description="Subscription payment history"
                      >
                        <div className="pa-chart">
                          {data.growth?.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={data.growth}>
                                <defs>
                                  <linearGradient
                                    id="pa-revenue"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      offset="0%"
                                      stopColor="#9d87db"
                                      stopOpacity={0.4}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="#9d87db"
                                      stopOpacity={0}
                                    />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid
                                  strokeDasharray="4 4"
                                  vertical={false}
                                  stroke="var(--market-line)"
                                />
                                <XAxis
                                  dataKey="month"
                                  tick={{
                                    fontSize: 11,
                                    fill: "var(--market-muted)",
                                  }}
                                />
                                <YAxis
                                  tick={{
                                    fontSize: 10,
                                    fill: "var(--market-muted)",
                                  }}
                                  width={55}
                                />
                                <Tooltip
                                  formatter={(value) => money(value)}
                                  contentStyle={{
                                    background: "var(--market-surface)",
                                    borderColor: "var(--market-line)",
                                    borderRadius: 12,
                                    color: "var(--market-ink)",
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="revenue"
                                  stroke="#9d87db"
                                  fill="url(#pa-revenue)"
                                  strokeWidth={2.5}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : (
                            <Empty>No subscription trend data yet.</Empty>
                          )}
                        </div>
                      </Panel>
                      <Panel
                        title="Income breakdown"
                        description="Platform payments, separate from restaurant sales"
                      >
                        <div className="pa-breakdown">
                          {[
                            ["Subscriptions", data.subRevenueTotal],
                            ["Setup fees", data.setupFeesTotal],
                            [
                              "Other income",
                              Number(data.platformRevenue || 0) -
                                Number(data.subRevenueTotal || 0) -
                                Number(data.setupFeesTotal || 0),
                            ],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <span>{label}</span>
                              <strong>{money(value)}</strong>
                              <div>
                                <i
                                  style={{
                                    width:
                                      Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          Number(data.platformRevenue)
                                            ? (Number(value) /
                                                Number(data.platformRevenue)) *
                                                100
                                            : 0,
                                        ),
                                      ) + "%",
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                          <p>
                            Restaurant sales volume{" "}
                            <strong>{money(data.globalSales)}</strong>
                          </p>
                        </div>
                      </Panel>
                    </div>
                  </>
                )}
              </Resource>
              <Panel
                title="Recent payments"
                description="Latest recorded platform payments"
              >
                <Resource state={ledger} onRetry={refresh}>
                  {(data) => <Ledger logs={data.logs || []} compact />}
                </Resource>
              </Panel>
            </>
          )}
          {["overview", "stores"].includes(tab) && (
            <Panel
              title="Restaurant directory"
              description="Manage access and inspect restaurant accounts"
            >
              <div className="pa-directory-tools">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setOffset(0);
                    setQuery(search.trim());
                  }}
                >
                  <Search size={17} />
                  <input
                    aria-label="Search restaurants"
                    placeholder="Search restaurants..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <button type="submit">Search</button>
                </form>
                <button
                  onClick={exportCsv}
                  disabled={stores.loading || !stores.data?.stores?.length}
                >
                  <Download size={15} />
                  Export page CSV
                </button>
                <button onClick={() => window.print()}>
                  <Printer size={15} />
                  Print / PDF
                </button>
              </div>
              <Resource state={stores} onRetry={refresh}>
                {storeTable}
              </Resource>
            </Panel>
          )}
          {tab === "ledger" && (
            <Panel
              title="Platform payment history"
              description="Read-only ledger. Manage payments in Platform payments."
            >
              <div className="pa-inline-actions">
                <button onClick={() => selectTab("subscriptions")}>
                  Manage platform payments
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <Resource state={ledger} onRetry={refresh}>
                {(data) => <Ledger logs={data.logs || []} />}
              </Resource>
            </Panel>
          )}
          {tab === "activity" && (
            <Panel
              title="System activity"
              description="Administrative actions across the platform"
            >
              <Resource state={activity} onRetry={refresh}>
                {(data) =>
                  data.length ? (
                    <div className="pa-activity">
                      {data.map((log, index) => (
                        <article key={log.id || index}>
                          <span>
                            <Activity size={17} />
                          </span>
                          <div>
                            <strong>{log.action}</strong>{" "}
                            <small>{log.store_name || "Platform"}</small>
                            <p>{log.details}</p>
                            <time>{date(log.created_at)}</time>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty>No system activity recorded.</Empty>
                  )
                }
              </Resource>
            </Panel>
          )}
          {tab === "health" && (
            <>
              <div className="pa-inline-actions">
                <button onClick={refresh}>
                  Refresh detailed diagnostics
                  <RefreshCw size={15} />
                </button>
              </div>
              <Resource state={health} onRetry={refresh}>
                {(data) => (
                  <>
                    <div className="pa-health-grid">
                      {data.checks?.map((check) => (
                        <Panel key={check.id} title={check.name}>
                          <span
                            className={
                              "pa-badge " +
                              (check.status === "ok" ? "good" : "warning")
                            }
                          >
                            {check.status}
                          </span>
                          <p className="pa-muted">{check.detail}</p>
                          <small>{number(check.durationMs)} ms</small>
                          {check.data && (
                            <details>
                              <summary>Diagnostic details</summary>
                              <pre>{JSON.stringify(check.data, null, 2)}</pre>
                            </details>
                          )}
                        </Panel>
                      ))}
                    </div>
                    <p className="pa-muted">
                      Checked {date(data.checkedAt)} /{" "}
                      {data.cached ? "Cached snapshot" : "Fresh snapshot"}.
                      Provider account health and physical print delivery are
                      not guaranteed by these checks.
                    </p>
                  </>
                )}
              </Resource>
            </>
          )}
          {tab === "print-analytics" && (
            <>
              <div className="pa-inline-actions">
                {printShop && (
                  <button onClick={() => setPrintShop(null)}>
                    <ArrowLeft size={16} />
                    All restaurants
                  </button>
                )}
                <label>
                  Reporting period{" "}
                  <select
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value))}
                  >
                    {[1, 5, 7, 30].map((value) => (
                      <option value={value} key={value}>
                        {value === 1 ? "Today" : "Last " + value + " days"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Resource state={printData} onRetry={refresh}>
                {(data) =>
                  printShop ? (
                    <>
                      <h2 className="pa-section-title">{data.shop?.name}</h2>
                      <div className="pa-metrics pa-print-metrics">
                        {[
                          ["Total jobs", data.summary?.total_jobs],
                          ["Printed", data.summary?.printed_jobs],
                          ["Failed", data.summary?.failed_jobs],
                          [
                            "Success rate",
                            data.summary?.success_rate == null
                              ? "\u2014"
                              : data.summary.success_rate + "%",
                          ],
                          [
                            "Average claim",
                            duration(data.summary?.avg_claim_ms),
                          ],
                          [
                            "Average completion",
                            duration(data.summary?.avg_completion_ms),
                          ],
                        ].map(([label, value]) => (
                          <Metric
                            key={label}
                            icon={Printer}
                            label={label}
                            value={value}
                          />
                        ))}
                      </div>
                      <div className="pa-overview-grid">
                        <Panel title="Daily print activity">
                          <div className="pa-table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Day</th>
                                  <th>Total</th>
                                  <th>Printed</th>
                                  <th>Failed</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.daily?.map((row) => (
                                  <tr key={row.day}>
                                    <td>{row.day}</td>
                                    <td>{row.total}</td>
                                    <td>{row.printed}</td>
                                    <td>{row.failed}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </Panel>
                        <Panel title="Transport health">
                          <p className="pa-muted">
                            Agent{" "}
                            {data.transport?.agent_connected
                              ? "connected"
                              : "disconnected"}
                          </p>
                          <p className="pa-muted">
                            WebSocket{" "}
                            {data.transport?.websocket_enabled
                              ? "enabled"
                              : "disabled"}
                          </p>
                          <p className="pa-muted">
                            Last seen {date(data.transport?.last_seen_at)}
                          </p>
                          <p className="pa-muted">
                            Transport attribution{" "}
                            {data.transport?.attribution_available
                              ? "available"
                              : "unavailable"}
                            . Printed status records agent acknowledgement, not
                            verified physical paper output.
                          </p>
                        </Panel>
                      </div>
                      <Panel title="Printer stations">
                        <div className="pa-table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Station</th>
                                <th>Total</th>
                                <th>Printed</th>
                                <th>Failed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.stations?.map((row) => (
                                <tr key={row.station_name}>
                                  <td>{row.station_name}</td>
                                  <td>{row.total}</td>
                                  <td>{row.printed}</td>
                                  <td>{row.failed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!data.stations?.length && (
                            <Empty>No station activity.</Empty>
                          )}
                        </div>
                      </Panel>
                      <Panel title="Recent failures and retries">
                        {data.recent_failures?.length ? (
                          <div className="pa-activity">
                            {data.recent_failures.map((row) => (
                              <article key={row.id}>
                                <Printer size={18} />
                                <div>
                                  <strong>
                                    {row.station_name} ? #{row.id}
                                  </strong>
                                  <p>{row.error}</p>
                                  <small>
                                    {row.status} / {row.attempts} attempts ?{" "}
                                    {date(row.occurred_at)}
                                  </small>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <Empty>No failures recorded in this period.</Empty>
                        )}
                      </Panel>
                    </>
                  ) : (
                    <div className="pa-shop-grid">
                      {data.shops?.map((shop) => (
                        <button
                          className="pa-print-shop"
                          key={shop.id}
                          onClick={() => setPrintShop(shop)}
                        >
                          <span className="pa-metric-icon">
                            <Printer size={22} />
                          </span>
                          <strong>
                            {shop.name}
                            <ArrowUpRight size={16} />
                          </strong>
                          <span
                            className={
                              "pa-badge " + (shop.agent_connected ? "good" : "")
                            }
                          >
                            {shop.agent_connected
                              ? "Agent connected"
                              : "Agent offline"}
                          </span>
                          <div>
                            <span>{shop.total_jobs} jobs</span>
                            <span>{shop.failed_jobs} failed</span>
                            <span>{shop.pending_jobs} pending</span>
                          </div>
                          <small>
                            {shop.printer_count} printers ?{" "}
                            {shop.success_rate == null
                              ? "No completed jobs"
                              : shop.success_rate + "% success"}
                          </small>
                        </button>
                      ))}
                      {!data.shops?.length && (
                        <Empty>No restaurants available.</Empty>
                      )}
                    </div>
                  )
                }
              </Resource>
            </>
          )}
          <Suspense
            fallback={
              <div
                className="pa-skeleton-grid"
                aria-label="Loading root workspace"
              >
                <div className="pa-skeleton" />
                <div className="pa-skeleton" />
              </div>
            }
          >
            {tab === "hierarchy" && (
              <RestaurantManagement version={version} onChange={refresh} />
            )}
            {tab === "subscriptions" && (
              <PlatformPayments version={version} onChange={refresh} />
            )}
            {tab === "users" && (
              <RootUsers user={user} version={version} onChange={refresh} />
            )}
            {tab === "logs" && <RootAudit version={version} />}
            {tab === "settings" && <RootSettings user={user} />}
            {tab === "notifications" && <RootNotifications version={version} />}
            {tab === "categories" && <RootCategories version={version} />}
            {tab === "requests" && <RootRequests version={version} />}
            {tab === "moons" && <RootMoons embedded />}
            {tab === "announcements" && <RootAnnouncements embedded />}
          </Suspense>
          <footer className="pa-footer">
            <span>Orbit OS / Platform workspace</span>
            <span>Root administrator</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <ConfirmDialog
          key={dialog.kind}
          dialog={dialog}
          busy={busy}
          error={actionError}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
          onConfirm={confirmAction}
        />
      )}
    </div>
  );
}
