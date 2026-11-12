// Read-only readiness check for the database configured for this workspace.
require('dotenv').config({ quiet: true });
const db = require('../db/knex');
async function main() {
  try {
    const connection = db.client.config.connection;
    let host = connection?.host || 'localhost';
    if (connection?.connectionString) host = new URL(connection.connectionString).hostname;
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    const postgres = db.client.config.client === 'pg';
    const result = postgres ? (await db.raw('SELECT current_database() AS database, current_schema() AS schema')).rows[0] : { database: 'configured SQLite file' };
    console.log(JSON.stringify({
      environment: process.env.NODE_ENV || 'unspecified',
      target: local ? 'local' : 'remote',
      client: db.client.config.client,
      ...result,
      hasDeliveryServiceCharge: await db.schema.hasColumn('sales', 'delivery_service_charge'),
    }, null, 2));
  } finally { await db.destroy(); }
}
if (require.main === module) main().catch(() => { console.error('Database readiness check failed; no changes were made.'); process.exitCode = 1; });
