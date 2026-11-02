-- PostgreSQL only. Run each statement outside a transaction during a planned rollout.
-- Prepared for review; do not run automatically at application startup.
-- CONCURRENTLY allows normal reads/writes during index construction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_sales_shop_status_created
  ON sales (shop_id, order_status, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_returns_shop_created
  ON returns (shop_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_waste_shop_status_created
  ON waste_events (shop_id, status, created_at);
-- sale_items(sale_id) already has idx_sale_items_sale_id in postgres-schema.sql.
-- Check pg_indexes and EXPLAIN (ANALYZE, BUFFERS) on representative SELECTs before rollout.
-- Rollback, if required, outside a transaction:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_analytics_sales_shop_status_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_analytics_returns_shop_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_analytics_waste_shop_status_created;
