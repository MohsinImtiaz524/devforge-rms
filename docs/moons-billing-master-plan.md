# Moons and whole-platform billing: master implementation plan

Date: 1 November 2026. Planning only: no application code, database migration, subscriptions, charges or external infrastructure changes are authorized by this document. This is the current product/architecture plan and supersedes conflicting assumptions in earlier Moons drafts.

## 1. Agreed product rules

- Continue the existing modular monolith: Express, services, Knex, PostgreSQL, React and shared session authentication. No OOP Moon hierarchy, separate authentication or microservices.
- Moons are implemented features registered in code. Database configuration changes presentation, pricing and availability; it cannot create executable functionality.
- Initial Moons: Staff Management and Analytics. Plan Website Builder and Publisher as the next capability; whether sold together or separately remains a product decision.
- Each Moon has a name, icon, summary, details, features and optional screenshots. Artwork lives in Cloudflare R2 through the existing Files module.
- Each Moon can be free or monthly paid. Subscriptions belong to a whole shop; use begins immediately.
- Paid subscription days contribute to the next month's invoice. Cancellation stops renewal, with access continuing to the end of the committed period.
- Each shop manages its own users' per-Moon permissions through existing roles. Subscription entitlement does not grant user permissions automatically. Permissions and business records survive cancellation.
- Whole-platform billing includes base RMS charges where applicable and all Moon charges. Unpaid invoices do not automatically suspend RMS, login or subscribed Moons. Show recent paid, partially paid and unpaid invoices and outstanding dues.
- An explicit Moon cancellation still takes effect at period end. Deliberate administrative blocking is separate from nonpayment and must remain explicit and audited.

## 2. Current system and migration implications

Staff, attendance, leave, payroll, staff documents/activity and Analytics already exist. Keep their data and public service boundaries; introduce entitlement checks around the relevant capabilities instead of duplicating their tables.

Current PlatformPaymentService records payments and base-platform subscription dates. It is not an invoice ledger. Preserve financial history, introduce invoice obligations separately, and allocate received payments without counting income twice.

AuthService.login currently requires an active dated/lifetime subscription for shop users. The new policy requires replacing this billing-expiry gate. Keep authentication, user/shop administrative blocks and permission checks intact. Audit other subscription-expiry UI, middleware and workers before enabling the policy. Session responses must distinguish invoice debt, platform service agreement and Moon entitlement.

No Website Builder/Publisher backend module was identified in the inspected module paths. Treat it as new functionality rather than a rename of the current UI. Runtime DNS, hosting and pricing decisions are outside this planning task.

## 3. Module ownership and dependency rules

| Module | Responsibility | Dependencies |
| --- | --- | --- |
| Core accounts | Login, password recovery, users, roles, account status | Existing auth/authorization |
| Moons | Code registry, catalog, eligibility, shop subscriptions, entitlement, cancellation | Public authorization/files/billing contracts |
| Billing | Base service agreements, service charges, monthly invoices, payment allocations, credits, balances | Public platform-payment contract |
| Staff family | Employment, organization, attendance, leave, payroll, staff documents/activity | Existing staff services; Moons gate at feature boundary |
| Analytics | Read-only business analysis, filters, charts, approved exports | Public domain read models, Moons |
| Websites | Sites, pages, sections, drafts, revisions, settings and previews | Files and Moons |
| Publishing | Validated releases, jobs, publication/rollback state, public-serving rules | Website snapshots, Files, Moons |
| Domains | Platform subdomains and later custom-domain verification | Publishing; provider adapter when selected |
| Files | Upload sessions, verification, R2 objects, attachments, cleanup | Existing Files infrastructure |
| Notifications | In-app billing/subscription/publication notices | Domain events/outbox |

New capabilities use src/modules/<name> with routes, schema, service and repository as useful; controllers only when they add value. React uses frontend/src/modules/<name>. Existing routes/services remain during additive migration. Cross-module writes go through public service methods with explicit transaction ownership, never another module's repository.

A static registry defines stable Moon keys, implemented feature keys, permission groups, entry routes, dependencies and supported shop types. Catalog publication validates against the registry. Platform owners cannot invent routes or permission keys in a form. Dependencies form an acyclic graph and are shown before subscribing.

