# Root administrator React workspace

The new React root workspace is an opt-in preview at /app/admin. Root sign-in continues to /admin/store-monitoring, and the React lobby preserves that legacy destination. The existing legacy command center remains the main root page. Shop accounts retain their existing destinations.

## Boundaries

- Root pages and navigation live in frontend/src/modules/platform-admin.
- RootSidebar is independent of shop navigation. The Moon marketplace stylesheet supplies shared theme tokens only.
- Root-specific Moon catalog and announcement managers support an embedded mode inside this shell. Their existing standalone React routes remain compatible.
- Existing Express APIs enforce authorization. Client checks prevent rendering protected data to non-root users but do not replace server checks.
- No legacy public HTML, JavaScript, routes, database schema or credentials are changed by this migration.

## Routes

| Route | Function |
| --- | --- |
| /app/admin/overview | Platform metrics and restaurant directory |
| /app/admin/stores | Restaurant directory, status and password reset |
| /app/admin/hierarchy | Restaurant setup, module/service access, staff hierarchy and partners |
| /app/admin/subscriptions | Platform payment creation, editing and removal |
| /app/admin/users | Users, restaurant-scoped roles and permissions |
| /app/admin/logs | Activity, sales, delivery, payment, wastage and register history; pending cash reviews |
| /app/admin/settings | Root account password and signed-in devices |
| /app/admin/notifications | Platform notification composition, maintenance and read state |
| /app/admin/categories | Shared expense category management and history |
| /app/admin/moons | Root-only Moon catalog management |
| /app/admin/announcements | Root-only announcement management |
| /app/admin/requests | Request diagnostics with optional five-second refresh |
| /app/admin/health | Integration health and diagnostic details |
| /app/admin/print-analytics | Shop print summaries and detail |
| /app/admin/ledger | Read-only platform payment history |

History navigation and refresh preserve these deep links. Existing /app/admin hash links remain readable at the base route.

## Verification

Use the installed frontend dependencies. Build from frontend with npx vite build, then run npx vite preview --host 127.0.0.1 --port 5200 --strictPort.

The following scripts use mocked APIs, not real restaurant accounts:

- node tests/platform-admin-browser.cjs (from frontend)
- node tests/root-management-browser.cjs (from frontend)

The browser checks use locally installed Microsoft Edge through Playwright. Set ADMIN_PREVIEW_URL or ADMIN_PREVIEW_ORIGIN to select another local preview address.

Run npm test from the repository root for existing regressions. Run frontend ESLint on changed React modules and git diff --check.

## Operational notes

Action dialogs require explicit confirmation. Mutation hooks lock concurrent submissions and display server errors. On a network or server error, refresh records before retrying because the original request may have reached the server. Existing APIs remain responsible for transaction and idempotency guarantees.

Print acknowledgement is not physical paper verification. Request and integration health are instance snapshots, not guarantees of external provider delivery.

No deployment or production data mutation is part of these checks. Validate a real staging root account, its configured roles and actual file uploads before rollout.
