const test=require('node:test');
const assert=require('node:assert/strict');
const knex=require('knex');
const crypto=require('node:crypto');
// Opt-in disposable/staging database only. Never fall back to DATABASE_URL.
test('Moons PostgreSQL migration, row locks and composite tenant constraints', {skip: !process.env.MOONS_TEST_DATABASE_URL}, async()=>{
 const db=knex({client:'pg',connection:process.env.MOONS_TEST_DATABASE_URL,pool:{min:0,max:2}});
 const schema='moons_test_'+crypto.randomBytes(8).toString('hex');
 const rollback=new Error('ROLLBACK_TEST_FIXTURE');
 try{
  await db.transaction(async trx=>{
   await trx.raw('CREATE SCHEMA ??',[schema]);await trx.raw('SET LOCAL search_path TO ??',[schema]);
   await trx.schema.createTable('shops',t=>{t.integer('id').primary();});
   await trx.schema.createTable('users',t=>{t.integer('id').primary();});
   await trx('shops').insert([{id:1},{id:2}]);await trx('users').insert({id:1});
   const {ensureMoonsSchema}=require('../src/modules/moons/moons.migration');
   await ensureMoonsSchema(trx);await ensureMoonsSchema(trx);
   assert.equal((await trx('moon_catalog')).length,3);
   const moon=await trx('moon_catalog').where({key:'analytics'}).forUpdate().first();
   const [price]=await trx('moon_prices').insert({moon_id:moon.id,currency:'PKR',monthly_amount_minor:300000,catalog_version:1,created_by:1}).returning('id');
   await trx('shop_moon_subscriptions').insert({id:1,shop_id:1,moon_id:moon.id,current_price_id:price.id});
   // Savepoints allow constraint-error checks without aborting the outer test transaction.
   await assert.rejects(trx.transaction(async savepoint=>savepoint('moon_subscription_events').insert({shop_id:2,subscription_id:1,action:'invalid',details_json:'{}'})),{code:'23503'});
   await assert.rejects(trx.transaction(async savepoint=>savepoint('shop_moon_subscriptions').insert({shop_id:2,moon_id:moon.id,state:'active'})),{code:'23514'});
   await trx('moon_subscription_periods').insert({shop_id:1,moon_id:moon.id,subscription_id:1,price_id:price.id,service_start:'2026-11-01T00:00:00Z',service_end:'2026-12-01T00:00:00Z',monthly_price_minor:300000,currency:'PKR',billing_kind:'paid'});
   throw rollback; // All test tables/schema roll back, even on successful checks.
  });
 }catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
});