## 4. Catalog and administration

Catalog fields: immutable key, unique slug, name, short summary, full sanitized details, category, draft/published/archived state, supported shop types, display order, support link, release/version notes, audit actors and timestamps. Resolve icon/cover/screenshots via Files attachments. Use a fallback code-owned icon.

Shop catalog cards show price/free status, subscribed state and an Open/View action. Detail pages explain inclusions, permissions, dependencies, charge calculation and cancellation date. Subscribed views show period end and scheduled cancellation separately from invoice debt.

Super Admin manages metadata, artwork, offered price versions and availability. Archiving prevents new subscriptions without silently revoking existing service. Pricing history and billed descriptions remain immutable.

## 5. Database plan

Use the field-level catalog/subscription/invoice outline in moons-database-implementation-plan.md together with the additions and corrections below. All tenant tables require shop_id from the session; global catalog/price tables are platform-owned. Composite foreign keys or validated equivalent constraints prevent cross-shop financial links.

| Area | Tables | Key invariants |
| --- | --- | --- |
| Catalog | moon_catalog, moon_shop_types, moon_features, moon_permission_keys, moon_prices | Unique registry key/slug; immutable price versions; valid published implementation |
| Subscription | shop_moon_subscriptions, moon_subscription_periods, moon_subscription_events, moon_requests | One current row per shop/Moon; immutable committed periods; idempotent requests; audited state changes |
| Billing profile | shop_billing_accounts, platform_service_agreements, platform_service_periods | Currency/timezone, legal invoice snapshot source, base price effective dates; honor prepaid/lifetime service |
| Invoices | billing_invoices, billing_invoice_lines | Unique regular invoice per shop/service month/currency; deterministic charge keys; immutable issued totals/lines |
| Settlement | billing_payment_allocations, billing_adjustments, billing_adjustment_allocations | Received cash separated from charges; credits allocated explicitly; no over-allocation |
| Delivery/recovery | domain_outbox, job_runs | Durable notifications/publication cleanup; deduplicated retryable jobs; no lost event on transaction commit |
| Websites | websites, website_pages, website_revisions, website_revision_pages | One initial website per shop (proposed); immutable revision/page snapshots and unique page slug per revision |
| Publishing | website_releases, website_publish_jobs, website_events | Release pins revision and assets; only successful release becomes live; versioned compare-and-swap activation |
| Domains | website_domains | Globally unique normalized hostname; verification and TLS states; tenant ownership; explicit primary domain |
| Existing storage | files, file_attachments, file_upload_sessions, file_jobs | Reuse R2 verification and cleanup; release assets pinned against deletion |

Billing account fields include invoice name/address/contact and tax identifiers as required; invoices snapshot them at issue. Base service agreements include plan/rate/currency, effective interval, prepaid coverage or lifetime designation and explicit administrative service state. Unpaid invoices never mutate that state automatically.

Website fields: shop_id, key/name, template_key, draft_revision_id, live_release_id, locale, business timezone and version. Pages contain title, slug, approved section JSON and SEO fields. Revisions include schema_version, author, change note and created_at. Releases include revision_id, checksum, status, publication date, artifact references and revoked_at. Domain records track verified ownership independently of DNS/TLS progress.

Use UTC instants (PostgreSQL timestamptz), explicit local service dates and integer minor-unit money. Validate bigint serialization/arithmetic. Financial/history deletion is restricted; user deletion must not cascade away audit evidence. Add shop/date/state indexes and bounded pagination. Avoid a separately editable running balance or a redundant daily charge table: period/rate snapshots should reproduce charges. Add daily usage rows only if future pricing truly depends on metered activity.

## 6. Billing calculation and lifecycle

Proposed defaults needing confirmation: calendar-month periods, Asia/Karachi default billing timezone configurable per account, first-day-of-next-month issuance, activation day counted and exclusive period end.

Proration = monthly rate in minor units x subscribed local calendar days / actual days in the service month. Round half up at the agreed subscription/month boundary, not on each daily rate. Preserve exact segments when rates change and allocate rounded line totals deterministically. Activation near midnight, same-day resume, leap years and short months need explicit tests.

