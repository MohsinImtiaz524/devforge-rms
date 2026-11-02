# Analytics first Moon: copied panel and navigation

Implemented 1 November 2026. This step prepares navigation and copies the existing Analytics panel; it does not replace or redesign the original.

## Navigation

- With MOONS_ENABLED=true, shops have a **Moons** entry in the React lobby.
- `/app/moons` shows published launch-ready Moons. Drafts, Staff (preparing) and Website Builder (coming soon) are not shop offers.
- After Super Admin publishes Analytics with details and an offered price, its directory card opens `/app/moons/analytics`.
- Super Admin continues to use `/app/moons/manage`; a View Moons directory link opens the shop-style catalog.
- `/app/analytics` and its existing lobby link are preserved. Nothing is removed from existing shop navigation in this preparation step.

## Exact panel copy

The original folder is `frontend/src/modules/analytics/` and remains unchanged.

Its files are copied into `frontend/src/modules/moons/analytics/`, including all charts, tabs, filters, topbar, generated/source styles, and UI helpers. Only external relative import paths are adjusted for the deeper folder. `AnalyticsMoon.jsx` opens that copied panel. A regression test compares every copied file with the original after applying exactly those import-path adjustments.

The copy uses the existing Analytics and AI APIs and calculations. No replacement Analytics API, new calculations, subscription gate or new database query logic was introduced for the panel. Existing permissions, including existing shared endpoint requirements, remain in place. Core Dashboard, reports and operational totals remain untouched.

The original and copied panels are deliberately separate during this migration, as requested. Future panel changes must be intentionally applied to the desired version; the equality test will flag divergence until the team explicitly retires the temporary parity requirement.

## Backend ownership

`src/modules/moons/analytics/analytics.moon.js` is the code-owned registration for the first Moon, including route, entry permission, feature list and legacy URLs. It is not a class or another Analytics engine. Analytics is the only launch-ready registration; existing Staff code remains operational but its Moon packaging is not yet launch-ready.

`moons.directory.js` provides authenticated shop catalog reads. It verifies current user/shop membership and blocked status, returns published/launch-ready offers only, and calculates Open availability from the Moon entry permission. No invoices, subscriptions or billing records are created. Catalog metadata and artwork reuse the existing services.

The direct copied panel remains accessible under the same Analytics permissions during preparation; a draft status is not yet an entitlement gate. The unchanged original panel/legacy API also remains accessible. Full subscription enforcement and removal/migration of legacy access are separate future work, after subscription lifecycle and existing-shop migration are ready. Do not sell this preparation step as paid access enforcement.

## Launch preparation

1. Enable/restart the catalog in the intended local/staging environment, using the existing runbook.
2. Super Admin edits Analytics details, R2 artwork and offered price, then publishes Analytics.
3. A shop user with existing Analytics access opens Moons from the lobby and then Analytics.
4. Verify the original Analytics entry still works and compares with the copy.

No .env values were changed, no live migrations were run and Analytics was not automatically published. Offered prices still create no charges; subscribing/cancelling/billing are not enabled by this step.

## Checks

- `npm run test:moons`: copy identity, directory membership/visibility/permission checks, catalog launch readiness, file/storage tests, and shop/Super Admin navigation.
- `node frontend/tests/analytics-moon.cjs`: full lobby-to-Moon navigation, all 11 tabs, original URL, mobile/dark theme, existing permission denial, and no browser runtime errors, using mocked APIs.
- `node frontend/tests/moons-catalog.cjs`: existing Super Admin catalog checks with updated launch-ready metadata.
- Production React build, changed-file lint and root regression suite.
- Screenshots: `reports/analytics-moon/desktop.png` and `reports/analytics-moon/mobile-dark.png`.

Still required in staging: verify the real catalog publish -> shop directory -> Analytics flow, including real R2 artwork and the existing Analytics APIs. PostgreSQL/R2 integration is not proven by browser API mocks. Subscription/billing enforcement remains future scope.
