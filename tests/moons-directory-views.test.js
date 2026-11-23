const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex');
const {createDirectoryService}=require('../src/modules/moons/moons.directory');

test('directory attaches only the current shop subscription status without writing subscriptions',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try {
  await db.schema.createTable('shops',t=>{t.integer('id');t.string('status')});
  await db.schema.createTable('users',t=>{t.integer('id');t.integer('shop_id');t.string('status')});
  await db.schema.createTable('shop_moon_subscriptions',t=>{t.integer('shop_id');t.integer('moon_id');t.string('state')});
  await db('shops').insert([{id:1,status:'active'},{id:2,status:'active'}]);
  await db('users').insert([{id:1,shop_id:1,status:'active'},{id:2,shop_id:2,status:'active'}]);
  await db('shop_moon_subscriptions').insert([{shop_id:1,moon_id:5,state:'active'},{shop_id:2,moon_id:5,state:'ended'}]);
  const before=await db('shop_moon_subscriptions').orderBy('shop_id');
  const catalogRow={id:5,key:'analytics',name:'Analytics'};
  const service=createDirectoryService({db,catalog:{published:async()=>[catalogRow]}});
  const first=await service.list({id:1,shop_id:1,role:'admin'},['analytics.view']);
  const second=await service.list({id:2,shop_id:2,role:'admin'},['analytics.view']);
  assert.deepEqual(first[0].subscription,{state:'active'});
  assert.deepEqual(second[0].subscription,{state:'ended'});
  assert.equal((await service.list({id:3,role:'superadmin'},[]))[0].subscription,null);
  assert.equal(catalogRow.subscription,undefined);
  assert.deepEqual(await db('shop_moon_subscriptions').orderBy('shop_id'),before);
 } finally {await db.destroy()}
});