Subscribe validates shop eligibility, price, permissions and dependency rules; transactionally records subscription, period and event. Cancellation schedules period-end termination and never adds another recurring commitment. Resume before period end clears cancellation without double charging. Reactivation after expiry creates a new service interval, preserving old history. Free periods produce no payable charge.

Active noncancelled subscriptions must remain entitled across a calendar rollover even when a worker is late: derive continuity from the recurring agreement, reconcile missing period snapshots under lock, and apply the committed price policy. Cancelled subscriptions deny access exactly at effective_end regardless of worker timing. No access extension caused by stale sessions/caches.

At month close, the invoice worker locks/deduplicates its scope, gathers base and Moon service periods, excludes prepaid/lifetime-covered base service, snapshots calculations, issues one regular invoice and queues a notice. Failed/repeated/multi-instance workers cannot duplicate charge keys; catch-up processes missed months. Currency must match per invoice. Future taxes, discounts and credits require explicit policy before they are enabled.

A PKR 3,000 illustrative monthly Moon activated on 16 November through 30 November costs 15/30 x 3,000 = PKR 1,500 on the December invoice. This is an example, not a configured price.

Invoice state is draft/issued/void; settlement state is derived unpaid/partially_paid/paid, with overdue shown separately. Total outstanding = issued obligations plus debit adjustments minus allocated payments/credits. A previous unpaid invoice remains due; do not add it as another charge on the next invoice. Show aggregate dues separately. Manual payment receipt records actor, amount, date, method, reference and optional verified evidence; allocations lock payment/invoice and prevent overspending. Refunds/credits are explicit adjustments with allocations/reversals. Allocated legacy payments cannot be edited/deleted without a controlled reversal.

No unpaid/overdue status blocks platform login or Moon renewal. Subscription cancellation is an independent entitlement event. Administrative holds, if retained, require explicit policy, actor/reason and audit; never infer them from debt.

## 7. Permissions and enforcement

Reuse permissions, roles, role_permissions and user_roles. Group permissions by Moon via registry/catalog mappings; retain independent core account administration. Shops manage only their own roles and authorized grants. A role editor cannot assign platform privileges or elevate beyond its delegation authority.

Suggested shop administration keys: moons.view, moons.subscribe, moons.cancel, billing.view. Payment receipt/allocation and credit management are platform-controlled initially; only add shop payment submission as a reviewed workflow, never let a shop mark its own invoice paid directly. Add separate platform_moons.* and platform_billing.* permissions.

Feature access = authenticated/nonblocked account + eligible shop + active feature entitlement + action permission. Free activation still uses the same entitlement contract. Show actionable subscription-required vs permission-denied messages without revealing private data.

Inventory server routes, services, React/legacy entry points, files, PDFs/exports, sockets, background jobs and embedded widgets. Enforce on the backend and invalidate/recheck long-lived sockets. Private files check current resource entitlement; public website assets are served only through active published release references. Avoid letting catalog images open access to other platform files.

## 8. Staff Management Moon

Preserve existing employee IDs, employment history, attendance events, payroll runs and linked user accounts. Proposed package includes Staff Directory, organization, attendance, leave, payroll and staff documents/activity; confirm before pricing.

Core account creation, password resets, roles and login-session management remain usable outside a paid Staff Moon. Extract/retain routes for basic account administration when splitting the current Staff workspace navigation. POS waiter/rider assignment supporting reads stay operational.

Migration stages: map ownership, backfill declared entitlements, update navigation, gate domain operations, test unauthorized/direct-link paths, then enable enforcement. Expiry hides/disables domain workflows without deleting records or permissions. Do not silently finalize/pay payroll on expiry. Decide treatment of clock collection and already-running payroll before rollout so employees are not left in an undefined timekeeping state.

## 9. Analytics Moon

Wrap current Analytics workspace and services; preserve existing charts, filters, shop scoping and exports. Start with current Overview, Sales, Inventory, Finance, Staff, Channel and report capabilities, subject to final package boundaries. Domain data remains owned by Sales/Inventory/Staff, exposed through scoped read models.

Basic POS totals, register closing data and operational dashboard summaries stay in core. The shared /api/analytics/dashboard-data endpoint must not be blanket-blocked if core dashboard users rely on it. Split public service read models/operations where necessary while preserving legacy contracts.

