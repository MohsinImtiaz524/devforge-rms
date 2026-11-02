# Moons database and implementation plan

Current master plan: [Moons and whole-platform billing](moons-billing-master-plan.md). Its confirmed rules supersede conflicting proposals below.

Prepared: 1 November 2026. Status: ready for foundation implementation; proposed billing defaults below require decisions before production charging. This document supersedes unresolved scope and first-period billing questions in the initial foundation draft. No tables, charges or access restrictions have been applied by this plan.

## Confirmed requirements

- A Moon is an optional product module with a name, icon, details and images.
- Staff Directory and Analytics are the first Moons.
- A Moon may be free or monthly paid.
- Subscriptions belong to a shop, not an individual user. Activation grants immediate shop entitlement.
- Charges for subscribed days are billed in arrears on the next month's invoice.
- Cancellation disables renewal; access lasts until the current period ends. All Moon-owned functionality is blocked after expiry, while records and assigned permissions remain saved.
- Each shop manages its own users' Moon permissions using existing roles. Entitlement and role permission are both required.
- Image binaries live in Cloudflare R2 through the existing Files module.

## Proposed catalog presentation

Each catalog card shows icon, name, short summary, free/monthly price, availability and subscription state. The detail page adds the full description, screenshots, included features, supported shop types, permission summary, billing explanation and support link. A subscribed card shows period end, scheduled cancellation and an Open action. Subscribe displays the daily proration rule and estimated next invoice charge before committing.

Platform administrators create drafts, upload artwork, publish/archive Moons and create price versions. Archiving removes new subscriptions; it must not silently terminate existing paid service. Feature code and route ownership remain developer-controlled; editing catalog text must never execute code or grant API access.

## Database tables

Global platform tables deliberately have no shop_id; all tenant-owned billing/subscription records require it.

| Table | Main fields | Constraints and purpose |
| --- | --- | --- |
| moon_catalog | id, key, slug, name, summary, description, description_format, category, status, sort_order, support_url, published_at, created_by, updated_by, version, timestamps | Unique immutable key and unique slug; status draft/published/archived. Description is plain text or sanitized Markdown. Artwork resolved through Files attachments. |
| moon_shop_types | moon_id, shop_type | Unique pair; controls eligibility, not authorization. |
| moon_features | id, moon_id, feature_key, name, description, sort_order | Unique feature_key; stable feature ownership maps to code-controlled gates. |
| moon_permission_keys | moon_id, permission_id | Unique pair; references the existing permissions catalog. Groups permissions in the UI without duplicating role assignments. Shared core permissions remain explicit. |
| moon_prices | id, moon_id, currency, monthly_amount_minor, effective_from, retired_at, created_by | Nonnegative integer minor units; zero means free. Immutable price version. No overlapping offered price windows per Moon/currency, enforced transactionally. |
| shop_billing_accounts | id, shop_id, currency, billing_timezone, invoice_day, payment_terms_days, version, timestamps | Unique shop_id for initial single-currency model. Invoice anchor is calendar month under the proposed default. Do not store an independently editable total payable. |
| shop_moon_subscriptions | id, shop_id, moon_id, state, current_price_id, subscribed_at, current_period_start, current_period_end, cancel_at_period_end, cancel_requested_at, ended_at, created_by, version, timestamps | Unique shop_id/moon_id; one current lifecycle row, with history in events/periods. State active/ended/suspended. Use cancellation flag rather than a contradictory second state. Require period end > start. |
| moon_subscription_periods | id, shop_id, subscription_id, price_id, service_start, service_end, monthly_price_minor, currency, billing_kind, timestamps | Immutable commitment/price snapshot, unique subscription_id/service_start. billing_kind paid/free/migration_grant; no accidental historical charges during rollout. |
| moon_subscription_events | id, shop_id, subscription_id, action, actor_id, reason, before_json, after_json, request_id, created_at | Append-only activation/cancel/resume/renew/expire/suspend history; preserve actors without cascading deletion. |
| billing_invoices | id, shop_id, invoice_number, service_month, currency, status, issued_at, due_at, subtotal_minor, tax_minor, total_minor, version, timestamps | Unique invoice_number and shop_id/service_month/currency for regular monthly invoices. status draft/issued/void. Payment state is derived from allocations. Issued lines/totals immutable. |
| billing_invoice_lines | id, shop_id, invoice_id, subscription_period_id, line_kind, description, service_start, service_end, billable_days, days_in_month, monthly_price_minor, amount_minor, tax_minor, currency, charge_key | Unique charge_key prevents duplicate billing. Snapshot Moon name, rate and calculation; line kinds base_platform/moon/adjustment. Never recalculate past invoices from current catalog prices. |
| billing_adjustments | id, shop_id, original_invoice_id, adjustment_number, amount_minor, reason, actor_id, created_at | Explicit credit/debit corrections; no overwriting issued invoices. Specify invoice settlement integration before enabling credits. |
| billing_payment_allocations | id, shop_id, invoice_id, platform_payment_id, amount_minor, request_key, actor_id, timestamps | Positive allocations, unique request_key. Lock payment and invoice before checking available amounts. Reuse existing recorded payments through the platform payment service; no duplicate income entry. Payment edits/deletes must respect allocated amounts. |
| moon_requests | id, shop_id, actor_id, operation, idempotency_key, payload_hash, result_reference, created_at | Unique shop_id/operation/idempotency_key; reject key reuse with a different payload. |

