# Monthly product and ingredient analytics

The Analytics Moon owns the read-only `GET /api/analytics/monthly?month=1&year=2024` read model. Both React Analytics entry points share `MonthlyPanels.jsx`. Existing dashboard endpoints and other tabs retain their behavior. No charts are added to the monthly panels.

The route requires an authenticated session, `analytics.view`, and the session's business ID. Existing global membership, API policy, and Moon entitlement middleware still applies. Client-supplied business IDs are ignored. Reads scope sales, products, recipes, ingredients, consumption allocations, batches, and waste to the authenticated business. There are no writes, migrations, new permissions, approval transitions, or audit mutations.

Monthly bounds are inclusive at the start and exclusive at the next month's start. PostgreSQL interprets those bounds in the business's attendance reporting timezone, defaulting to Asia/Karachi. SQLite follows the existing locally stored timestamp convention.

Product units count completed sales before returns. Revenue allocates each completed bill's discounted, tax-exclusive total by item subtotal. Returns remain in the existing overview's net metrics; the monthly panel labels its sales activity basis explicitly. Fixed-scale integer arithmetic is used for aggregation and monetary results round to two decimals.

Ingredient consumption prefers immutable FIFO allocations, including their recorded costs. Allocations are counted once per sale item; linked recipes are used only when no allocation exists. Legacy estimates use the currently linked recipes and selected variants, divide recipe usage quantities by the ingredient conversion factor, and use the latest batch cost recorded no later than the sale. Estimates are labeled, and missing historical costs display as unavailable instead of zero. Missing recipe/consumption lines are disclosed. Legacy recipes are not versioned, so these estimates cannot reconstruct past recipe edits or unrecorded addon usage.

Ingredient quantities display in stock units. Consumption leaders compare convertible units within mass, volume, and count; incompatible units have separate leaders. Ingredient wastage sums recorded ingredient waste-event lines without counting parent event costs again. Wastage costs are gross recorded loss costs before recoveries.

Search, sorting, 20-row pagination, and CSV export operate on the selected month's complete aggregate rows. KPIs retain the entire monthly scope. Export includes every searched/sorted row, including rows outside the visible page. Spreadsheet formula prefixes are escaped. Loading, empty, error, expired session, and retry states are handled.

Verification: `node --test tests/analytics-monthly.test.js tests/analytics-integrity.test.js tests/analytics-recipe-stock.test.js tests/moons-analytics.test.js`, root `npm test`, frontend lint/build, and `node frontend/tests/analytics-moon.cjs`. Browser tests use intercepted API fixtures; calculation tests use an isolated SQLite database. Production PostgreSQL timing and live business-data reconciliation remain release checks. No deployment or production migration is required by this change.
