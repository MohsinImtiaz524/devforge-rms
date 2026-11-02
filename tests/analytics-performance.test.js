const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const knex = require('knex');
function load(file, db, dependencies = {}) {
  const context = { module: { exports: {} }, console, require(name) {
    if (name.includes('knex')) return db;
    if (dependencies[name]) return dependencies[name];
    if (name === 'zod') return require('zod');
    throw Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  return context.module.exports;
}
async function fixture() {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  const tables = {
    sales: 'id integer primary key, shop_id integer, order_status text, created_at text, total real, tax_amount real, tax_percentage real, amount_received real, discount real, customer_id integer, payment_method text, order_type text, user_id integer, payment_receiver_id integer, payment_received_at text',
    sale_items: 'id integer primary key, sale_id integer, product_id integer, quantity real, buying_price_at_sale real, price_at_sale real',
    returns: 'id integer primary key, shop_id integer, sale_id integer, created_at text, total_refund real',
    return_items: 'id integer primary key, return_id integer, sale_item_id integer, product_id integer, quantity real, refund_price real, buying_price_at_sale real',
    products: 'id integer primary key, shop_id integer, name text, category text, image_path text, stock real, product_type text, brand_id integer, is_deleted integer',
    brands: 'id integer primary key, shop_id integer, name text, user_id integer, partner_type text, ownership_percent real',
    users: 'id integer primary key, shop_id integer, name text, username text, role text',
    customers: 'id integer primary key, shop_id integer',
    product_batches: 'id integer primary key, shop_id integer, product_id integer, quantity real, buying_price real',
    raw_stocks: 'id integer primary key, shop_id integer, is_deleted integer',
    raw_stock_batches: 'id integer primary key, shop_id integer, raw_stock_id integer, quantity real, buying_price real',
    waste_events: 'id integer primary key, shop_id integer, status text, created_at text, cost_amount real, product_id integer'
  };
  for (const [table, fields] of Object.entries(tables)) await db.raw(`CREATE TABLE ${table} (${fields})`);
  await db('users').insert({ id: 1, shop_id: 1, name: 'Owner', role: 'admin' });
  await db('brands').insert([{ id: 1, shop_id: 1, user_id: 1, name: 'Owner', partner_type: 'share_based', ownership_percent: 100 }, { id: 2, shop_id: 1, name: 'Partner', partner_type: 'share_based', ownership_percent: 25 }]);
  await db('products').insert([{ id: 1, shop_id: 1, name: 'Meal', category: 'Food', stock: 10, brand_id: 1, is_deleted: 0 }, { id: 2, shop_id: 2, name: 'Private meal', category: 'Food', stock: 10, is_deleted: 0 }]);
  const sale = { order_status: 'completed', created_at: '2024-02-10 12:00:00', tax_percentage: 10, payment_method: 'cash', order_type: 'dine_in', user_id: 1 };
  await db('sales').insert([{ ...sale, id: 1, shop_id: 1, total: 110, tax_amount: 10, amount_received: 110, discount: 10, customer_id: 1 }, { ...sale, id: 2, shop_id: 1, total: 55, tax_amount: 5, amount_received: 30 }, { ...sale, id: 3, shop_id: 2, total: 99999, tax_amount: 0 }, { ...sale, id: 4, shop_id: 1, total: 99999, created_at: '2023-01-01', tax_amount: 0 }]);
  await db('sale_items').insert([{ id: 1, sale_id: 1, product_id: 1, quantity: 2, price_at_sale: 50, buying_price_at_sale: 20 }, { id: 2, sale_id: 2, product_id: 1, quantity: 1, price_at_sale: 50, buying_price_at_sale: 10 }, { id: 3, sale_id: 3, product_id: 2, quantity: 999, price_at_sale: 999, buying_price_at_sale: 999 }]);
  await db('returns').insert({ id: 1, shop_id: 1, sale_id: 1, created_at: '2024-02-11', total_refund: 11 });
  await db('return_items').insert({ id: 1, return_id: 1, sale_item_id: 1, product_id: 1, quantity: 1, refund_price: 11, buying_price_at_sale: 20 });
  await db('waste_events').insert({ id: 1, shop_id: 1, product_id: 1, status: 'recorded', created_at: '2024-02-12', cost_amount: 5 });
  const brandService = load('../services/BrandService', db);
  const service = load('../services/AnalyticsService', db, { './BrandService': brandService, '../src/modules/tips/tips.service': { summary: async () => ({ total_tips: 0 }) } });
  return { db, service, brandService };
}

test('real SQL preserves tax, returns, COGS, ownership and tenant isolation without writing on reads', async () => {
  const { db, service, brandService } = await fixture();
  try {
    const before = await db('brands').orderBy('id');
    const queries = []; db.on('query', query => queries.push(query.sql));
    const data = await service.getDashboardData(1, 'custom', '2024-02-01', '2024-02-29');
    assert.equal(data.kpi.totalSales, 140);
    assert.equal(data.kpi.totalOrders, 2);
    assert.equal(data.kpi.activeCustomers, 2);
    assert.equal(data.summary.totalDiscounts, 10);
    assert.equal(data.summary.grossProfit, 110);
    assert.equal(data.summary.shopProfit, 105);
    assert.ok(Math.abs(data.summary.totalTax - (10 + 30 * 5 / 55 - 1)) < .000001);
    assert.equal(data.topProducts.length, 1);
    assert.equal(data.topProducts[0].quantity_sold, 2);
    const brands = await brandService.listBrandsForReporting(1);
    assert.equal(brands.find(row => row.id === 1).ownership_percent, 75);
    assert.deepEqual(await db('brands').orderBy('id'), before, 'ownership remains unchanged in storage');
    assert.ok(queries.every(sql => /^select/i.test(sql)), 'reporting issues SELECTs only');
    const overviewQueries=[];
    const record=query=>overviewQueries.push(query.sql);db.on('query',record);
    const overview=await service.getDashboardData(1,'custom','2024-02-01','2024-02-29',null,'overview');
    db.removeListener('query',record);
    assert.equal(overviewQueries.length,4);
    assert.equal(overview.kpi.totalSales,data.kpi.totalSales);
    assert.equal(overview.kpi.avgOrderValue,data.kpi.avgOrderValue);
    assert.equal(Object.keys(overview.kpi).length,3);
    assert.equal(overview.summary,undefined);
    assert.equal(overview.topProducts,undefined);
    const customer = await service.getDashboardData(1, 'custom', '2024-02-01', '2024-02-29', null, 'customers');
    assert.equal(customer.kpi.activeCustomers, 2);
    const empty = await service.getDashboardData(1, 'custom', '2022-01-01', '2022-01-31', null, 'overview');
    assert.equal(empty.kpi.totalSales, 0);
    assert.equal(empty.trendSeries.length, 0);
  } finally { await db.destroy(); }
});

test('allocation benchmark excludes unrelated tenant history and uses indexed lookups', async () => {
  const { db } = await fixture();
  try {
    await db.raw(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<30000)
      INSERT INTO sales(id,shop_id,order_status,created_at,total,tax_amount)
      SELECT x+100,2,'completed','2024-02-10',110,10 FROM n`);
    await db.raw(`INSERT INTO sale_items(id,sale_id,product_id,quantity,price_at_sale,buying_price_at_sale)
      SELECT id,id,2,1,100,20 FROM sales WHERE id>100`);
    await db.raw('CREATE INDEX idx_analytics_sales_shop_status_created ON sales(shop_id,order_status,created_at)');
    await db.raw('CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id)');
    const global = 'SELECT sale_id,SUM(quantity*price_at_sale) AS item_subtotal FROM sale_items GROUP BY sale_id';
    const scoped = `SELECT totals_si.sale_id,SUM(totals_si.quantity*totals_si.price_at_sale) AS item_subtotal
      FROM sale_items totals_si JOIN sales totals_s ON totals_s.id=totals_si.sale_id
      WHERE totals_s.shop_id=1 AND totals_s.order_status='completed'
      AND totals_s.created_at BETWEEN '2024-02-01' AND '2024-02-29 23:59:59' GROUP BY totals_si.sale_id`;
    const query = inner => `SELECT SUM(si.quantity*si.price_at_sale*(s.total-s.tax_amount)/item_totals.item_subtotal) AS sales
      FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN (${inner}) item_totals ON item_totals.sale_id=si.sale_id
      WHERE s.shop_id=1 AND s.order_status='completed' AND s.created_at BETWEEN '2024-02-01' AND '2024-02-29 23:59:59'`;
    assert.equal((await db.raw(query(global)))[0].sales, (await db.raw(query(scoped)))[0].sales);
    const measure = async sql => {
      await db.raw(sql); const times = [];
      for (let i=0;i<7;i++) { const start=performance.now(); await db.raw(sql); times.push(performance.now()-start); }
      return times.sort((a,b)=>a-b)[3];
    };
    const before = await measure(query(global)), after = await measure(query(scoped));
    const plan = await db.raw('EXPLAIN QUERY PLAN '+scoped);
    assert.ok(plan.some(row => row.detail.includes('idx_analytics_sales_shop_status_created')));
    assert.equal((await db.raw(scoped)).length, 2);
    console.log(`SQLite allocation benchmark, 30,000 unrelated sales, median of 7: global ${before.toFixed(2)}ms; scoped ${after.toFixed(2)}ms.`);
  } finally { await db.destroy(); }
});
