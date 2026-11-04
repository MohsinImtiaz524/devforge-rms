# Website Moon V1

Status: implementation and local verification in progress; public rollout disabled by default. No production data, environment settings, DNS or deployment were changed.

## Scope and integration

Website Moon owns `src/modules/moons/website/`, `frontend/src/modules/moons/website/`, and four new additive tables: `moon_websites`, `moon_website_versions`, `moon_website_assets`, `moon_website_events`. The existing Website Moon registry placeholder is reused. Shared edits only register permissions, lazy frontend routing, API/public middleware, startup initialization and tests. POS, ordering, printing, billing, session behavior, existing file purposes and other Moons are unchanged.

The editor has exactly Template -> Basic Edit -> Publish, three approved templates, branding/colors/hero/contact/social fields, draft saving, private saved preview, publishing/republishing and unpublishing. Subdomains are immutable after first save, preventing draft changes from moving a live site. Custom domains, executable user markup/styles/scripts, ordering, payments and customer accounts are excluded.

Authorization derives the shop from the session and validates it against live users/shops. Every service operation resolves current permissions. Website permissions are `website.view`, `website.edit`, `website.publish`; existing standard-role seeding controls their assignment. Existing subscriptions are not activated or charged: the platform's Moon subscription enforcement is currently unavailable. Do not imply that permission access is a paid subscription.

Images reuse the existing verified raster decoder/re-encoder and existing private R2 adapter. Website-owned asset metadata keeps immutable publication images independent of the generic Files worker's unattached-file deletion lifecycle. Existing file storage tables/resources are not changed. Uploads have generated UUID keys, 5 MB limits, 100 assets per shop, decoder pixel/frame limits and integrity hashes. V1 retains assets; no deletion endpoint exists, so published references cannot be removed by editing drafts. Interrupted uploads between R2 success and database commit can leave an orphan object; reconciliation is an operations follow-up. Failed transaction cleanup is attempted and logged. Quota exhaustion requires an operator-reviewed retention plan; never delete a published asset manually.

## Configuration and deployment gate

- `MOONS_ENABLED=true` and `WEBSITE_MOON_ENABLED=true` opt into startup schema initialization and Website Moon routes. Do not enable publicly until staging checks below pass.
- `WEBSITE_DOMAIN` is the dedicated public website suffix, e.g. `sites.example.net`, without scheme/path/port.
- `WEBSITE_ADMIN_ORIGIN` is the exact HTTPS administration origin outside that suffix, e.g. `https://app.example.com`. Prefer a separate registrable domain. Existing session cookies remain host-only.
- Reuse existing R2 storage configuration from `src/modules/files/files.config.js`; keep the bucket private. Credentials never enter website config, assets or bundles. Generic Files worker enablement is not required for Website Moon uploads.
- Route the public suffix and its wildcard DNS to the existing application, terminate valid wildcard TLS, preserve the actual Host header and use the existing trusted-proxy configuration appropriately. Do not trust X-Forwarded-Host as website identity.
- Public hostname handling runs before sessions, CSRF, API and static middleware. It consumes the entire configured public suffix, rejecting unknown websites and administration paths. Production requires HTTPS. Public HTML and images send no-store, restrictive CSP and defensive headers; no cross-tenant cache exists. If adding CDN caching later, retain host separation and purge/unpublish semantics; do not override no-store.
- Startup migration uses an advisory lock in PostgreSQL. No request creates schema. Review migrations before deploying and ensure schema-creation privileges are available. New tables are additive and rollback is disabling the feature flag/restarting, preserving history and assets.
- Publish Website Moon's existing catalog entry through the existing platform Moon manager when staging is ready. Do not seed a price, charge, subscription or published catalog entry automatically.

## Local verification evidence

Commands actually run:

