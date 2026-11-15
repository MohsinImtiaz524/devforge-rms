async function up(db) {
  if (!await db.schema.hasColumn('shops', 'dine_in_service_charge_percentage')) {
    await db.schema.alterTable('shops', table => table.decimal('dine_in_service_charge_percentage', 5, 2).notNullable().defaultTo(0));
  }
  if (!await db.schema.hasColumn('sales', 'dine_in_service_charge_percentage')) {
    await db.schema.alterTable('sales', table => table.decimal('dine_in_service_charge_percentage', 5, 2).notNullable().defaultTo(0));
  }
  if (!await db.schema.hasColumn('sales', 'dine_in_service_charge')) {
    await db.schema.alterTable('sales', table => table.decimal('dine_in_service_charge', 12, 2).notNullable().defaultTo(0));
  }
  if (db.client.config.client === 'pg') await db.raw(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_dine_in_service_charge_percentage_range') THEN ALTER TABLE shops ADD CONSTRAINT shops_dine_in_service_charge_percentage_range CHECK (dine_in_service_charge_percentage >= 0 AND dine_in_service_charge_percentage <= 100); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_dine_in_service_charge_nonnegative') THEN ALTER TABLE sales ADD CONSTRAINT sales_dine_in_service_charge_nonnegative CHECK (dine_in_service_charge >= 0); END IF;
  END $$;`);
}

async function ensureDineInServiceChargeSchema(db) {
  await db.transaction(async trx => {
    if (db.client.config.client === 'pg') await trx.raw("SELECT pg_advisory_xact_lock(hashtext('orbit_dine_in_service_charge_v1'))");
    await up(trx);
  });
}

module.exports = { up, ensureDineInServiceChargeSchema };