Define staff analytics behavior without the Staff Moon: sales-by-cashier core identities may remain; attendance/payroll-derived analytics requires Staff entitlement or must omit protected fields. Decide whether Reports, AI Analyst and Custom Reports are included or future separate Moons. Gate AI prompts and exports as well as screen navigation. Add date-range/row limits, server pagination, query timings and indexes for heavy reports; no unbounded database loads.

## 10. Website Builder and Publisher

Recommended first release: a section-based business website with branding, hero, about, public menu/catalog, gallery, hours, location/contact and footer. Reuse shop/product read services through an explicit public projection; never expose internal stock cost, ledger, private staff or sales data. Manual product/menu snapshots for MVP avoid surprise live-data disclosure. Online ordering, payments, booking and arbitrary custom scripts are later scope, not implicit features.

Builder includes templates, approved section schemas, reorder/add/remove sections, page slugs, SEO title/description, image alt text, mobile preview, draft save, revision history and draft preview restricted to authorized users. Sanitized content and allowed link schemes are mandatory. No user-supplied executable server code or unrestricted HTML in initial templates.

Publishing pins an immutable revision, validates links/assets, stages a release, then atomically updates live_release_id only after success. Failed publish keeps the previous live release. Concurrent jobs use expected revision/version and recheck entitlement at activation. Rollback activates a prior valid asset-pinned release with an audit event. Jobs/outbox handle retries and garbage collection safely.

Start with a platform-managed subdomain after hosting/DNS decisions. Keep public serving isolated from authenticated management APIs, with a strict public data projection and draft preview on a separate access-controlled route. Add custom-domain ownership verification, conflict protection, TLS status and disconnect/reconnect lifecycle later. Do not promise provider automation until the hosting provider is selected.

R2 stores images and, if the chosen publication approach requires them, generated artifacts through purpose-specific policies. Public pages/cache keys must include release version. On explicit unsubscribe expiry, block builder/publisher APIs and decide public site behavior. Recommended policy: take the public site offline at the same effective end, revoke active release access, invalidate CDN/cache and retain drafts for reactivation. This public-site behavior needs approval; nonpayment alone must never take it offline. Old release asset URLs must not bypass the chosen shutdown policy. DNS may remain pointed but serving must enforce publication state.

Proposed website permissions: websites.view/create/update/preview/publish/unpublish/manage_domains. Publishing checks both website ownership and Moon/dependency entitlement. Keep quotas (sites/pages/images/builds/domains) code-configured and visible; do not silently introduce usage billing.

## 11. R2 storage plan

Reuse existing Files service and private R2 configuration. Add moon.icon, moon.cover, moon.screenshot, website.image and published-artifact purposes/resources as needed. Metadata/verification stays in database; no base64 blobs or persisted expiring signed URLs. Platform catalog artwork is editable only by platform staff and readable to shop users only for published catalog items. Website draft assets are tenant-private; published projection authorizes only release-pinned assets.

Proposed limits: icons 2 MB, covers/screenshots/website images 5 MB, still PNG/JPEG/WebP, one icon/cover and six catalog screenshots. Use existing content verification, byte/dimension limits and cleanup rather than trusting a file extension. Save attachments atomically, retain old images on failed edits and pin all release references. Expand Files schema/storage policy for non-image publication artifacts only if selected; do not force HTML/JSON artifacts through an image-only verifier.

## 12. UI and API deliverables

Shop: Moons catalog, detail/subscribe confirmation, My Moons with cancel/resume dates, per-Moon role permissions, Billing summary/history/detail and downloadable invoice, Staff/Analytics entry points, Website editor/preview/publish history/domain settings. Billing lists service period, issue/due dates, lines, paid amount, due amount and payment timeline, with pagination/filtering. Unpaid notices are informative, not access blockers.

Platform: catalog/pricing/artwork, subscription and cancellation history, invoice generation/reconciliation status, payments/allocations/credits, outstanding-dues reports and audited account administration. Avoid mixing received income with invoiced revenue.

API groups: /api/moons and /api/moons/:key/subscribe|cancel|resume; /api/billing/summary|invoices; /api/platform/moons and /api/platform/billing; /api/websites with draft/revision/preview routes; /api/websites/:id/publish|unpublish|releases|domains. Use POST for state changes, Zod validation, action middleware and consistent error codes. Include idempotency keys and expected versions where financial/publication mutations need them. Public site routes expose only validated release data.

