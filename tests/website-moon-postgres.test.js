const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex'),crypto=require('node:crypto');
// Explicit disposable database only. Never use DATABASE_URL as a fallback.
test('Website Moon PostgreSQL migration, publication, tenant constraints and row locks',{skip:!process.env.WEBSITE_TEST_DATABASE_URL},async()=>{
 const db=knex({client:'pg',connection:process.env.WEBSITE_TEST_DATABASE_URL,pool:{min:0,max:2}}),name='website_test_'+crypto.randomBytes(8).toString('hex'),rollback=new Error('ROLLBACK_FIXTURE');
 try{await db.transaction(async trx=>{
  await trx.raw('CREATE SCHEMA ??',[name]);await trx.raw('SET LOCAL search_path TO ??',[name]);
  await trx.schema.createTable('shops',t=>{t.integer('id').primary();t.string('status');});await trx.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.string('role');t.string('status');t.boolean('must_change_password');});
  await trx('shops').insert([{id:1,status:'active'},{id:2,status:'active'}]);await trx('users').insert({id:1,shop_id:1,role:'admin',status:'active',must_change_password:false});
  const {ensureWebsiteSchema}=require('../src/modules/moons/website/website.migration');await ensureWebsiteSchema(trx);await ensureWebsiteSchema(trx);
  const {createWebsiteService}=require('../src/modules/moons/website/website.service'),{defaults}=require('../src/modules/moons/website/website.schema');
  const service=createWebsiteService({db:trx,resolvePermissions:async()=>['website.view','website.edit','website.publish'],domain:()=> 'sites.example.test'}),actor={id:1,shop_id:1};
  let row=await service.save(actor,{revision:0,subdomain:'shop-one',configuration:defaults()});await service.publish(actor,{revision:row.revision});await service.publish(actor,{revision:row.revision});
  assert.equal((await trx('moon_website_versions')).length,1);assert.equal((await trx('moon_website_events').where({action:'publish'})).length,1);
  await assert.rejects(trx.transaction(tx=>tx('moon_website_versions').insert({shop_id:2,website_id:row.id,revision:2,configuration_json:'{}'})),{code:'23503'});
  await assert.rejects(trx.transaction(tx=>tx('moon_websites').insert({shop_id:2,subdomain:'shop-one',draft_json:'{}'})),{code:'23505'});
  await service.save(actor,{revision:1,subdomain:'shop-one',configuration:{...defaults(),businessName:'Private draft'}});
  assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.businessName,'Your business');
  await service.unpublish(actor,{revision:2});await assert.rejects(service.publicWebsite('shop-one.sites.example.test'),{status:404});throw rollback;
 });}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
});

test('Website Moon independent PostgreSQL connections serialize publishing and reject stale concurrent saves',{skip:!process.env.WEBSITE_TEST_DATABASE_URL},async()=>{
 const name='website_concurrency_'+crypto.randomBytes(8).toString('hex');
 if(!/^website_concurrency_[a-f0-9]{16}$/.test(name))throw new Error('Invalid disposable schema name.');
 const control=knex({client:'pg',connection:process.env.WEBSITE_TEST_DATABASE_URL,pool:{min:0,max:1},acquireConnectionTimeout:15000});let isolated,created=false;
 try{
  await control.raw('CREATE SCHEMA ??',[name]);created=true;
  isolated=knex({client:'pg',connection:process.env.WEBSITE_TEST_DATABASE_URL,pool:{min:0,max:3,afterCreate:(connection,done)=>connection.query('SET search_path TO "'+name+'"; SET statement_timeout TO 15000',error=>done(error,connection))},acquireConnectionTimeout:20000});
  await isolated.schema.createTable('shops',t=>{t.integer('id').primary();t.string('status');});
  await isolated.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.string('role');t.string('status');t.boolean('must_change_password');});
  await isolated('shops').insert([{id:1,status:'active'},{id:2,status:'active'}]);await isolated('users').insert([{id:1,shop_id:1,role:'admin',status:'active',must_change_password:false},{id:2,shop_id:2,role:'admin',status:'active',must_change_password:false}]);
  await isolated.transaction(require('../src/modules/moons/website/website.migration').ensureWebsiteSchema);
  const {createWebsiteService}=require('../src/modules/moons/website/website.service'),{defaults}=require('../src/modules/moons/website/website.schema');
  const service=createWebsiteService({db:isolated,resolvePermissions:async()=>['website.view','website.edit','website.publish'],domain:()=> 'sites.example.test'}),actor={id:1,shop_id:1};
  const draft={revision:0,subdomain:'shop-one',configuration:defaults()};await service.save(actor,draft);
  const published=await Promise.all([service.publish(actor,{revision:1}),service.publish(actor,{revision:1})]);assert.ok(published.every(row=>row.status==='published'));
  assert.equal((await isolated('moon_website_versions')).length,1);assert.equal((await isolated('moon_website_events').where({action:'publish'})).length,1);
  const writes=await Promise.allSettled([service.save(actor,{...draft,revision:1,configuration:{...defaults(),businessName:'First writer'}}),service.save(actor,{...draft,revision:1,configuration:{...defaults(),businessName:'Second writer'}})]);
  assert.equal(writes.filter(row=>row.status==='fulfilled').length,1);assert.equal(writes.filter(row=>row.status==='rejected'&&row.reason.status===409).length,1);
  assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.businessName,'Your business');
  await service.publish(actor,{revision:2});assert.equal((await isolated('moon_website_versions')).length,2);
  const duplicate=await Promise.allSettled([service.save({id:2,shop_id:2},draft),service.save({id:2,shop_id:2},draft)]);assert.ok(duplicate.every(row=>row.status==='rejected'&&row.reason.code==='23505'));
 }finally{
  if(isolated)await isolated.destroy();
  // Only the generated fixture schema is ever removed, never public or application tables.
  if(created)await control.raw('DROP SCHEMA ?? CASCADE',[name]);
  await control.destroy();
 }
});
