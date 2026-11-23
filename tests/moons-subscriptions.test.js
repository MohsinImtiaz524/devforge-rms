const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex');
const {createMoonSubscriptions}=require('../src/modules/moons/moons.subscriptions');
test('Subscribe activates once per shop without billing and rolls back failed audits',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try {
  await db.schema.createTable('shops',t=>{t.integer('id').primary();t.string('status')});
  await db.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.string('role');t.string('status');t.boolean('must_change_password').defaultTo(false)});
  await db('shops').insert([{id:1,status:'active'},{id:2,status:'active'}]);
  await db('users').insert([{id:1,shop_id:1,role:'admin',status:'active'},{id:2,shop_id:2,role:'admin',status:'active'},{id:3,shop_id:1,role:'cashier',status:'active'}]);
  await require('../src/modules/moons/moons.migration').ensureMoonsSchema(db);
  const moon=await db('moon_catalog').where({key:'analytics'}).first();
  await db('moon_catalog').where({id:moon.id}).update({status:'published',version:1});
  const [price]=await db('moon_prices').insert({moon_id:moon.id,currency:'PKR',monthly_amount_minor:150000,catalog_version:1}).returning('id');
  const body={catalog_version:1,price_id:price.id};
  const svc=createMoonSubscriptions({db,resolvePermissions:async user=>user.role==='admin'?['settings.update']:[]});
  const actor={id:1,shop_id:1};
  await assert.rejects(svc.subscribe(null,'analytics',body),{status:401});
  await assert.rejects(svc.subscribe({id:3,shop_id:1},'analytics',body),{status:403});
  await assert.rejects(svc.subscribe({...actor,shop_id:2},'analytics',body),{status:403});
  await assert.rejects(svc.subscribe(actor,'staff',body),{status:409});
  await assert.rejects(svc.subscribe(actor,'analytics',{...body,catalog_version:0}),{status:409});
  await assert.rejects(svc.subscribe(actor,'analytics',{...body,shop_id:2}));
  assert.equal((await svc.subscribe(actor,'analytics',body)).already_subscribed,false);
  assert.equal((await svc.subscribe(actor,'analytics',body)).already_subscribed,true);
  assert.equal((await db('shop_moon_subscriptions')).length,1);
  assert.equal((await db('moon_subscription_events')).length,1);
  assert.equal((await db('moon_subscription_periods')).length,0);
  assert.equal(JSON.parse((await db('moon_subscription_events').first()).details_json).billing,false);
  assert.equal(await db('shop_moon_subscriptions').where({shop_id:2}).first(),undefined);
  await db.raw("CREATE TRIGGER reject_subscription_audit BEFORE INSERT ON moon_subscription_events BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
  await assert.rejects(svc.subscribe({id:2,shop_id:2},'analytics',body),/audit unavailable/);
  assert.equal(await db('shop_moon_subscriptions').where({shop_id:2}).first(),undefined);
  await db.raw('DROP TRIGGER reject_subscription_audit');
  await svc.subscribe({id:2,shop_id:2},'analytics',body);
  assert.equal((await db('shop_moon_subscriptions')).length,2);
 }finally{await db.destroy()}
});