All views support responsive layouts, dark mode, keyboard navigation, stable loading/error states and existing session/PWA behavior. Keep legacy/direct links working until parity and entitlement checks are verified.

## 13. Phased delivery and acceptance gates

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 0 | Approved scope, billing calendar/day rules, prices, Staff/Analytics boundaries, website packaging/hosting policy | No ambiguous money or expiry behavior |
| 1 | Moons registry, schema, catalog platform UI and R2 artwork | Draft/publish validation, upload auth, migration reruns and tenant tests pass |
| 2 | Shop subscriptions, role grouping, entitlement service and outbox | Free/paid lifecycle, dependencies, race/retry and exact expiry tests pass; enforcement still staged |
| 3 | Base service agreements, invoices, settlement UI and workers; remove payment-expiry login block | Monthly catch-up/idempotency, unpaid platform login, prepaid/lifetime and partial-payment tests pass |
| 4 | Existing-shop entitlement backfill, Staff/Analytics navigation and gates | No data loss; operational RMS and core accounts work without either Moon; legacy/API/file paths checked |
| 5 | Website section editor, revisions, private previews and asset management | Responsive editor, tenant isolation and sanitized render tests pass |
| 6 | Public release serving, publish/unpublish/rollback and platform subdomain | Failed publish preserves live site; entitlement expiry/cache behavior and rollback tested |
| 7 | Custom domains, optional AI/advanced reports, ordering/other future Moons | Separate scope and operational/provider requirements approved |

No existing shop receives retroactive Moon invoices. Choose a migration/free-access window, publish communication and start paid service only from an agreed cutover. Use idempotent bulk backfills separate from requests. Feature flags stage catalog/subscriptions/billing/gates independently; rolling back UI/gates must not delete obligations/history or duplicate charges. Reconcile legacy payments before switching the billing dashboard to the new ledger.

## 14. Verification and operations

Verify PostgreSQL production migrations and supported SQLite development, foreign-key tenant isolation, permission escalation, direct/legacy/API access, exact boundary times, missed workers, rate snapshots, leap/month/day arithmetic, concurrent requests, overpayments/credits, debt without access loss, and migration of lifetime/prepaid shops. Test Staff payroll/attendance preservation and Analytics core-dashboard exceptions.

Verify R2 authorization/cleanup, private draft access, unsafe content, publish retries/concurrency, rollback, revoked release/cache behavior, domain ownership and cross-shop hostname collisions. Run focused service/integration tests, production builds and mobile/dark/accessibility UI checks. Provider-specific DNS/TLS tests occur when that infrastructure is selected.

Track failed invoice/publication jobs, last successful reconciliation, unallocated payments, draft/stuck invoices, stale entitlement caches, R2 failures and audit events. Use durable retries, bounded batches, worker leases, deduplication and alerts rather than an in-memory timer as the sole billing mechanism. Define backup/restore and test restoring invoices plus release/asset references before production launch.

## 15. Remaining product decisions

1. Actual base-platform and Moon prices/currency; tax/discount policy and invoice identity/numbering requirements.
2. Confirm calendar-month service, activation-day counting, billing timezone, invoice issue date and payment terms. Terms label debt only; they never suspend access automatically.
3. Free-Moon activation/cancellation behavior; notice/consent for price changes and free-to-paid transitions; refunds and reactivation day counting.
4. Existing-shop migration/grandfathering window and existing prepaid/lifetime base-service treatment.
5. Staff inclusions and unfinished attendance/payroll handling at explicit cancellation; Analytics Reports/AI ownership and Staff-data dependencies.
6. Website Builder/Publisher sold together or separately, initial site/page quotas, templates, custom domains/hosting provider, public-site state after cancellation.
7. Who may subscribe/cancel, platform support preview policy, manual blocking policy, data retention/export after explicit expiry and notifications recipients.

Confirmed decisions are not reopened: shop-wide subscriptions, daily usage billed next month, R2 images, per-shop user permissions, modular monolith, and no automatic nonpayment suspension anywhere on the platform.
