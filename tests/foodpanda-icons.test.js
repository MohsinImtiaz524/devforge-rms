const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const knex = require('knex');
const { createIconReadRouter, createIconRouter } = require('../src/modules/platform-icons/icons.routes');
const { resources } = require('../src/modules/platform-icons/icons.files');
const { ensureIconSchema } = require('../src/modules/platform-icons/icons.migration');
const { ensureOrderSourceSchema } = require('../src/modules/delivery/order-source');

test('uploaded Food Panda aliases override the empty default icon', async () => {
  const { foodpandaIconUrl } = await import('../frontend/src/modules/pos/foodpanda-icon.js');
  const rows = [
    {key:'foodpanda',label:'Foodpanda',image_url:null},
    {key:'food_panda',label:'Food Panda',image_url:'/api/files/uploaded-icon/content'},
  ];
  assert.equal(foodpandaIconUrl(rows),'/api/files/uploaded-icon/content');
  assert.equal(foodpandaIconUrl([{key:'delivery-partner',label:'Food Panda',image_url:'/custom-icon'}]),'/custom-icon');
  assert.equal(foodpandaIconUrl([{key:'foodpanda',image_url:'/canonical'},...rows]),'/canonical');
  assert.equal(foodpandaIconUrl([{key:'other',label:'Other',image_url:'/other'}]),null);
  assert.equal(foodpandaIconUrl(null),null);
});

test('historical Foodpanda reclassification preserves IDs, money, and other orders', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  try {
    await db.schema.createTable('sales', table => {
      table.increments('id'); table.integer('shop_id'); table.string('order_type'); table.string('order_source'); table.decimal('total'); table.string('order_status');
    });
    await db('sales').insert([
      {id:1,shop_id:1,order_type:'delivery',order_source:'foodpanda',total:1500,order_status:'completed'},
      {id:2,shop_id:1,order_type:'delivery',order_source:null,total:500,order_status:'pending'},
      {id:3,shop_id:2,order_type:'delivery',order_source:'foodpanda',total:2500,order_status:'cancelled'},
    ]);
    const before = await db('sales').orderBy('id');
    const { migrateFoodpandaOrderType } = require('../src/modules/delivery/order-source');
    await migrateFoodpandaOrderType(db);
    const after = await db('sales').orderBy('id');
    assert.deepEqual(after, before.map(row => row.order_source === 'foodpanda' ? {...row,order_type:'foodpanda'} : row));
    await migrateFoodpandaOrderType(db);
    assert.deepEqual(await db('sales').orderBy('id'), after);
  } finally { await db.destroy(); }
});

test('restaurant users read shared icons but cannot edit them', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  await ensureIconSchema(db);
  await db('platform_icons').insert({ key: 'foodpanda', label: 'Foodpanda', file_id: 'icon-file' });
  const runtime = { service: { metadata: async (user, id) => {
    await resources['platform.icon'].authorizeView(db, user, 'foodpanda');
    return { preview_url: '/api/files/' + id + '/content' };
  } } };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers['x-shop']) req.session = { user: { id: 1, shop_id: Number(req.headers['x-shop']), role: 'cashier' } };
    next();
  });
  app.use('/icons', createIconReadRouter(db, runtime));
  app.use('/admin/icons', createIconRouter(db, runtime));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(url + '/icons')).status, 401);
    for (const shop of [1, 2]) {
      const response = await fetch(url + '/icons', { headers: { 'x-shop': String(shop) } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.deepEqual(await response.json(), [{ key: 'foodpanda', label: 'Foodpanda', image_url: '/api/files/icon-file/content' }]);
    }
    assert.equal((await fetch(url + '/admin/icons/foodpanda', { method: 'PUT', headers: { 'x-shop': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Changed' }) })).status, 403);
    await assert.rejects(resources['platform.icon'].authorizeEdit(db, { id: 1, role: 'cashier' }, 'foodpanda'), /root administrators/);
    await assert.rejects(resources['platform.icon'].authorizeView(db, { id: 1 }, 'missing'), /not found/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.destroy();
  }
});

test('order source migration is additive and repeatable', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  try {
    await db.schema.createTable('sales', table => { table.increments('id'); table.string('order_type'); });
    await db('sales').insert({ order_type: 'delivery' });
    await ensureOrderSourceSchema(db);
    await ensureOrderSourceSchema(db);
    assert.deepEqual(await db('sales').first(), { id: 1, order_type: 'delivery', order_source: null });
  } finally { await db.destroy(); }
});
