# Delivery service charges

Implementation date: 2026-11-11. Application code is implemented. Release is pending the explicit database migration and PostgreSQL validation. No existing application/production database was modified.

## Behavior

POS Delivery accepts a flat charge, including zero. It is added once after product discount and tax, separately from tips. Example: 1,000 products - 100 discount + 90 tax + 150 delivery = 1,140. Customer and unpaid receipts show the fee as a separate line. Kitchen tickets retain their existing price-free format.

Invalid, negative, nonfinite, overprecision, and over-limit charges are rejected on the backend. Positive charges on non-delivery orders are rejected. Charges are restored during editing; omitted fields in legacy edits preserve the stored amount, while explicit zero means free delivery. Dispatched orders cannot change the charge. Completed orders retain the existing edit prohibition. Paid amounts are preserved on item edits when omitted by a caller, and the React editor sends the existing received amount.

Payment/details and inquiry-bill recalculations include the stored charge. Product tax is computed without the fee. Legacy payment/full-payment and receipt fallback calculations also preserve it. Native queued receipts use the same server receipt renderer through their print URL. There is no automatic financial retry or new physical-print retry behavior.

## Code boundaries

- `src/modules/delivery/delivery-charge.js`: validated monetary charge resolution and minor-unit addition.
- `src/modules/delivery/delivery-charge.migration.js`: additive schema operation, deliberately not wired to startup or requests.
- `scripts/migrate-delivery-charge.js`: explicit target-only migration runner; it does not load `.env` or fall back to the application database. PostgreSQL migration execution uses a transaction and advisory lock.
- `services/SalesService.js`: existing tenant-scoped transactions and sale locks remain the owner of financial writes; checkout and item edits store the charge, and payment/inquiry paths preserve it.
- `services/ReceiptPrintService.js`, `public/js/app.js`: server/queued and legacy fallback receipts plus legacy payment calculations.
- React POS, payment and print-option components: input, restore, totals, and separate charge line.
- Fresh PostgreSQL/SQLite schemas include the field and nonnegative/bounded checks. Existing installations require the explicit migration.

## Validation executed

- Money validation, zero/positive values, minor-unit addition, and tax/discount example.
- Disposable SQLite migration repeatability, historical-total preservation, and nonnegative database constraint.
- Real SalesService transactions on an in-memory schema: creation, idempotent retry, item editing with omitted fee/explicit zero, preserved partial received amount, inquiry/payment recalculation, wrong-shop rejection, post-dispatch edit rejection, rollback, and print-queue failure rollback.
- Receipt line present for positive charge and omitted for zero.
- Existing tips/printing regressions: combined backend run passed 27 tests; one PostgreSQL test skipped.
- Browser: entry/restoration, dispatched fee lock, product-tax separation, full-payment totals, failed-save preservation, mobile layout, customer popup/dispatch confirmation, and complete existing View Orders workflow/permissions suite passed.
- Production frontend build and JavaScript syntax checks passed.

## Required before release

An isolated PostgreSQL target was not available. `tests/delivery-charge-postgres.test.js` is intentionally opt-in and was skipped. It creates/drops a uniquely named test schema and checks numeric defaults, repeatability, constraints, rollback, and concurrent locked updates. Run it only with an approved disposable PostgreSQL target:

```powershell
$env:DELIVERY_CHARGE_TEST_DATABASE_URL = '<disposable PostgreSQL URL>'
node --test tests/delivery-charge-postgres.test.js
```

The additive migration MUST be applied before using this version against an existing application database; otherwise sale writes reference a missing column. Back up and approve the target, then use exactly one of:

```powershell
$env:DELIVERY_MIGRATION_DATABASE_URL = '<explicit approved PostgreSQL URL>'
node scripts/migrate-delivery-charge.js
```

```powershell
$env:DELIVERY_MIGRATION_SQLITE_FILE = '<absolute approved SQLite file>'
node scripts/migrate-delivery-charge.js
```

Do not run either migration command using an unspecified/default target. No production migration, deployment, configuration change, or historical-total backfill was performed in this task.

## Recovery

Keep the additive column and recorded data. Do not revert to an older total-recalculation implementation over orders with recorded fees: that could lose the charge. Disable new fee entry while retaining fee-aware calculations/receipts if an operational issue is discovered. Migration rollback must not drop charge history.
