const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

test('order update returns committed result while notification delivery is still pending', async t => {
  let releasePush;
  const pendingPush = new Promise(resolve => { releasePush = resolve; });
  let notificationStarted = false;
  const service = {
    async updateSaleItems(id, payload, shopId, userId, options) {
      assert.equal(shopId, 7); assert.equal(userId, 3);
      assert.equal(options.canRemoveItems, true);
      options.onCommittedNotification({ saleId: id, shopId, editorId: userId });
      return { saleId: id, print_jobs_queued: 2, total: 500 };
    },
    async notifyUpdatedOrder(payload) { notificationStarted = true; assert.equal(payload.shopId, 7); await pendingPush; }
  };
  for (const [name, exports] of [['../services/SalesService', service], ['../utils/publish-order-change', async () => {}]]) {
    const filename = require.resolve(name);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  }
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: 3, shop_id: 7, role: 'admin' } }; req.permissions = ['orders.remove_items']; next(); });
  app.use('/api/sales', require('../routes/sales'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { releasePush(); await new Promise(resolve => server.close(resolve)); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/sales/12/items`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000)
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).print_jobs_queued, 2);
  assert.match(response.headers.get('server-timing'), /order-save;dur=/);
  assert.equal(notificationStarted, true);
  // Push remains unresolved: the response must not have waited for it.
  releasePush();
});