- `node --test tests/website-moon.test.js tests/website-moon-service.test.js tests/website-moon-postgres.test.js`: 18 passed, 1 skipped when run without an explicit test URL. The separately authorized PostgreSQL run against the development testing database is recorded in `reports/website-moon-postgres-tests.log`. Output: `reports/website-moon-security-tests.log`.
- Related Moon/image regressions were exercised. After correcting the disabled-feature registry integration, the affected Moon plus Website tests passed 30/30.
- Initial full backend regression run: 185 passed, 3 skipped, zero failures. The full run including initial Website tests passed 201 with 4 skipped and zero failures; two additional Website failure/header tests subsequently passed in the focused suite. Results are recorded in `reports/website-moon-full-tests.log`.
- Frontend production build passed. Output: `reports/website-moon-build.log`.
- `node frontend/tests/website-moon.cjs`: local real API/service/SQLite-backed browser fixture passed selection, edits, save, private iframe preview, publish, draft/live separation, republish, unpublish, mobile overflow, dark mode, view-only controls, backend permission denial, no-access rendering and expired-session redirect checks. The fixture creates no production sessions or records. Screenshots: `reports/website-moon/`.
- Backend syntax checks passed. Final changed-file lint/diff checks are recorded during sign-off.
- Full frontend lint found two pre-existing `react-hooks/set-state-in-effect` errors in `frontend/src/modules/dashboard/components/ShiftDashboard.jsx`, lines 21 and 31. That unrelated component was not changed.

## Required security scenario coverage

| Brief requirement | Local evidence | Remaining gate |
| --- | --- | --- |
| 1. Tenant A cannot read B config | Service membership + independent tenant reads | Development PostgreSQL passed; deployed check pending |
| 2. Tenant A cannot change/publish B | No tenant argument; strict schema rejects shop_id; membership mismatch denied | PostgreSQL staging |
| 3. Draft previews private | Unauthenticated HTTP 401, other tenant missing draft, private no-store | Real session/browser staging |
| 4. Publish permission | Viewer publish and unpublish denied | Representative real roles staging |
| 5. Text cannot execute | Hostile text escaped; script-src none; no HTML execution path | Deployed CSP check |
| 6. Invalid template IDs | Strict registry schema rejection | Covered locally |
| 7. Malicious images | SVG/HTML fake raster rejected; existing decoder regression suite | Live private R2 staging |
| 8. Image ownership | Wrong-shop draft refs/private reads denied; public only active snapshot refs | PostgreSQL/R2 staging |
| 9. Unique subdomains | DB uniqueness rejects duplicate across shops | PostgreSQL staging |
| 10. Host manipulation | Strict hostname tests; native HTTP Host boundary and ignored forwarded host | Proxy/wildcard staging |
| 11. Failed publish preserves live | Injected activation failure and audit failure rollback | PostgreSQL staging |
| 12. Draft edits preserve live | Service and browser draft/live checks | Covered locally |
| 13. No private public fields | Strict publication projection and controlled HTML rendering; public origin cannot reach APIs | Deployed response review |
| 14. Concurrent publish safe | Concurrent same-revision publish one snapshot/event in SQLite | Independent PostgreSQL connections passed |
| 15. Audit actor/site/action | Actor and event assertions; audit failure blocks activation | PostgreSQL staging |
| 16. Cache tenant isolation | No-store HTTP assertions and alternating hostname data tests | CDN/proxy must respect no-store |

## Before enabling for customers

Run `WEBSITE_TEST_DATABASE_URL` against an explicitly disposable PostgreSQL instance using `node --test tests/website-moon-postgres.test.js`. The initial test uses a unique schema inside a rolled-back transaction. Its independent-connection test creates a uniquely named fixture schema and drops only that schema afterward. Tests never fall back to DATABASE_URL automatically. The user identified the development database as testing and authorized its use; both the transactional and independent-connection PostgreSQL checks passed there (2/2). The latter verified concurrent publish idempotency, one snapshot/audit event, stale-save conflict, duplicate-host rejection and draft/live isolation. Results are recorded in the PostgreSQL report. R2 was identified as live and has not been used for verification writes. Real R2 failures/recovery and deployed host/TLS/session isolation remain release gates. DNS, wildcard certificate and actual external website publication are not proven. These are release gates, not completed security claims.

Manually exercise real Admin/Manager/view-only/no-access roles, session expiry, desktop/tablet/mobile, keyboard and screen reader controls, deep links/refresh/back and installed-PWA behavior. The public store itself deliberately installs no service worker. Review operator retention/reconciliation, backup/recovery and real HTTPS headers before rollout.

## Test environment clarification

