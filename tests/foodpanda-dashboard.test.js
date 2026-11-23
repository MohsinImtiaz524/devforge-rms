const test = require('node:test');
const assert = require('node:assert/strict');
const knex = require('knex');
const { foodpandaDashboard } = require('../src/modules/integrations/foodpanda-dashboard');
const { ensureIntegrationsSchema, foodpandaSettings } = require('../src/modules/integrations/integrations.service');

test('Foodpanda dashboard isolates orders and totals and preserves history when stopped', async () => {
  const db = knex({ client:'better-sqlite3', connection:{filename:':memory:'}, useNullAsDefault:true });
  try {
    await db.schema.createTable('shops', t=>{t.increments('id');});
    await ensureIntegrationsSchema(db);
    await db('shops').insert([{id:1,foodpanda_enabled:true,foodpanda_activated:true},{id:2,foodpanda_enabled:false,foodpanda_activated:false}]);
    await db.schema.createTable('sales',t=>{
      t.increments('id');t.integer('shop_id');t.integer('order_number');t.string('order_source');t.string('order_type');t.string('order_status');t.string('customer_name');t.decimal('total');t.decimal('amount_received');t.timestamp('created_at');
    });
    const common={shop_id:1,order_type:'foodpanda',order_source:'foodpanda',customer_name:'Panda customer',total:100,amount_received:0,created_at:'2026-11-23 12:00:00'};
    await db('sales').insert(Array.from({length:25},(_,i)=>({...common,order_number:i+1,order_status:i<20?'completed':i<24?'pending':'cancelled'})));
    await db('sales').insert([{...common,shop_id:2,order_number:99,order_status:'completed',total:999999},{...common,order_type:'delivery',order_source:null,order_number:88,order_status:'completed',total:888888}]);
    const dashboard=await foodpandaDashboard(db,1);
    assert.equal(Number(dashboard.summary.total_orders),25);
    assert.equal(Number(dashboard.summary.completed_orders),20);
    assert.equal(Number(dashboard.summary.active_orders),4);
    assert.equal(Number(dashboard.summary.cancelled_orders),1);
    assert.equal(Number(dashboard.summary.completed_sales),2000);
    assert.equal(dashboard.orders.length,20);
    assert.equal(dashboard.pagination.total_pages,2);
    assert.ok(dashboard.orders.every(row=>row.order_source==='foodpanda'));
    const next=await foodpandaDashboard(db,1,{page:'2'});assert.equal(next.orders.length,5);
    assert.equal(new Set([...dashboard.orders,...next.orders].map(row=>row.id)).size,25);
    assert.equal((await foodpandaDashboard(db,1,{status:'pending'})).pagination.total,4);
    assert.equal((await foodpandaDashboard(db,1,{search:'Panda customer'})).pagination.total,25);
    await assert.rejects(foodpandaDashboard(db,1,{page:'-1'}));
    await assert.rejects(foodpandaDashboard(db,1,{status:'invalid'}));
    const before=await db('sales').orderBy('id');
    await db('shops').where({id:1}).update({foodpanda_enabled:false});
    assert.deepEqual(await foodpandaDashboard(db,1),dashboard);
    assert.deepEqual(await db('sales').orderBy('id'),before);
    assert.deepEqual(await foodpandaSettings(db,1),{enabled:false,activated:true});
    assert.equal(Number((await foodpandaDashboard(db,3)).summary.total_orders),0);
  } finally { await db.destroy(); }
});
