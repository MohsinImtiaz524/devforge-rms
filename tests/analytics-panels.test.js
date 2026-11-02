const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const queries = [];
  let tipsCalls = 0, fail = false;
  const db = table => {
    const entry = { table, scope: [] }; queries.push(entry);
    let query;
    query = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve, reject) => fail ? reject(new Error('database offline')) : resolve([]);
      if (key === 'first') return async () => { if (fail) throw new Error('database offline'); return { val: 0, total_sales: 100, total_orders: 2, avg_order_value: 50 }; };
      return (...args) => { if (key === 'modify') args[0](query); if (key === 'where') entry.scope.push(args); return query; };
    }});
    return query;
  };
  db.client = { config: { client: 'better-sqlite3' } };
  db.raw = (...args) => args;
  const context = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name.includes('knex')) return db;
    if (name.includes('BrandService')) return { listBrandsForReporting: async () => [] };
    if (name.includes('tips.service')) return { summary: async () => { tipsCalls++; return { total_tips: 0 }; } };
    throw Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/AnalyticsService'), 'utf8'), context);
  return { service: context.module.exports, queries, tipsCalls: () => tipsCalls, fail: value => { fail = value; } };
}

test('panel queries skip unrelated work, preserve metrics, and retain tenant scope', async () => {
  const full = harness(); const baseline = await full.service.getDashboardData(7, '7days');
  const panels = {};
  for (const panel of ['overview', 'sales', 'customers', 'inventory', 'profit', 'staff', 'channels']) {
    const h = harness(); const data = await h.service.getDashboardData(7, '7days', null, null, null, panel);
    panels[panel] = h;
    assert.ok(h.queries.length < full.queries.length, panel + ' must issue fewer queries');
    assert.ok(h.queries.filter(query => query.table !== 'sale_items').every(query => query.scope.some(args => args.includes(7) || args.some(arg => arg && arg.shop_id === 7))), panel + ' queries remain shop scoped');
    if (['overview', 'sales', 'profit'].includes(panel)) assert.equal(data.kpi.totalSales, baseline.kpi.totalSales);
    assert.equal(h.tipsCalls(), 0);
    console.log(panel + ': ' + h.queries.length + ' queries; full dashboard: ' + full.queries.length);
  }
  assert.equal(panels.overview.queries.length,4,'Overview has a four-query budget');
  assert.ok(!panels.overview.queries.some(q=>/sale_items|return_items|batches|waste|customers/.test(q.table)),'Overview never scans detailed product, stock or customer data');
  assert.equal(panels.staff.queries.length, 1);
  assert.equal(panels.channels.queries.length, 2);
  assert.ok(!panels.sales.queries.some(q => /batches|waste|customers/.test(q.table)));
});

test('failed panel queries propagate and recover; duplicate and concurrent reads stay isolated', async () => {
  const h = harness(); h.fail(true);
  await assert.rejects(h.service.getDashboardData(7, '7days', null, null, null, 'staff'), /database offline/);
  h.fail(false);
  const results = await Promise.all([7, 8, 7].map(shop => h.service.getDashboardData(shop, '7days', null, null, null, 'staff')));
  assert.equal(results[0].totalPaymentsReceived, results[2].totalPaymentsReceived);
  assert.ok(h.queries.some(q => q.scope.some(args => args.includes(8))));
});

test('panel API validates navigation, enforces permission, and uses the session tenant', async () => {
  const express = require('express');
  const service = require('../services/AnalyticsService');
  const original = service.getDashboardData;
  const calls = [];
  service.getDashboardData = async (...args) => { calls.push(args); return { panel: args[5] }; };
  const app = express();
  app.use((req, res, next) => {
    req.session = req.headers['x-user'] ? { user: { id: 1, shop_id: 7, role: 'admin' } } : {};
    req.permissions = req.headers['x-permission'] ? ['analytics.view'] : [];
    next();
  });
  app.use('/api/analytics', require('../routes/analytics'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/analytics/dashboard-data?panel=staff&shop_id=99`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { 'x-user': '1' } })).status, 403);
    const headers = { 'x-user': '1', 'x-permission': '1' };
    assert.equal((await fetch(url.replace('panel=staff', 'panel=invalid'), { headers })).status, 400);
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('server-timing'), /^analytics;dur=\d/);
    assert.equal(calls[0][0], 7);
    assert.equal(calls[0][5], 'staff');
    await fetch(url.replace('panel=staff&', ''), { headers });
    assert.equal(calls[1][5], undefined, 'legacy callers retain full dashboard mode');
  } finally {
    service.getDashboardData = original;
    await new Promise(resolve => server.close(resolve));
    await require('../db/knex').destroy();
  }
});
