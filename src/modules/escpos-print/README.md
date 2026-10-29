# ESC/POS printing

## Fast delivery

New agents negotiate `websocket-v1`: job-ready events trigger an atomic claim
over Socket.IO, which returns the complete routed JSON job on the same connection.
Confirmations also use Socket.IO. HTTP claims remain for older agents only.
Each printer has a separate serialized lane, so different printers run concurrently.
Dashboard Refresh status only loads status; it cannot start or recover printing.
Connection, job, and configuration events drive automatic recovery without the UI.

Successful order/payment/explicit print-queue writes also send an after-response
wake-up for pending printer stations. This is independent of the database trigger:
local agents wake directly and PostgreSQL forwards the signal across instances.
Failed writes, status reads and claims do not send wake-ups. The PostgreSQL listener
reconnects after both startup failures and a closed LISTEN connection. No scheduled
polling or localhost pause/resume is needed to receive the next order.

Windows uses one persistent PowerShell RAW worker per active printer. The helper
compiles once and accepts newline-delimited JSON on stdin; later receipts reuse
it. A failed/timed-out write is held for review, never blindly replayed. Workers
are stopped with the agent and recreated after exit. Linux/macOS retain CUPS.
Timing logs separate claim, formatting, and spool submission. The first Windows
submission includes worker startup; actual hardware speed is not guaranteed.

## RMS-owned formats

`receipt-templates.json` contains the versioned kitchen, customer (paid), and
unpaid layouts. RMS sends the bundle in `/api/escpos-print/config`; it is saved
inside the agent's `config.json` with settings and artwork. `escpos-print.data.js`
prepares receipt values in RMS. The downloaded agent contains only a generic
interpreter for text, rows, tables, repeating sections, images, QR, gaps, and
dividers. Templates contain data references and literal text, never executable
JavaScript. No database migration or new permissions are needed.

Change labels, section order, table columns, or alignment in the RMS JSON file,
increment its `version`, and deploy/restart RMS. Agents refresh automatically
on connection/reconnection; the old template stays cached if validation fails.
Receipt Settings changes keep their existing live sync. Adding a new rendering
operation requires an agent update; editing an existing operation's layout does
not. This release requires downloading `agent.js` once to install the generic
renderer. The previous PDF/HTML receipt workflow is unchanged.

The module reuses RMS printer routing and the existing print queue. No new tables
or permissions are introduced. Downloads require `settings.manage_printers` or
`settings.update`; agent calls
use a signed, expiring shop credential. All queue reads and transitions
are scoped to that shop and its currently registered printers.

Jobs transition atomically from pending to printing, then printed or failed.
Failures require an explicit retry. The agent journals spool submissions before
confirmation and keeps ambiguous interrupted submissions for operator review
rather than automatically printing them again.

Receipt settings and monochrome artwork sync automatically at connection/reconnection
and when RMS settings, logos, promotions, or printers change. Refresh Cache is an
optional troubleshooting action. A failed refresh preserves the previous cache. Fresh bill data
arrives as JSON. Nothing opens a browser print dialog or generates a PDF.

## Installation

Download **ESC/POS Agent** in Settings > Printers & Routing. On the printer
computer install Node.js 22, then run `npm install socket.io-client` in the
download folder and `node agent.js`. Keep the downloaded
file private: it contains a credential valid for 180 days. Configure a persistent
`PRINT_AGENT_SECRET` (or `SESSION_SECRET`) on the RMS server before downloading.

The agent runs unattended after setup. Open http://localhost:3000 for status,
optional Refresh Cache, pause/resume, paper width, and
interrupted-job review. Printer registration, routing, and receipt design stay
in RMS. The agent binds only to loopback. Set `PRINT_AGENT_PORT` if 3000 is busy.

The overview shows RMS queue totals, per-printer accepted/waiting/failed counts,
and the latest 30 jobs. Expand an error to see its message and the failing stage:
RMS job claim/confirmation, receipt formatting, or local printer/spooler. Local
interrupted submissions remain on hold until checked and resolved by the user.
Queue totals cover stored RMS jobs for the shop's registered printers, including
jobs processed by other agents. They are not a count of physically verified receipts.

The browser receives local dashboard events over SSE; it never periodically
polls RMS. Queue status updates on WebSocket connection/recovery, job processing,
and the explicit Refresh status button. Check local printers queries the OS;
an installed printer is not a guarantee of paper, power, or successful output.
Status timestamps remain visible so a disconnected snapshot is not mistaken for
current hardware status. Refresh Cache, paper settings, pause/resume, reconnect,
and recovery controls report success or errors without leaving the dashboard.

Socket.IO handles transport reconnection. After reconnecting, the agent checks
unconfirmed claims before draining each printer. A transient JSON request failure
has at most three delayed recovery attempts (1, 3, and 8 seconds), not a periodic
polling loop. A lost claim response becomes a review hold; a lost confirmation
retries confirmation without submitting another print. Authorization errors and
ambiguous printer writes are never automatically retried. If recovery is
exhausted, Refresh status or Reconnect RMS triggers an explicit reconciliation.
If a proxy blocks WebSockets entirely, the UI reports the connection error;
the user must allow WebSockets or use the existing polling agent.

Successful RMS settings/printer/profile mutations notify the agent after the HTTP
response finishes. Notifications reuse the existing PostgreSQL channel across
backend instances. The agent rejoins the current printer rooms, refreshes its
cache, and drains waiting jobs automatically. Changes during an in-flight sync
are coalesced and fetched again before synchronization completes.

After changing the agent code, deploy/restart RMS, download the new `agent.js`,
stop the previous process, and run the new file. Existing cache and job history
remain in the same local data directory.

WebSocket notifications use `/escpos-print-agent` and the existing PostgreSQL
after-commit queue notifications. No periodic polling is used. Reconnection
drains pending jobs. Production needs a persistent RMS server with WebSocket
support (the existing backend), rather than a request-only serverless handler.
SQLite has no PostgreSQL queue notifications; it can drain on connect or manual
refresh, but live notification delivery requires PostgreSQL.

Run only one agent for each printer. Existing downloads and receipt endpoints
are unchanged. The new agent claims only customer, unpaid, kitchen, and drawer
jobs; shift reports and other documents stay with the existing workflow.
Native text currently supports ASCII; non-ASCII text fails explicitly rather
than printing corrupt names. Images are monochrome and fonts, weights, spacing,
and dividers map to the printer's supported commands; CSS fonts/italics are not
pixel-identical. Native QR printing depends on the printer's QR support.

Spool acceptance does not prove paper came out. Interrupted RAW writes require
operator review in the local UI; automatic retries could print duplicates.
Failed jobs can be explicitly retried from the local agent UI or the existing
RMS failed-job screen when realtime printing is enabled. Refresh preserves the previous cache if an
asset cannot be downloaded or decoded. No original artwork is modified.
