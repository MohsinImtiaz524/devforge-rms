 Delivery service charge implementation proposal

Status: approved by the user and implemented in staged code changes. See [implementation and validation report](delivery-service-charge-implementation.md). No existing database migration was run; PostgreSQL validation and approved-target migration remain release prerequisites.

## Confirmed business rules

- Enter the charge when selecting Delivery in POS.
- Flat monetary amount; zero means free delivery.
- Add after product discounts and tax. It is separate from tips.
- Show as a separate Delivery service charge line on the customer/unpaid bill.
- Preserve the charge during item edits, payment, and inquiry-bill recalculation.
- Historical orders default to zero; do not recalculate historical totals.

Example: products 1,000, discount 100, tax 10% = 990; delivery charge 150; bill total 1,140. A later payment or reprint must retain 1,140, without applying product tax to the charge or adding it twice.

## Narrow implementation steps

1. Add a pure money helper and isolated tests first. Parse monetary inputs into integer minor units for validation/addition; reject negative, nonfinite, overprecision, and over-limit values.
2. Prepare a separate additive migration for `sales.delivery_service_charge NUMERIC(12,2) NOT NULL DEFAULT 0` with a nonnegative constraint. Do not run it against an existing database during development or install it as an automatic startup mutation without review. Verify it against a disposable test database and retain existing rows/totals.
3. Integrate the helper into sale creation and item editing inside existing transactions, tenant scopes, authorization, and idempotency safeguards. Missing fields on legacy requests must preserve existing charges on edits; new orders default to zero. Non-delivery orders cannot receive a positive delivery charge.
4. Preserve the stored charge in payment/details and unpaid inquiry recalculation. For collected-payment orders, keep received amounts intact and update remaining due/customer ledger through the existing transaction. Use the persisted order type, not the POS selection, for validation.
5. Add the fee field to the POS Delivery controls and restore it on edit. Show the separate line and inclusive total in payment/inquiry dialogs. Do not replace it with a product or tip.
6. Add the separate line to server receipt rendering, queued receipt rendering, and legacy receipt fallback. Kitchen tickets remain price-free. Audit other bill-total consumers before release.

## Required validation before integration is considered complete

- Zero/positive values, two-decimal rounding, discounts/tax interaction, invalid inputs, and non-delivery rejection.
- Create, idempotent retry, edit with explicit zero, edit omitting fee, payment, partial payment/dues, inquiry update, reprint, and print failure.
- Existing order permissions and tenant isolation. Concurrent updates/failed transactions must not leave charge, totals, ledger, and payment out of sync.
- Disposable PostgreSQL migration and service integration tests; no production database access.
- Existing POS/payment/printing regressions, mobile/desktop controls, and production build.

## Risks and release boundary

This is a financial schema/API change, not only a visual input. Missing one recalculation path could drop or duplicate the charge; inconsistent migration rollout could interrupt order saving. Prepare and test each step separately. No production migration, deployment, environment-variable change, or historical-total backfill is authorized by this proposal.

Rollback: keep the additive column and data, disable new fee entry until all consumers are compatible, and preserve any recorded charge in totals/receipts. Do not drop the column or deploy old recalculation code over orders with recorded charges.
