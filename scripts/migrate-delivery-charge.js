// Explicit opt-in target. Never loads .env or falls back to the application's DB.
const knex = require('knex');
const { ensureDeliveryChargeSchema } = require('../src/modules/delivery/delivery-charge.migration');
async function main() {
  const target = process.env.DELIVERY_MIGRATION_DATABASE_URL;
  const sqliteFile = process.env.DELIVERY_MIGRATION_SQLITE_FILE;
  if ((!target && !sqliteFile) || (target && sqliteFile)) throw new Error('Specify exactly one explicit target: DELIVERY_MIGRATION_DATABASE_URL or DELIVERY_MIGRATION_SQLITE_FILE.');
  const db = knex(target ? { client: 'pg', connection: target } : { client: 'better-sqlite3', connection: { filename: sqliteFile }, useNullAsDefault: true });
  try {
    await ensureDeliveryChargeSchema(db);
    console.log('Delivery service charge migration complete. Existing totals were not changed.');
  } finally { await db.destroy(); }
}
if (require.main === module) main().catch(error => { console.error('Delivery charge migration failed:', error.message); process.exitCode = 1; });
module.exports = { main };
