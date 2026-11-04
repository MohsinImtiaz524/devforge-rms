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
