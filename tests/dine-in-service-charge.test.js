const test = require('node:test');
const assert = require('node:assert/strict');
const knex = require('knex');
const { validatePercentage, calculateDineInServiceCharge, addServiceCharges } = require('../src/modules/dine-in-service-charge/dine-in-service-charge');
const { ensureDineInServiceChargeSchema } = require('../src/modules/dine-in-service-charge/dine-in-service-charge.migration');

test('dine-in service charge uses discounted subtotal and cent rounding', () => {
  assert.equal(validatePercentage(5), 5);
  assert.equal(calculateDineInServiceCharge(900, 5, 'dine_in'), 45);
  assert.equal(calculateDineInServiceCharge(999.99, 7.5, 'dine_in'), 75);
  assert.equal(calculateDineInServiceCharge(900, 5, 'takeaway'), 0);
  assert.equal(addServiceCharges(990, 0, 45), 1035);
  assert.throws(() => validatePercentage(-1), /0 to 100/);
  assert.throws(() => validatePercentage(100.001), /0 to 100/);
});

test('migration adds per-shop setting and immutable sale snapshot columns', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  try {
    await db.schema.createTable('shops', table => table.increments('id'));
    await db.schema.createTable('sales', table => table.increments('id'));
    await ensureDineInServiceChargeSchema(db);
    await ensureDineInServiceChargeSchema(db);
    assert.equal(await db.schema.hasColumn('shops', 'dine_in_service_charge_percentage'), true);
    assert.equal(await db.schema.hasColumn('sales', 'dine_in_service_charge_percentage'), true);
    assert.equal(await db.schema.hasColumn('sales', 'dine_in_service_charge'), true);
    await db('shops').insert({ id: 1, dine_in_service_charge_percentage: 5 });
    await db('sales').insert({ id: 1, dine_in_service_charge_percentage: 5, dine_in_service_charge: 45 });
    await db('shops').where({ id: 1 }).update({ dine_in_service_charge_percentage: 8 });
    assert.equal(Number((await db('sales').where({ id: 1 }).first()).dine_in_service_charge), 45);
  } finally { await db.destroy(); }
});