Use PostgreSQL timestamptz for instants and date for local service/invoice dates. Use bigint minor units with safe arithmetic/serialization in JavaScript. Composite tenant foreign keys or equivalent invariant checks prevent references to another shop's subscriptions, invoices or payments. Restrict deletion of priced/subscribed Moons, committed periods and financial history; archive instead.

Indexes: subscriptions(shop_id,state), subscriptions(state,current_period_end), periods(shop_id,service_start), invoices(shop_id,service_month), events(shop_id,subscription_id,created_at), allocations(shop_id,invoice_id). Batch-read catalog artwork, entitlements and permissions to avoid per-card database queries.

## Cloudflare R2 artwork

Reuse src/modules/files, its files/file_upload_sessions/file_attachments/file_jobs tables, private R2 credentials and verified upload pipeline. No second bucket integration or binary/base64 image columns are needed.

Add platform-only upload purposes moon.icon, moon.cover and moon.screenshot, with attachment resource resolvers in moons.files.js registered in files.runtime.js. Catalog attachments use platform scope and null shop_id; staff records stay shop-scoped. Proposed upload policy: PNG/JPEG/WebP, one icon up to 2 MB, one cover up to 5 MB, up to six screenshots at 5 MB each. Recommend square icons; generate normalized thumbnails while retaining proportions. Use a code-owned fallback icon before artwork is uploaded.

Only ready/verified files attach to a Moon. Database attachment changes commit transactionally; object deletion runs afterward through retryable cleanup jobs. Failed edits keep the previous artwork. Referenced files cannot be removed by orphan cleanup.

Platform administrators edit artwork, while authenticated shop users may read published catalog artwork without subscribing. Existing Files scope rules do not automatically permit this: add an explicit Moon resource read authorizer and verify preview/content/download routes rather than broadening platform-file access globally. Draft artwork remains platform-only. Store file IDs/attachment references, not expiring signed URLs. Resolve access-controlled content URLs at read time.

## Billing rules

Confirmed: immediate activation, daily proration and next-month billing. Proposed default: calendar months in the billing account's configured timezone, default Asia/Karachi, with invoices generated on day 1 for the previous month's service.

Formula: monthly amount in minor units x billable local calendar days / actual days in that month. Round half up once per subscription/month after combining rate segments; allocate rounded line amounts deterministically. Do not round a daily rate first. Rate changes split calculation segments without charging the same day twice. Price changes should apply only at a future period boundary with a disclosed policy.

Example: a monthly price of PKR 3,000, activation on 16 November, and access through 30 November produces 15/30 x 3,000 = PKR 1,500 on the December invoice. This is an illustrative price, not a configured tariff.

Proposed day-count rule: activation day counts, subscription service_end is exclusive. Cancellation requested in November schedules access termination at 1 December 00:00 local time; November service remains payable, with no December renewal. Confirm this calendar-month interpretation before enabling charges. Re-subscribing within the same local day cannot create duplicate billable days.

Invoice creation does not mean payment received. Outstanding payable derives from issued invoices, credits and payment allocations. Never add arrears to a new invoice as another charge when the old invoice already records that debt. Existing prepaid/lifetime base RMS subscriptions must not be charged again; the base-platform line requires a defined contract source rather than assuming a monthly base fee.

Transactions lock the current shop subscription/account, apply state changes, record events and create period snapshots atomically. Invoice workers use deterministic charge keys and retries so crashes or multiple instances cannot duplicate service. A late worker must reconcile missed months. Cancellation enforcement checks the timestamp synchronously; worker delays never extend access.

