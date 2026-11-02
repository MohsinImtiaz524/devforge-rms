const test = require('node:test');
const assert = require('node:assert/strict');
const knex = require('knex');
const { monthlyAnalytics } = require('../src/modules/tips/tips.service');

test('monthly tip analytics counts each collection once, uses cents, isolates staff and observes collection month', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  try {
    await db.raw('CREATE TABLE users (id INTEGER PRIMARY KEY, shop_id INTEGER, name TEXT, role TEXT)');
    await db.raw('CREATE TABLE roles (id INTEGER PRIMARY KEY, shop_id INTEGER, name TEXT)');
    await db.raw('CREATE TABLE user_roles (user_id INTEGER, role_id INTEGER)');
    await db.raw('CREATE TABLE staff_profiles (user_id INTEGER UNIQUE, shop_id INTEGER, full_name TEXT)');
    await db.raw('CREATE TABLE sale_tips (id INTEGER PRIMARY KEY, shop_id INTEGER, sale_id INTEGER, collected_by INTEGER, amount_cents BIGINT, collected_at TEXT, collection_mode TEXT, UNIQUE(shop_id, sale_id))');
    await db('users').insert([{ id: 1, shop_id: 1, name: 'Cashier' }, { id: 2, shop_id: 1, name: 'Same name' }, { id: 3, shop_id: 2, name: 'Private user' }]);
    await db('users').where('id', 2).update({ role: 'waiter' });
    await db('users').insert([
      { id: 4, shop_id: 1, name: 'Zero legacy waiter', role: 'Waiter' },
      { id: 5, shop_id: 1, name: 'Zero order taker', role: 'order_taker' },
      { id: 6, shop_id: 1, name: 'Zero assigned waiter', role: 'user' },
      { id: 7, shop_id: 2, name: 'Private waiter', role: 'waiter' },
      { id: 8, shop_id: 1, name: 'Not a waiter', role: 'user' },
    ]);
    await db('roles').insert([{ id: 1, shop_id: 1, name: 'Waiter' }, { id: 2, shop_id: null, name: 'Waiter' }, { id: 3, shop_id: 2, name: 'Waiter' }]);
    await db('user_roles').insert([{ user_id: 6, role_id: 1 }, { user_id: 6, role_id: 2 }, { user_id: 8, role_id: 3 }]);
    await db('staff_profiles').insert([{ user_id: 1, shop_id: 1, full_name: 'Employee A' }, { user_id: 3, shop_id: 2, full_name: 'Private employee' }]);
    await db('sale_tips').insert([
      { id: 1, shop_id: 1, sale_id: 1, collected_by: 1, amount_cents: 10010, collected_at: '2024-01-31T19:00:00Z', collection_mode: 'checkout' },
      { id: 2, shop_id: 1, sale_id: 2, collected_by: 1, amount_cents: 2020, collected_at: '2024-02-29 18:59:59.999', collection_mode: 'standalone' },
      { id: 3, shop_id: 1, sale_id: 3, collected_by: 2, amount_cents: 5000, collected_at: '2024-02-10 00:00:00', collection_mode: 'checkout' },
      { id: 4, shop_id: 2, sale_id: 4, collected_by: 3, amount_cents: 99999, collected_at: '2024-02-10 00:00:00', collection_mode: 'checkout' },
      { id: 5, shop_id: 1, sale_id: 5, collected_by: 1, amount_cents: 99999, collected_at: '2024-02-29 19:00:00', collection_mode: 'checkout' },
      { id: 6, shop_id: 1, sale_id: 6, collected_by: 1, amount_cents: 99999, collected_at: '2024-01-31 18:59:59', collection_mode: 'checkout' },
      // Preserve the total without revealing a user belonging to another shop.
      { id: 7, shop_id: 1, sale_id: 7, collected_by: 3, amount_cents: 25, collected_at: '2024-02-10 00:00:00', collection_mode: 'standalone' },
    ]);
    const selection = { month: 2, year: 2024 };
    const data = await monthlyAnalytics(1, selection, db);
    assert.equal(data.kpi.totalTips, 170.55);
    assert.equal(data.kpi.tipsReceived, 4);
    assert.equal(data.kpi.topRecipient, 'Employee A');
    assert.deepEqual(data.tips[0], { id: 1, name: 'Employee A', quantity: 2, revenue: 120.30 });
    assert.equal(data.tips[2].name, 'Former staff #3');
    assert.deepEqual(data.tips.filter(row => row.quantity === 0).map(row => row.id).sort(), [4, 5, 6]);
    assert.equal(data.tips.length, 6, 'tipped waiters and multiple role assignments must not duplicate staff');
    assert.ok(data.tips.filter(row => row.quantity === 0).every(row => row.revenue === 0));
    assert.equal(data.tips.reduce((sum, row) => sum + Math.round(row.revenue * 100), 0), 17055);
    assert.equal(data.tips.reduce((sum, row) => sum + row.quantity, 0), data.kpi.tipsReceived);
    for (const result of await Promise.all([monthlyAnalytics(1, selection, db), monthlyAnalytics(1, selection, db)])) assert.deepEqual(result, data);
    await assert.rejects(db('sale_tips').insert({ id: 8, shop_id: 1, sale_id: 1, collected_by: 1, amount_cents: 10010, collected_at: '2024-02-01' }));
    const empty = await monthlyAnalytics(1, { month: 2, year: 2020 }, db);
    assert.deepEqual(empty.tips.map(row => row.id).sort(), [2, 4, 5, 6]);
    assert.ok(empty.tips.every(row => row.quantity === 0 && row.revenue === 0));
    assert.deepEqual(empty.kpi, { totalTips: 0, tipsReceived: 0, topRecipient: null });
    const december = await monthlyAnalytics(1, { month: 12, year: 2023 }, db);
    assert.equal(december.kpi.totalTips, 0);
    await db.schema.renameTable('sale_tips', 'sale_tips_offline');
    await assert.rejects(monthlyAnalytics(1, selection, db));
    await db.schema.renameTable('sale_tips_offline', 'sale_tips');
    assert.deepEqual(await monthlyAnalytics(1, selection, db), data);
  } finally { await db.destroy(); }
});

test('tip analytics rejects invalid month, year and business scope', async () => {
  for (const selection of [{ month: 0, year: 2024 }, { month: 13, year: 2024 }, { month: 2, year: NaN }]) await assert.rejects(monthlyAnalytics(1, selection), /valid month and year/);
  await assert.rejects(monthlyAnalytics(null, { month: 2, year: 2024 }), /Shop context required/);
});