The user confirmed on 4 November 2026 that the development database is for testing but R2 is live. PostgreSQL fixture schemas may therefore run on that development database; do not treat its R2 bucket as staging. The existing normal application tables are not migrated or seeded by fixture tests. No live R2 object is created, changed, or deleted. Use a separate staging bucket for external image verification or obtain explicit authorization for a strictly isolated test-object prefix before such writes. No deployment is authorized by this clarification.

## Optional live R2 verification (approval required)

`scripts/verify-website-r2.js` is prepared but has not run. It refuses to write unless `WEBSITE_R2_VERIFICATION_APPROVED=true` is explicitly supplied. After approval it creates exactly one generated `website-moon-verification/<uuid>/verified-image` object, reads and verifies the PNG, and deletes that same object in finally. It does not access the database or normal application asset paths. Network interruption can leave this one object requiring cleanup; the generated path is logged for the operator. This check proves authenticated storage I/O, not all bucket/CDN privacy or deployed website TLS requirements.

## Local public menu mode (user-requested scope update)

On 4 November 2026 the user requested a customer-facing localhost path and confirmed **menu only for now; ordering later**. There is no checkout, cart, payment or order-submission endpoint.

For a development process only, set `MOONS_ENABLED=true`, `WEBSITE_MOON_ENABLED=true`, `WEBSITE_LOCAL_PATHS=true`, and leave NODE_ENV as development. In this mode the editor is `/app/moons/website`; a published site with slug `square` is `/app/moon/square/website`, e.g. `http://localhost:4000/app/moon/square/website`. Domain/admin-origin configuration is not required in this explicit local mode. No production environment file has been changed.

The local storefront handler runs before sessions. It accepts only loopback socket connections with a localhost or 127.0.0.1 Host header, only GET/HEAD, and only registered published slugs. It never uses path parameters as tenant IDs. Unpublished/unknown sites and incorrect hosts return 404. Asset routes remain restricted to the active publication's approved image references. The mode is hard-disabled in production; production still requires isolated hostname publishing and HTTPS.

In Basic Edit, **Import current menu** reads the authenticated shop's existing menu through ProductService and projects only category, name, description, and display price. Stock variants must be menu-visible. Costs, stock counts, ingredients, IDs, SKU, supplier data and other private fields never enter the website snapshot. Import is bounded to 100 entries and is an explicit draft change. Review/remove entries before publishing. Product-service behavior, POS menus and ordering logic are unchanged. Changes to the RMS menu do not update the public menu until the owner imports again and republishes.

The local workflow may be tested without new image uploads, keeping live R2 untouched. R2 verification and real production domain/TLS remain separate release gates.

## Local delivery verification

The localhost public-menu update passed 20 focused backend checks, scoped frontend lint, production build, and the full browser scenario including anonymous menu access, imported public-field filtering, disabled write methods, and unpublish removal. The final full regression result is in `reports/website-moon-full-tests.log`. `reports/website-moon/public-menu-mobile.png` is an actual rendered customer page from the isolated browser fixture, not production shop content. Website Moon and localhost-path flags were enabled only in the confirmed development `.env`; restart the development backend to load the new routes, additive Website Moon migration and permissions. Existing Moon catalog publication remains an explicit Super Owner action. A shop must save/publish its own site before its slug returns public content.

## Final localhost runtime check

Final full backend regression: 205 passed, 5 skipped, zero failed. Focused localhost/menu security checks: 20 passed. Frontend scoped lint, production build and expanded browser workflow passed. The development server on port 4000 was checked directly: `/app/moons/website` returned 200, unauthenticated `/api/moons/website` returned 401, and `/app/moon/unknown-test-slug/website` returned 404. A concurrently launched development stack exited on an occupied backend port; it was not used to claim runtime success, and the already-serving process was left intact. No shop website or catalog entry was published automatically. Live R2 verification remains unexecuted pending explicit approval.

## Existing owner role upgrade

Older system Admin / Restaurant Admin roles were created before Website Moon permission keys existed. A Website Moon-only one-time migration now assigns website.view/edit/publish to those standard owner roles only when they have no existing Website permission choice. It records processed role IDs in moon_website_owner_grants, so subsequent owner revocations stay revoked. Custom roles, roles assigned across a mismatched shop boundary, managers and all unrelated permissions are untouched. The migration runs in the existing Website Moon startup transaction/advisory lock and was applied to the confirmed development testing database for the Discover/Open fix.
