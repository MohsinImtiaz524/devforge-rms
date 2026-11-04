# Website Moon V1 implementation plan

Scope: Website Moon only. Preserve POS, ordering, printing, billing, existing Moons, authentication behavior and existing file purposes. No production deployment, environment changes or production migration execution.

## Evidence from current architecture

- `src/modules/moons/moons.registry.js` contains an unimplemented `website` placeholder.
- Express serves React under `/app`; sessions, CSRF and permission resolution already exist.
- The Moon directory validates live shop membership; subscription enforcement is not enabled. Do not invent a second subscription system or create paid commitments.
- Files service uses Cloudflare R2 with verified raster decoding and re-encoding. Reuse the decoder and private storage adapter, with Website-owned immutable asset metadata rather than repurposing shop logos or platform artwork.
- Schema initialization is startup-owned with transaction/advisory-lock conventions; development supports SQLite and production PostgreSQL.

## Ownership and interfaces

Website Moon owns `src/modules/moons/website/`, React `frontend/src/modules/moons/website/`, its template registry, website configurations, publication snapshots, hostname assignments and publishing audit records. Public administrative API: `/api/moons/website`. Frontend entry: `/app/moons/website`. Dedicated permissions: `website.view`, `website.edit`, `website.publish`. All business scope comes from an authenticated user's database-verified shop membership; never from request tenant IDs. Existing permission resolver remains authoritative.

Persist one website per shop, a unique lowercase subdomain, structured draft JSON, optimistic draft revision, immutable publication snapshots and audit events. All tenant records include shop_id. Publish/unpublish and audit changes commit atomically; concurrent requests use revision checks and database constraints. Failed transactions preserve the previous publication. Repeating an already committed publication must not create duplicate audit/version state.

## Delivery sequence

1. Add strict configuration schemas, approved template registry, hostname/domain validation and escaped server rendering. No arbitrary markup, styling or scripts.
2. Add additive migrations and tenant-scoped service with live membership and permissions, separate drafts/publications, unique subdomains, publication audit and concurrency protection.
3. Integrate verified, tenant-owned logo/hero uploads with existing R2 storage interfaces. Website-owned metadata deliberately avoids the generic Files worker deletion lifecycle; no existing Files resource is duplicated or rewritten. Draft and published assets must remain independently pinned. Public asset delivery must require that the requested asset belongs to the hostname's active publication.
4. Add authenticated routes and private no-store preview; add an isolated public hostname handler before sessions. Unknown hosts and all administration paths on the website domain fail closed. Website domain is environment configured and must be separate from the administration origin. Apply rate limits, restrictive CSP, HTTPS policy and no shared cache until tenant caching is proven.
5. Add Template -> Basic Edit -> Publish UI, responsive preview and initial dashboard using existing Orbit styling. Register only Website Moon integration points; preserve unrelated logic.
6. Run all 16 brief security scenarios, backend syntax checks, relevant regressions, full tests, frontend lint/build, diff checks and actual visual verification. PostgreSQL checks must use an explicitly isolated test database, never production.

## Deployment gates

Keep Website Moon behind its own disabled-by-default feature flag. Hosting requires configured public website domain, wildcard DNS/TLS and cookie isolation. No live publication claim until the real public origin is verified. Document configuration, migrations, rollback, security test results and any unverified deployment requirements. No custom domains, ordering, checkout, drag-and-drop, executable customer code or customer accounts in V1.
