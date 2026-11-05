const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'customers.js'), 'utf8');
const reportRoute = source.slice(source.indexOf('router.get("/:id/report.pdf"'));

test('customer sales report batches item loading without per-sale queries', () => {
  assert.ok(reportRoute.includes('INNER JOIN sales s ON s.id = si.sale_id'));
  assert.ok(reportRoute.includes('WHERE s.shop_id ='));
  assert.ok(reportRoute.includes('const itemsBySaleId = new Map()'));
  assert.ok(reportRoute.includes('items: itemsBySaleId.get(String(sale.id)) || []'));
  assert.equal(reportRoute.includes('Promise.all(sales.map(async (sale)'), false);
  assert.equal(reportRoute.includes('WHERE si.sale_id = ${isPostgres'), false);
});
