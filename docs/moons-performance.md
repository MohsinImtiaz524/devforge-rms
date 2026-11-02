# Moons page performance

## Changes

- The shop page uses one lightweight `/api/moons/directory` bootstrap instead of serial `/api/auth/me` then directory requests. This avoids the full profile's unrelated statistics, subscription summary and duplicate permission loading.
- Bootstrap fetches current identity/shop membership in one join, checks blocked accounts, stale shop membership and required password changes, resolves current permissions and returns only the small profile needed by the Moons page. It does not change `/api/auth/me` for other modules.
- Published global catalog decoration has a single-entry, 15-second in-process cache with request coalescing. Users, shops, permissions, `can_open`, subscription records and authenticated HTTP responses are never shared-cached.
- Every request still reads current catalog rows. Status, version or metadata changes replace the cache key, so another server's publish/unpublish/edit is recognized on the next request without waiting for TTL. Local writes invalidate after transaction commit. File-service enablement is also part of the cache key. Failed refreshes are not retained.
- Latest offered prices are loaded with a grouped maximum-ID subquery instead of fetching the entire price history. Price/artwork reads run concurrently, and directory cards load only icon/cover metadata rather than unused screenshot metadata. Admin history remains available.
- The hero is imported as a Vite asset, yielding a content-hashed `/app/assets/...png` URL. Express now recognizes Vite's hyphenated hashes and applies immutable caching to generated assets, including images. HTML keeps normal revalidation behavior. Replacing the image changes the built URL.
- Hero loading has high fetch priority; catalog artwork decodes asynchronously and uses native lazy loading. Protected R2 file responses remain private/no-store; this change does not create public CDN access to private files.
- The directory includes `Server-Timing: moons;dur=...` for request diagnosis.

## Evidence and limits

The old public catalog path performed five queries: catalog, all prices and three artwork slots. Isolated SQLite instrumentation of the new path measured four queries cold and one current catalog read warm. That count excludes account/permission/session checks, which intentionally remain live. Twelve concurrent cold readers shared one pair of artwork reads.

Browser checks assert zero calls to the full profile endpoint and exactly one directory request on initial Moons load. Desktop/mobile, theme, dialog, retry, internal navigation and Analytics-copy behavior remain covered. A real Express HTTP test confirms `public, max-age=31536000, immutable` on the built hero and no immutable cache on HTML.

Actual production latency was not measured. These are query/request reductions, not a guaranteed page-load time. A cold visitor still downloads the hero; warm visitors can reuse it. Existing R2/CSP/auth policies are preserved. No new dependency, Redis, environment variable, migration or production data modification is required.

## Verification and rollout

Run `npm run test:moons`, the root regression suite, frontend build and changed-file lint. The performance tests use an isolated in-memory SQLite database; the asset test requires a built frontend. PostgreSQL testing remains opt-in against staging.

Deploy/restart the backend with the matching frontend build. New browser sessions receive the bootstrap response; no persistent client cache or private offline cache needs clearing. Rolling back requires matching backend/frontend versions. Do not roll back only the bootstrap API while keeping a frontend that expects its profile field.
