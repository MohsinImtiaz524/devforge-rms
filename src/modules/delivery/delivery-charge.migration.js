// Explicit migration only: never called from a request or application startup.
async function up(db) {
  if (!await db.schema.hasColumn('sales', 'delivery_service_charge')) {
    await db.schema.alterTable('sales', table => {
      if (db.client.config.client === 'better-sqlite3' || db.client.config.client === 'sqlite3') {
        table.specificType('delivery_service_charge', 'NUMERIC NOT NULL DEFAULT 0 CHECK (delivery_service_charge >= 0 AND delivery_service_charge <= 99999999.99)');
      } else table.decimal('delivery_service_charge', 12, 2).notNullable().defaultTo(0);
    });
  }
  if (db.client.config.client === 'pg') {
    await db.raw(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_delivery_service_charge_nonnegative' AND conrelid = 'sales'::regclass) THEN
        ALTER TABLE sales ADD CONSTRAINT sales_delivery_service_charge_nonnegative CHECK (delivery_service_charge >= 0 AND delivery_service_charge <= 99999999.99);
      END IF;
    END $$;`);
  }
}
module.exports = { up };
