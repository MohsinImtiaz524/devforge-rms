# Moons catalog foundation: implementation and enablement

This is the first implementation milestone. It does not activate subscriptions, charge shops, alter platform login, or gate existing Staff/Analytics access.

## Included

- Code registry for Staff Management, Analytics and unimplemented Website Builder/Publisher.
- Additive startup schema for catalog, immutable offered prices, catalog audit events, shop subscription placeholders, committed service periods and tenant-scoped subscription events.
- Super Admin-only API and React editor at `/app/moons/manage` with metadata, status, offered prices, audit history and verified R2 artwork.
- Exact platform_moons permissions, optimistic version conflicts, transactional artwork saves and safe error responses.
- Draft seed entries only. Publishing a catalog item does not activate service for any shop.

## Local/staging enablement

1. Review the migration and verify the intended database connection before enabling the feature. Do not apply this to production without an approved rollout.
2. Set `MOONS_ENABLED=true` in the intended environment and restart the backend. This enables the catalog and runs the additive migration once during startup, under a PostgreSQL advisory transaction lock. No request-time migration is used.
3. For artwork, the existing `FILES_ENABLED=true` and valid R2 configuration/file workers must already be enabled. Otherwise catalog metadata/prices still work and the editor explains uploads are unavailable.
4. Sign in as Super Admin and open Moons Catalog in the React lobby or `/app/moons/manage` directly. Add details and an explicit price (0 is free), then publish Analytics. Staff remains in preparation; Website publication stays unavailable until implemented.
5. Normal shop roles cannot edit catalog metadata/prices/artwork even if they guess API URLs. There is no customer subscribe endpoint in this milestone.

No environment variables were edited and no live database migrations were run during implementation. The feature defaults off. R2 artwork transport reuses the existing Files service and workers; no new bucket is created.

## Schema and lifecycle ownership

Moons owns its catalog and subscription foundation. Files owns all image objects, uploads, metadata and attachments through public service methods. Global catalog rows have no shop_id; subscription/service-period/event rows carry shop_id and composite references. No financial invoice tables or recurring billing workers are enabled yet. Future lifecycle writes must validate eligible shop, matching price/currency and immutable period snapshots transactionally; the placeholder schema is not itself an entitlement resolver.

Catalog status: draft/published/archived. Publishing requires an implemented registry entry, nonempty details and explicit offered price. Offered prices are snapshots, not invoices or subscription prices; changes create new rows. Concurrent/stale mutations return MOON_VERSION_CONFLICT. Retry after reloading, rather than submitting an outdated version. Failed database/audit/artwork writes roll back the entire mutation. The API returns no-store and uses existing global session/CSRF middleware.

## Verification

- `npm run test:moons`: isolated SQLite catalog/storage/service tests and mocked HTTP security/failure checks. Includes an opt-in PostgreSQL migration test.
- PostgreSQL: supply **only a disposable/staging** `MOONS_TEST_DATABASE_URL` to enable `tests/moons-postgres.test.js`. The test creates a random schema inside a rolled-back transaction, never uses the normal DATABASE_URL and never commits fixtures. If the explicit variable is absent, the test is skipped.
- `npm --prefix frontend run build` and changed-file ESLint.
- `node frontend/tests/moons-catalog.cjs`: headless Chrome, mocked APIs, desktop/mobile/dark mode, metadata/price edits, conflicts, focus restoration and unauthorized screen. Screenshots under `reports/moons-catalog/`.
- Root `npm test` and existing files/authorization/lobby regressions.

Before production: run the PostgreSQL test against staging, enable the catalog in staging and verify a real R2 upload, reload, artwork replacement and draft/published access. Browser mock checks do not prove external R2 connectivity. Existing unrelated frontend lint failures must be tracked independently.

## Rollback

Set MOONS_ENABLED=false and restart. The catalog APIs become unavailable and the lobby card is removed; existing Staff/Analytics features remain operational. Keep additive tables/history and R2 objects for re-enablement; do not drop tables or delete artwork to roll back.

## Next milestones

Implement shop catalog/subscription lifecycle and entitlement service after approved billing-day/cancellation rules, then whole-platform invoice services and the no-nonpayment-block policy. Migrate Staff/Analytics access only after existing-shop entitlement backfill. Website functionality follows separately. No paid activation or existing-shop access migration is bundled into this foundation.

## Recorded verification (1 November 2026)

- Full backend suite with catalog tests: 165 passed, 3 skipped, 0 failed. Skips include the explicit opt-in PostgreSQL fixture; no staging PostgreSQL URL was supplied.
- Related file/auth/Sales regressions: 16 passed. A further lobby authorization/order check was added and run with the staff authorization tests after final review.
- Headless desktop/mobile/dark-mode catalog checks passed; screenshots were inspected. API mutations were mocked in these browser checks.
- Production frontend build passed; changed-file lint passed. Full frontend lint is not clean: two existing set-state-in-effect errors remain in frontend/src/modules/dashboard/components/ShiftDashboard.jsx. That file was not changed.
- Backend syntax checks and git diff --check passed.
- Still required before production rollout: isolated staging PostgreSQL migration execution and a real R2 upload/reload/replacement check. Feature remains off by default.