## Permissions, ownership and enforcement

Keep existing permissions, roles, role_permissions and user_roles. Map permission keys to Moons and group them by Moon in the shop's role editor. Avoid introducing a second assignment system. Shops can edit only their own roles and cannot delegate privileges they are not authorized to manage. Subscription management is separate from staff/analytics business permissions.

Proposed new permissions: moons.view, moons.subscribe, moons.cancel, billing.view and billing.manage_payments; platform_moons.view/create/update/publish/manage_prices plus explicit platform billing permissions. Account owners receive subscription management according to an explicit migration, not an unrestricted grant to all staff.

Access requires a valid base RMS account, shop eligibility, active Moon entitlement at request time, and the existing feature/action permission. Preserve saved permissions on expiry. Server APIs, direct React/legacy links, exports, reports, file downloads, realtime subscriptions and workers all enforce ownership gates. Existing socket connections must lose protected subscriptions/data when entitlement ends.

Staff Moon proposed ownership: employment profiles, organization, attendance, leave, payroll, staff documents/activity. Keep basic login accounts, password recovery and role/account administration in core RMS. Keep necessary POS waiter/rider assignment supporting reads available. Final feature scope needs confirmation.

Analytics Moon proposed ownership: the dedicated Analytics workspace and its exports. Decide separately whether AI, standalone Reports and dashboard widgets are included. Basic POS and shift totals must remain available to their core workflows.

## Backend and UI boundaries

Add src/modules/moons for catalog, pricing, lifecycle, entitlements and file resource adapters. Add src/modules/billing for invoices, adjustments, payment allocations and reconciliation workers. Reuse existing sessions/auth and public staff/analytics/platform-payment services; do not move their data into duplicate tables.

Proposed routes: GET /api/moons, GET /api/moons/:key, POST /api/moons/:key/subscribe, POST /api/moons/:key/cancel, POST /api/moons/:key/resume; GET /api/billing/summary, GET /api/billing/invoices and GET /api/billing/invoices/:id. Platform catalog/pricing/issuance endpoints have separate explicit middleware. Cancellation requires a POST mutation; GET requests never change financial state.

React routes: /app/moons, /app/moons/:key and /app/billing. Platform UI manages catalog artwork, price versions and invoice administration. Update lobby subscribed/available sections and existing Staff/Analytics navigation without losing direct-link compatibility. Show cancellation effective date, renewal state and estimated charges distinctly from issued balances.

## Implementation order

1. Settle outstanding billing/product rules and map every feature/API owner.
2. Add schema migrations, catalog/prices, file policies and platform management UI. Seed Staff Directory/Analytics drafts without charging existing shops.
3. Add shop subscriptions, permission grouping and server entitlement service behind a rollout flag.
4. Add monthly proration, invoice generation, payment allocation safeguards and reconciliation worker.
5. Build shop Moons/billing UI and migrate existing shops under an explicit free/paid/grandfathering policy.
6. Gate Staff/Analytics pages and all related APIs/background paths, then enable paid subscriptions after verification.

Verify PostgreSQL migrations plus supported SQLite development; tenant isolation; unauthorized actions; free and paid activation; month lengths/leap years/timezone boundaries; same-day retries; concurrent cancellation/renewal; expired access without a worker; preserved role assignments; no duplicate invoice charges; payment/credit correctness; R2 draft/published read authorization; and core RMS behavior without a Moon. Verify mobile, dark mode, legacy links and production build.

## Outstanding decisions

- Actual Staff and Analytics prices, currency, taxes and any per-shop negotiated pricing.
- Confirm calendar-month periods, local day counting, day-1 invoice issuance and billing timezone.
- Payment deadline labels only; confirmed policy: unpaid/overdue invoices never automatically suspend base RMS or subscribed Moons.
- Whether free Moons need explicit activation and whether cancellation follows the same period-end behavior.
- Price-change notice/consent, free-to-paid conversion, refunds and resubscription rules.
- Existing-shop rollout: free access/grandfathering duration and the point charges may begin.
- Final Staff/Analytics inclusions, eligible shop types, dependencies and who can subscribe/cancel.
- Data retention/export after expiry, platform preview/support access and audit retention.

These choices do not prevent catalog/schema scaffolding, but financial and access enforcement must follow the agreed policy before production rollout.
