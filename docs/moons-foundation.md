# Moons foundation

Status: initial design prepared on 1 November 2026. The updated database and implementation plan is in moons-database-implementation-plan.md. Confirmed since this draft: shop-wide subscriptions, immediate activation, daily prorated charges on the next month invoice, and shop-managed per-Moon role permissions. No runtime changes or subscription charges have been made.

## Confirmed product requirements

- Staff Directory and Analytics become the first Moons.
- Each Moon can be free or have a monthly price.
- Paid Moon charges contribute to the customer's monthly invoice total.
- Unsubscribe schedules cancellation at the current period end. Access continues until that boundary, then all Moon-owned functionality becomes unavailable.
- Existing business records remain preserved when access ends.

## Architecture

Keep Moons inside the existing modular monolith, Express session, PostgreSQL database and React application. Add `src/modules/moons/` for the catalog, subscription lifecycle and entitlement service, and a billing module for invoice obligations. Retain existing staff and analytics services as the owners of their business data.

The existing `subscriptions` table and `PlatformPaymentService` describe recorded base-platform payments and access dates. They do not represent monthly invoices, outstanding balances or individual Moon subscriptions. Preserve them during the additive migration. Do not record a Moon invoice charge as received cash; payment allocations settle the invoice separately.

## Proposed persistence

- `moon_catalog`: stable key, name, description, published status and feature ownership.
- `moon_prices`: immutable effective price versions, currency and monthly amount in integer minor units. Zero represents free. Price changes must not rewrite existing invoice lines or committed periods.
- `shop_moon_subscriptions`: shop, Moon, price version, lifecycle state, current period start/end, cancel-at-period-end, actor and concurrency version. Allow one current subscription per shop/Moon if shop-level billing is selected.
- `moon_subscription_events`: immutable subscribe, cancellation, resume, renewal and expiry history with actor, timestamp, reason and before/after values.
- `billing_invoices`: shop, currency, billing period, state and totals. Issued invoices are immutable; corrections use explicit adjustments.
- `billing_invoice_lines`: base-platform or Moon charge, description/price snapshot, subscription and service period. Unique subscription/charge-period keys prevent duplicate renewal charges.
- `billing_payment_allocations`: link recorded payments to invoices without treating invoice creation as income.

All tenant-owned records carry `shop_id`. Requests derive tenant identity from the session. Monetary arithmetic uses integer minor units and an explicitly selected rounding rule.

## Lifecycle and transaction boundaries

Subscribe creates the subscription, its audit event and any initial invoice obligation in one transaction. Lock the subscription/billing account as appropriate and use an idempotency key so retried requests do not duplicate charges.

Cancel marks `cancel_at_period_end` and records an event; it does not immediately revoke access. Repeated cancellation must be idempotent. Resume before expiry clears the pending cancellation without an extra charge. Renew only subscriptions that are still eligible, generating one charge per service period. At `now >= current_period_end`, a cancelled subscription is no longer entitled, even if the expiry worker has not run.

Workers reconcile lifecycle state and invoice lines using bounded batches and database uniqueness constraints. Use database-backed entitlement checks or a bounded/invalidation-aware cache rather than relying on login-session snapshots.

## Access and migration

Effective feature access requires both Moon entitlement and the existing action permission. Buying a Moon never grants staff administrative permissions. Super Admin management/preview access needs an explicit policy separate from shop entitlement.

Inventory each Moon's React and legacy pages, API endpoints, exports, file access, notifications, scheduled work and embedded widgets before enforcing access. Shared endpoints must gate only Moon-owned operations. Keep basic login/account and role administration accessible outside the Staff Moon so expiry cannot prevent account recovery or core RMS administration. POS waiter/staff assignment must remain functional.

Staff Directory ownership of attendance, leave, payroll and documents, and Analytics ownership of standalone reports, AI analysis and dashboard widgets, require explicit inclusion decisions. Do not disable shared core functionality by assuming every related feature belongs to the Moon.

Add a Moons catalog and subscription-management screen, a shop billing/invoice screen, and platform catalog/pricing controls. Update lobby navigation to show subscribed Moons and available Moons. Preserve existing links during migration and enforce the same entitlement on direct routes and APIs.

## Decisions required before charging or enforcing expiry

1. Subscription scope: whole shop or individual user.
2. First-period billing: prorate to the common monthly invoice date, charge a full month immediately, or start billing next month.
3. Monthly invoice anchor/timezone, initial prices/currency, payment due date and unpaid-invoice access/grace policy.
4. Free Moon activation/cancellation behavior and future free-to-paid changes; never silently create a paid commitment.
5. Initial migration/grandfathering period for existing Staff Directory and Analytics users.
6. Exact feature inclusions for each Moon and which roles may subscribe, cancel and manage billing.

## Delivery sequence and verification

1. Settle billing decisions and map feature ownership.
2. Add catalog, price versions, subscriptions, events and entitlement service with safe startup migrations; leave enforcement disabled until existing shops are migrated.
3. Add invoice lines, renewal/cancellation workers and payment allocation integration.
4. Build subscription/billing UI and platform controls, then migrate Staff Directory and Analytics navigation.
5. Enable feature gates only after entitlement backfill and end-to-end verification.

Verify free and paid subscriptions, concurrent/retried subscribe/renew/cancel, cancellation access immediately before and at the period boundary, resume, role restrictions, wrong-shop access, direct/legacy/API/export bypasses, price snapshots, invoice totals and unpaid behavior. Verify that staff account management, POS assignment and base RMS operations still work after a Moon expires. Exercise PostgreSQL migration and billing paths as well as supported SQLite development paths.
