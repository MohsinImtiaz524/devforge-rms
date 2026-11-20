const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createBrandingRouter } = require('../src/modules/shops/shops.branding.routes');
test('branding exposes only the session shop logo to staff', async () => {
  const app = express(); let selected;
  app.use((req,res,next) => { if (req.headers['x-shop']) req.session = { user: { role: 'waiter', shop_id: req.headers['x-shop'] } }; next(); });
  const db = () => ({ select: (...fields) => { assert.deepEqual(fields, ['logo_data','logo_path']); return { where: ({id}) => { selected=id; return { first: async () => id===1 ? {logo_data:'shop-one'} : null }; } }; } });
  app.use('/api/shop-branding', createBrandingRouter(db));
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/shop-branding`;
  try {
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{'x-shop':'invalid'}})).status,403);
    const response = await fetch(url+'?shop_id=2',{headers:{'x-shop':'1'}});
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.deepEqual(await response.json(),{logo_url:'shop-one'}); assert.equal(selected,1);
    assert.equal((await fetch(url,{headers:{'x-shop':'2'}})).status,404);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
