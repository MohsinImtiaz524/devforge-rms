const test = require('node:test');
const assert = require('node:assert/strict');
const knex = require('knex');
const { getMonthlyAnalytics } = require('../src/modules/moons/analytics/monthly.service');
const { monthlyQuery } = require('../src/modules/moons/analytics/monthly.schema');

async function fixture() {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  const definitions = {
    sales: 'id integer, shop_id integer, order_status text, created_at text, total numeric, tax_amount numeric',
    products: 'id integer, shop_id integer, name text',
    sale_items: 'id integer, sale_id integer, product_id integer, quantity numeric, price_at_sale numeric, variants_json text',
    sale_inventory_consumptions: 'shop_id integer, sale_id integer, sale_item_id integer, raw_stock_id integer, quantity numeric, total_cost numeric',
    raw_stocks: 'id integer, shop_id integer, name text, unit text, conversion_factor numeric',
    recipes: 'id integer, shop_id integer',
    recipe_ingredients: 'recipe_id integer, raw_stock_id integer, quantity numeric',
    product_recipe_links: 'shop_id integer, product_id integer, recipe_id integer, variant_name text',
    raw_stock_batches: 'id integer, shop_id integer, raw_stock_id integer, buying_price numeric, created_at text',
    waste_events: 'id integer, shop_id integer, status text, created_at text',
    waste_event_items: 'waste_event_id integer, raw_stock_id integer, cost_amount numeric',
  };
  for (const [table, fields] of Object.entries(definitions)) await db.raw(`CREATE TABLE ${table} (${fields})`);
  await db('products').insert([{ id: 1, shop_id: 1, name: 'Meal' }, { id: 2, shop_id: 2, name: 'Private meal' }]);
  await db('sales').insert([
    { id: 1, shop_id: 1, order_status: 'completed', created_at: '2024-02-29 23:59:59.999', total: 220, tax_amount: 20 },
    { id: 2, shop_id: 2, order_status: 'completed', created_at: '2024-02-01', total: 999, tax_amount: 0 },
    { id: 3, shop_id: 1, order_status: 'completed', created_at: '2024-03-01', total: 999, tax_amount: 0 },
    { id: 4, shop_id: 1, order_status: 'cancelled', created_at: '2024-02-01', total: 999, tax_amount: 0 },
    { id: 5, shop_id: 1, order_status: 'completed', created_at: '2024-02-10', total: 110, tax_amount: 10 },
  ]);
  await db('sale_items').insert([1, 2, 3, 4, 5].map(id => ({ id, sale_id: id, product_id: id === 2 ? 2 : 1, quantity: id === 1 ? 2 : 1, price_at_sale: 110 })));
  await db('raw_stocks').insert([{ id: 1, shop_id: 1, name: 'Flour', unit: 'kg', conversion_factor: 1000 }, { id: 2, shop_id: 2, name: 'Secret', unit: 'kg', conversion_factor: 1 }]);
  await db('sale_inventory_consumptions').insert([{ shop_id: 1, sale_id: 1, sale_item_id: 1, raw_stock_id: 1, quantity: .5, total_cost: 10 }, { shop_id: 2, sale_id: 2, sale_item_id: 2, raw_stock_id: 2, quantity: 50, total_cost: 999 }]);
  await db('recipes').insert({ id: 1, shop_id: 1 });
  await db('recipe_ingredients').insert({ recipe_id: 1, raw_stock_id: 1, quantity: 250 });
  await db('product_recipe_links').insert({ shop_id: 1, product_id: 1, recipe_id: 1 });
  await db('raw_stock_batches').insert([{ id: 1, shop_id: 1, raw_stock_id: 1, buying_price: 40, created_at: '2024-01-01' }, { id: 2, shop_id: 1, raw_stock_id: 1, buying_price: 999, created_at: '2024-03-01' }]);
  await db('waste_events').insert([{ id: 1, shop_id: 1, status: 'recorded', created_at: '2024-02-01' }, { id: 2, shop_id: 2, status: 'recorded', created_at: '2024-02-01' }]);
  await db('waste_event_items').insert([{ waste_event_id: 1, raw_stock_id: 1, cost_amount: 3.25 }, { waste_event_id: 2, raw_stock_id: 2, cost_amount: 999 }]);
  return db;
}

test('monthly analytics reconciles sales, ledger, recipe conversion, historical costs and tenant scope', async () => {
  const db = await fixture();
  try {
    const data = await getMonthlyAnalytics(1, { year: 2024, month: 2 }, db);
    assert.equal(data.kpi.totalUnits, 3);
    assert.equal(data.kpi.totalRevenue, 300);
    assert.equal(data.kpi.bestProduct, 'Meal');
    assert.equal(data.kpi.totalIngredients, 1);
    assert.equal(data.ingredients[0].quantity, .75);
    assert.equal(data.ingredients[0].unit, 'kg');
    assert.equal(data.ingredients[0].estimated, true);
    assert.equal(data.kpi.consumptionCost, 20);
    assert.equal(data.kpi.wastageCost, 3.25);
    assert.deepEqual(await getMonthlyAnalytics(1, { year: 2024, month: 2 }, db), data, 'repeat reads are idempotent');
    const empty = await getMonthlyAnalytics(1, { year: 2023, month: 2 }, db);
    assert.equal(empty.kpi.totalUnits, 0);
    assert.deepEqual(empty.ingredients, []);
    await db('raw_stock_batches').delete();
    const missing = await getMonthlyAnalytics(1, { year: 2024, month: 2 }, db);
    assert.equal(missing.kpi.consumptionCost, null, 'missing historical cost must not be shown as zero');
    await db.schema.renameTable('waste_events', 'waste_events_offline');
    await assert.rejects(getMonthlyAnalytics(1, { year: 2024, month: 2 }, db));
    await db.schema.renameTable('waste_events_offline', 'waste_events');
    assert.equal((await getMonthlyAnalytics(1, { year: 2024, month: 2 }, db)).kpi.totalUnits, 3, 'reads recover after database availability returns');
  } finally { await db.destroy(); }
});

test('monthly HTTP API requires authentication, analytics permission and a business', async () => {
  const express = require('express');
  const app = express();
  app.use((req, res, next) => {
    if (req.headers['x-test-user']) req.session = { user: { shop_id: req.headers['x-test-shop'] } };
    req.permissions = req.headers['x-test-permission'] ? ['analytics.view'] : [];
    next();
  });
  app.use('/api/analytics', require('../routes/analytics'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const endpoint of ['monthly', 'monthly-tips']) {
      const url = `http://127.0.0.1:${server.address().port}/api/analytics/${endpoint}?month=2&year=2024`;
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, { headers: { 'x-test-user': '1' } })).status, 403);
      assert.equal((await fetch(url, { headers: { 'x-test-user': '1', 'x-test-permission': '1' } })).status, 400);
      assert.equal((await fetch(url.replace('month=2', 'month=13'), { headers: { 'x-test-user': '1', 'x-test-permission': '1', 'x-test-shop': '1' } })).status, 400);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('monthly queries reject invalid input and missing business context', async () => {
  for (const query of [{ month: 0, year: 2024 }, { month: 13, year: 2024 }, { month: 1.5, year: 2024 }, { month: 1, year: 'x' }, {}]) assert.equal(monthlyQuery.safeParse(query).success, false);
  assert.equal(monthlyQuery.safeParse({ month: '12', year: '2020' }).success, true);
  await assert.rejects(getMonthlyAnalytics(null, { year: 2024, month: 2 }), /Shop context required/);
});
