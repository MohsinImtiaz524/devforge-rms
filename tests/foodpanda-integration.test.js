const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const knex = require('knex');
const { ensureIntegrationsSchema } = require('../src/modules/integrations/integrations.service');
const { createIntegrationsRouter } = require('../src/modules/integrations/integrations.routes');

test('Foodpanda defaults off, requires settings permission, and isolates shop settings', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  await db.schema.createTable('shops', table => { table.increments('id'); });
  await db('shops').insert([{ id: 1 }, { id: 2 }]);
  await ensureIntegrationsSchema(db);
  await ensureIntegrationsSchema(db);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers['x-shop']) req.session = { user: { id: 1, shop_id: Number(req.headers['x-shop']), role: 'admin' } };
    req.permissions = req.headers['x-manage'] ? ['settings.update'] : [];
    next();
  });
  app.use('/integrations', createIntegrationsRouter(db));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/integrations/foodpanda';
  const get = shop => fetch(url, { headers: { 'x-shop': String(shop) } });
  const put = (body, manage = true) => fetch(url, { method: 'PUT', headers: { 'x-shop': '1', ...(manage ? { 'x-manage': '1' } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url+'/orders',{headers:{'x-shop':'1'}})).status,403);
    assert.deepEqual(await (await get(1)).json(), { enabled: false, activated: false, can_manage: false });
    assert.equal((await put({ enabled: true }, false)).status, 403);
    assert.equal((await put({ enabled: 'true' })).status, 400);
    assert.equal((await put({ enabled: true, shop_id: 2 })).status, 200);
    assert.equal((await (await get(1)).json()).enabled, true);
    assert.equal((await (await get(2)).json()).enabled, false);
    assert.equal((await put({ enabled: true })).status, 200);
    assert.equal((await put({ enabled: false })).status, 200);
    assert.deepEqual(await (await get(1)).json(), {enabled:false,activated:true,can_manage:false});
    assert.equal((await get(99)).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.destroy();
  }
});
