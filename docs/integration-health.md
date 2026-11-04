# Root integration health

Open Platform monitoring > Health > Open Integration Health, or visit
`/api/admin/integration-health/view` while signed in as root/superadmin.

The API is `/api/admin/integration-health`. Both routes enforce superadmin access.
Results are private/no-store, with a 10-second server-side cache and shared in-flight
checks to avoid duplicate probes. There is no background monitoring poll.

Checks:
- Database: bounded SELECT 1 and local Knex pool counts. This is not a query-plan,
  tenant-isolation, billing, or all-pools audit.
- Cloudflare R2: read-only HeadBucket with a four-second abort and no automatic
  retry. A restricted token may deny this operation while uploads still work.
  This does not test object uploads, reads, CORS, DNS/CDN, or account availability.
- Backend: current Node process uptime and memory, plus whether Render identifies
  the runtime. No Render deployment/account API is called.
- WebSockets: root-only diagnostics namespace performs a real browser WebSocket
  connection and acknowledged ping. It never joins tenant rooms or prints.
- Printing: local listener presence and last notification, not physical delivery.
- Files: current process's event-driven worker lifecycle timestamps. A completed
  cycle is not proof a particular file was verified. Actual per-file failures
  remain represented by the existing file/job records.
- Push and provider accounts: explicitly not tested; no push messages are sent.

Verify upload integration using a draft announcement with a small valid image:
wait for verification, open the preview, save, and reopen the draft. Test retries
with mocked storage rather than disabling live credentials.

Telemetry resets on process restart. Behind multiple Render instances, refreshes
may show different processes. No schema migration, new credentials, paid service,
or production environment change is required. Deploy/restart is required to use
new code. Roll back this change through the normal code release process.

Validation commands:
- node --test tests/integration-health.test.js tests/files-worker.test.js tests/files.test.js tests/order-realtime.test.js
- node tests/integration-health-browser.cjs (requires installed Edge and Playwright)
