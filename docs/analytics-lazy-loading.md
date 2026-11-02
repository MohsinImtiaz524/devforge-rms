# Analytics Moon on-demand loading

The Analytics Moon (`/app/moons/analytics`) requests `dashboard-data?panel=overview` on entry. Selecting Sales, Customers, Inventory, Profit, Staff, or Channels requests that panel with the current filters. Changing panels or filters aborts the previous browser request, and responses are matched to the active panel and filter key so stale results cannot replace current data. Aborting a browser request does not cancel SQL already running on the server.

Products, Ingredients, and Tips mount their existing monthly data components only when selected. AI uses its own insights request without first loading dashboard data. Reports and Custom Reports need no dashboard request. The monthly and detailed panel components are loaded with React lazy imports.

The server accepts an optional, validated `panel` parameter and skips unrelated query groups. Calls without `panel` retain the existing full dashboard response for the regular Analytics page and other consumers. All dashboard requests require `analytics.view`; tenant scope comes from the authenticated session for shop users. Responses use `Cache-Control: no-store`. Panels fetch fresh data when revisited; there is no shared data cache or background prefetch.

Query-tracing regression tests (stubbed Knex, excluding brand metadata, timezone lookup, and the separate tips service) record: full dashboard 31 query builders, Overview 4, Sales 6, Customers 2, Inventory 5, Profit 10, Staff 1, Channels 2. These counts demonstrate skipped query groups, not production latency measurements. PostgreSQL production timings remain to be measured with realistic shop data.

Verification: `node --test tests/analytics-panels.test.js tests/analytics-integrity.test.js tests/analytics-recipe-stock.test.js tests/analytics-monthly.test.js tests/tips-analytics.test.js tests/moons-analytics.test.js`, `node frontend/tests/analytics-moon.cjs`, frontend build, and targeted ESLint. No migration or environment changes are required. Deploy the backend and rebuilt frontend together.

## Reporting query optimization

Analytics now uses a read-only brand snapshot instead of calling the ownership rebalancing helper, which previously performed writes on each report request. Effective owner shares are derived in memory with the existing normalization rules. Financial records and persisted ownership are unchanged by reporting.

Current-period sales, tax, discounts and customer counts share one aggregate; previous-period sales and customers share another. Product allocation subtotals are scoped by shop, completed status and date before grouping, rather than aggregating all tenants. Independent query groups run in batches of two to reduce serial round trips without exhausting the database pool. The dashboard response includes a Server-Timing analytics duration header for production diagnosis.

A real SQLite fixture with 30,000 unrelated sales measured the allocation query at 45.07 ms before and 0.52 ms after (median of seven runs, warm database, indexed). This is one query benchmark, not production end-to-end latency. Financial SQL, returns, partial tax collection, stock costs, tenant filtering, empty results and read-only ownership are covered by tests/analytics-performance.test.js.

PostgreSQL indexes are prepared in docs/sql/analytics-performance-indexes.postgres.sql but have NOT been applied. Review existing indexes, run each CREATE INDEX CONCURRENTLY outside a transaction during an approved rollout, and inspect representative query plans. The script includes rollback statements. Deploying application code does not apply these indexes.

For sustained growth, the next architectural step is a separate reporting read model: tenant/day/hour summaries updated by an idempotent background worker from sales, returns, tips and waste. Corrections must update affected buckets, with reconciliation against the source ledger and a visible data-as-of timestamp. Distinct customers need a separate membership aggregate rather than summing daily distinct counts. This read model has not been implemented; it requires schema, worker and reconciliation work. Measure production Server-Timing and query plans before deciding whether it is necessary.

## Lightweight Analytics Moon Overview

The Moon Overview now contains exactly three headline metrics (Net Revenue, Completed Orders, Average Bill Value) and two charts (Sales Trend, Order Volume). Both charts reuse one trend query. The response contains only the three KPI fields, trend series and reporting metadata. There are four report SQL queries on SQLite; PostgreSQL also reads reporting timezone metadata. This is a query-count measurement, not a production latency guarantee.

The Overview no longer queries customer counts, product rankings, stock valuation, partner profit, payment/channel/category breakdowns, tips, previous-period comparisons or the activity heatmap. Sales now owns payment details, the activity heatmap and refund/discount/tax summaries; Inventory owns category sales and stock valuation. Product, Ingredient, Tip, Customer, Profit, Staff and Channel details remain in their respective tabs. Product and Tip tabs continue to use their explicitly labeled monthly scope. Legacy consumers that omit the panel parameter retain the full dashboard contract.
