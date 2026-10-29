# Inventory archive

Open **Inventory → Archive** (`/app/inventory?view=archive`).

Ingredient and stock-product rows have an **Archive** action. Click it, choose the entire item or a quantity, enter a reason, and confirm. Product popups also let you choose an individual variant. Cancel leaves the current page and filters unchanged; saving closes the popup and refreshes Inventory without redirecting. Failed saves keep the popup open and preserve input. The button requires `inventory_archive.archive`.

- **Archived items:** archive an ingredient, a stock product (including its active variants), or an individual variant. Quantities remain recorded; the item stops being available for new use. Restoring an individually archived variant keeps it off the menu until explicitly published.
- **Archived stock:** hold a specified quantity outside available stock. Ingredients allocate original FIFO batches; a whole-product quantity allocates active variants in ID order. To choose a particular variant, select Individual variant. Quantities use the existing three-decimal precision and ingredient base units.
- **Restore:** restores the complete quantity from one archive entry exactly once. Restore the parent item/variant first if it is also archived. Damaged/expired stock still belongs in Waste, not Archive.
- Every action requires a reason. History includes the account ID/name, server timestamp, item snapshot, before/after values, original cost allocations, and a separate restore event. PostgreSQL triggers reject edits/deletion of these records.

## Permissions

`inventory_archive.view` reads history, `inventory_archive.archive` archives and searches eligible items, and `inventory_archive.restore` restores. Assign these explicitly through the role editor for existing roles; startup does not overwrite existing role choices. Inventory panel availability still applies. Kitchen, Users, and Settings permissions are not prerequisites.

## Safety and existing behavior

- All mutations use the session shop, row locks, transactions, and serialized archive requests per shop. UUID request IDs prevent duplicate archive movements; a unique restore event prevents duplicate restores.
- Whole-item archiving is blocked by unfinished product orders, product compositions, and ingredient recipe/menu/add-on dependencies. Quantity archiving is allowed within current available balances. Insufficient or inconsistent batch balances reject the transaction.
- Existing sales reject archived product IDs. Returns to an archived variant remain in its held stock rather than increasing active product stock.
- Held quantities preserve original costs. If an ingredient batch price changed, restoration creates a batch at the captured cost with its original expiry/FIFO timestamp. Variant restoration blends available and restored cost using PostgreSQL numeric arithmetic.
- Variant removal through the product editor is blocked: use Archive instead. Products with outstanding archive entries cannot be converted to recipe products. Existing recipe-menu soft deletion remains outside this inventory change.
- Older soft-deleted/inactive records are not backfilled as audited archives: their original actor/reason cannot be reconstructed reliably.
- Legacy stock products without active variants can be archived as whole items; configure variants before archiving a product quantity.
- Full product editing still follows existing stock semantics; where quantity holds exist, stale stock values must be refreshed rather than overwritten through the editor.

## Deployment and checks

The additive PostgreSQL schema is installed during Express startup through `archive.migration.js`, under a migration lock. Build the frontend and restart Express together; never run the frontend against a backend without this migration. There is no SQLite implementation.

`npm test` includes archive input validation. Run PostgreSQL integration tests with `ARCHIVE_TEST_DATABASE_URL` pointing to an explicitly disposable database; tests create and drop an isolated schema and never fall back to production `DATABASE_URL`:

```powershell
$env:ARCHIVE_TEST_DATABASE_URL = 'postgresql://user@localhost:5432/disposable_test_database'
node --test tests/inventory-archive.test.js
```

Browser checks: start the frontend on port 5179, then run `node frontend/tests/inventory-archive-ui.cjs`. It uses installed Chrome by default (`ARCHIVE_BROWSER_CHANNEL` can override the channel). This script mocks all API responses and writes screenshots into `tmp/`; it does not change live inventory.
