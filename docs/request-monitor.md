# Live request monitor

Root navigation: Command Center > Live Requests, or `/api/admin/request-monitor/view`.
Restart/deploy the updated backend first. No schema migration or new credentials.

Four live cards show backend HTTP completions, database queries (Knex and native
pg), server-side Cloudflare R2 commands, and outbound Web Push calls. Each shows
counts since process startup, counts in the last 60 seconds, failures, average
execution time, and the latest 12 completed events. Retention is capped at 100
events per category. Pending Knex timing entries are bounded at 2,000.

Request codes correlate HTTP operations with their asynchronous database/storage
calls. Background work has no incoming request code. Query values, URL query
strings, unknown path segments, credentials, bodies and headers are not recorded.
Table/operation names are labels, not query plans or billing estimates.

No monitoring SQL polling/writes. Updates use a separate root-only Socket.IO
namespace; only connected viewers cause one-second snapshots. Slow connections
use volatile delivery instead of a growing event backlog. Root viewer streams
expire after at most 15 minutes and must reconnect to reauthenticate. Existing
session revocation semantics apply; this is not immediate live revocation.

Not captured: other instances, Cloudflare edge traffic, direct signed browser
uploads/downloads, provider account APIs, individual SDK retry attempts, and
un-instrumented external calls. WebSocket health remains on Integration Health;
this page does not count WebSocket payloads or prove receipt delivery. Native pg
promise/callback queries are supported; custom query/stream objects are not timed.
Counts reset on restart and are not four-day history. No database rows persist.

R2 query timing ends when the SDK command resolves, potentially before its body
has streamed. Knex timing covers query dispatch/completion rather than pool wait.
Viewing this monitor creates normal HTTP/session traffic, included in totals.

Validation:
`node --test tests/request-monitor.test.js tests/integration-health.test.js tests/order-realtime.test.js tests/files-worker.test.js tests/files.test.js tests/announcements-storage.test.js`
`node tests/request-monitor-browser.cjs`

Rollback: revert the request-monitor module, instrumentation hooks and navigation
changes through the normal release process. No database rollback is required.

Database card also reports a rolling 24-hour observed-call count using fixed-size in-memory second buckets (about 1.4 MB). It includes failed calls, has one-second resolution, marks startup coverage under 24 hours as partial, and resets on restart. It cannot reconstruct prior-day history from cumulative PostgreSQL counters or combine other instances.

## System intelligence extension

The existing root monitor now adds SQL calls per minute, >=250 ms slow calls,
normalized SHA-256 query fingerprints, primary-table labels, module attribution,
selected exact public function boundaries and 1-in-20 stack attribution elsewhere.
Only hashes are stored; normalized SQL is not retained. Table labels are heuristic
primary references, not a complete SQL parser or list of every joined table.

AsyncLocalStorage links HTTP, Socket.IO handlers and named Files/Inventory/Session
jobs to their SQL. Only authenticated session or verified agent context supplies
a tenant ID. Legacy unauthenticated polling remains unattributed. No tenant names
are loaded for diagnostics. Tenant resource usage means request count, SQL count,
errors and SQL elapsed time; no per-tenant CPU, memory or cost is invented.

Socket counters observe application packets in existing namespaces and exclude
the monitor stream. Current sockets/agents come from existing in-memory state;
no heartbeat or queue query is introduced. Reconnects cannot be distinguished
reliably from new sockets; queue depth and physical print delivery are not polled.
Empty HTTP print-claim arrays are measured, along with related retained SQL calls.
Claims are not assumed to be polling or unnecessary. Print delivery is unchanged.

Minute summaries are capped at 10,081 buckets, with the latest 3,000 detail events.
1 minute, 1 hour, 24 hours and 7 days select available data in this process only.
Boundary minute buckets can include up to 60 seconds outside the window. Details
and rankings are explicitly marked truncated if the ring dropped relevant events.
The activity chart may downsample observed minute points; it does not display
averaged rates. Totals include all instrumented completions in retained minutes.
History is not persisted and resets on restart. The separate exact-second 24-hour
SQL counter remains available. No history is backfilled from pg_stat_statements.

Infrastructure uses process.cpuUsage deltas, process.memoryUsage, process.uptime
and existing Knex/pg pool counters. Process CPU is normalized to one core (can
exceed 100%). Host/container quota and server-side Neon connection counts remain
unavailable. Snapshot computation is shared per selected window for live viewers.

Repeated fingerprints, high per-trace SQL fan-out and >=4 endpoint calls in a
second are heuristics. Identical endpoint shapes do not prove duplicate requests,
SQL repetition does not prove waste, and elapsed query time is not CU-hours.

Validation additions: tests/request-monitor-intelligence.test.js and the extended
browser test cover history, buffer truncation, trusted tenant identity, event-to-SQL
context, empty claims, function semantics, and UI filters. No new dependencies,
monitoring SQL reads/writes, schema changes, or production environment changes.

## Reference-aligned interface

The dashboard uses the supplied reference layout: a 212px sidebar, six KPI cards,
three overview panels, print/socket/tenant panels, and infrastructure/insights.
Standard Lucide icons are exported from the existing installed lucide-react package
into public/icons/monitor-icons.svg (ISC license included). The sprite loads once
and its trusted SVG nodes are cloned locally; live updates do not refetch icons.

Working controls include sidebar navigation, history windows, pause/resume,
reconnect, fullscreen when supported, View all/details, insight drilldowns and
request-code filtering. Details remain collapsed until opened. Trace rows stop
rerendering while hovered/focused so controls remain stable for inspection.
A request -> function -> SQL/external flow and a Neon cost interpretation section
explain attribution and distinguish measured operations from billable CU-hours.

Reference screenshots in reports/request-monitor are generated by the isolated
browser test with synthetic, labeled test fixtures. They are visual QA artifacts,
not real production measurements. The page itself has no demo-data fallback.
Desktop (1536x1024), mobile (390px), shared light/dark themes, no horizontal page
overflow, no console errors and one icon fetch per page load were verified.
