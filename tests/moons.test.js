const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const knex=require('knex');
const {ensureMoonsSchema}=require('../src/modules/moons/moons.migration');
const {createMoonsService}=require('../src/modules/moons/moons.service');
const {createFilesService}=require('../src/modules/files/files.service');
const {resources}=require('../src/modules/moons/moons.files');
const {policy,scope}=require('../src/modules/files/files.policies');
const {createMoonsRouter}=require('../src/modules/moons/moons.routes');
const {createCsrfProtection}=require('../src/modules/session-security/csrf');
const {ALL_PERMISSION_KEYS}=require('../authorization/catalog');

async function fixture() {
  const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
  await db.raw('PRAGMA foreign_keys=ON');
  await db.schema.createTable('shops',t=>{t.integer('id').primary();t.string('status');});
  await db.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.string('status').defaultTo('active');});
  await db('shops').insert([{id:1,status:'active'},{id:2,status:'active'},{id:3,status:'blocked'}]);
  await db('users').insert([{id:1,shop_id:null},{id:2,shop_id:1},{id:3,shop_id:2},{id:4,shop_id:null}]);
  await db.transaction(ensureMoonsSchema);
  await require('../src/modules/files/files.migration').ensureFilesSchema(db);
  const fileService=createFilesService({db,resources,config:{unattachedHours:24}});
  const service=createMoonsService({db,files:()=>({enabled:()=>true,service:fileService})});
  return {db,service,files:fileService};
}
const admin={id:1,role:'superadmin'}, shop={id:2,shop_id:1,role:'admin'};
const metadata=(row,overrides={})=>({version:row.version,name:row.name,summary:row.summary,description:'Details for this Moon.',category:row.category,sort_order:row.sort_order,...overrides});

test('Moons catalog migration, services and storage boundaries',async t=>{
 const saved=process.env.MOONS_ENABLED;process.env.MOONS_ENABLED='true';
 const {db,service,files}=await fixture();
 try {
  await t.test('migration is repeatable and never creates subscriptions or charges',async()=>{
    await db.transaction(ensureMoonsSchema);
    assert.equal((await service.list(admin)).length,3);
    assert.equal((await db('shop_moon_subscriptions')).length,0);
    assert.equal(await db.schema.hasTable('billing_invoices'),false);
    assert.ok((await service.list(admin)).every(row=>row.status==='draft' && row.price===null));
  });
  await t.test('shop actors cannot list or mutate platform catalog even with guessed IDs',async()=>{
    for(const actor of [shop,{id:3,shop_id:2,role:'manager'},null]){
      await assert.rejects(service.list(actor),{status:403});
      await assert.rejects(service.update(actor,'analytics',{}),{status:403});
      await assert.rejects(service.price(actor,'analytics',{}),{status:403});
      await assert.rejects(service.status(actor,'analytics',{}),{status:403});
      await assert.rejects(service.history(actor,'analytics'),{status:403});
    }
  });
  await t.test('registry keys, metadata and monetary input are strictly validated',async()=>{
    const row=(await service.list(admin))[0];
    await assert.rejects(service.update(admin,'invented',metadata(row)),{status:404});
    await assert.rejects(service.update(admin,row.key,metadata(row,{route:'/api/secrets'})),error=>Boolean(error.issues));
    await assert.rejects(service.price(admin,row.key,{version:0,currency:'PKR',monthly_amount_minor:1.5}),error=>Boolean(error.issues));
    await assert.rejects(service.price(admin,row.key,{version:0,currency:'PKR',monthly_amount_minor:-1}),error=>Boolean(error.issues));
  });
  await t.test('metadata edits and offered price snapshots preserve history',async()=>{
    let row=(await service.list(admin)).find(row=>row.key==='staff');
    row=await service.update(admin,row.key,metadata(row,{name:'People'}));
    await db.transaction(ensureMoonsSchema);
    assert.equal((await service.list(admin)).find(row=>row.key==='staff').name,'People');
    row=await service.price(admin,row.key,{version:row.version,currency:'PKR',monthly_amount_minor:0});
    assert.equal(Number(row.price.monthly_amount_minor),0);
    const firstPrice=row.price.id;
    row=await service.price(admin,row.key,{version:row.version,currency:'PKR',monthly_amount_minor:300000});
    assert.notEqual(firstPrice,row.price.id);
    assert.equal(Number((await db('moon_prices').where({id:firstPrice}).first()).monthly_amount_minor),0);
    assert.equal((await service.history(admin,row.key)).events.length,3);
    assert.equal((await db('shop_moon_subscriptions')).length,0);
  });
  await t.test('duplicate and concurrent stale writes do not create a second price',async()=>{
    let row=(await service.list(admin)).find(row=>row.key==='analytics');
    const data={version:row.version,currency:'PKR',monthly_amount_minor:50000};
    const results=await Promise.allSettled([service.price(admin,row.key,data),service.price(admin,row.key,data)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.find(result=>result.status==='rejected').reason.publicCode,'MOON_VERSION_CONFLICT');
    assert.equal((await db('moon_prices').where({moon_id:row.id})).length,1);
    await assert.rejects(service.price(admin,row.key,data),{publicCode:'MOON_VERSION_CONFLICT'});
  });
  await t.test('publication requires implementation, details and an offered price',async()=>{
    let row=(await service.list(admin)).find(row=>row.key==='website');
    await assert.rejects(service.status(admin,row.key,{version:row.version,status:'published'}),{publicCode:'MOON_NOT_IMPLEMENTED'});
    const staff=(await service.list(admin)).find(row=>row.key==='staff');
    await assert.rejects(service.status(admin,staff.key,{version:staff.version,status:'published'}),{publicCode:'MOON_NOT_LAUNCH_READY'});
    row=(await service.list(admin)).find(row=>row.key==='analytics');
    await assert.rejects(service.status(admin,row.key,{version:row.version,status:'published'}),{publicCode:'MOON_DETAILS_REQUIRED'});
    row=await service.update(admin,row.key,metadata(row));
    row=await service.status(admin,row.key,{version:row.version,status:'published'});
    assert.equal(row.status,'published');
  });
  await t.test('catalog artwork is verified, platform-owned and visible only on published entries',async()=>{
    let row=(await service.list(admin)).find(row=>row.key==='analytics');
    row=await service.status(admin,row.key,{version:row.version,status:'draft'});
    const id=crypto.randomUUID();
    await db('files').insert({id,scope_key:'platform',uploader_id:1,purpose:'moon.icon',original_name:'icon.png',storage_key:'files/final/'+id,status:'ready',mime_type:'image/png',verified_bytes:100});
    row=await service.update(admin,row.key,metadata(row,{icon_ids:[id]}));
    assert.equal(row.artwork[0].id,id);
    await assert.rejects(files.metadata(shop,id),{status:404});
    row=await service.status(admin,row.key,{version:row.version,status:'published'});
    assert.equal((await files.metadata(shop,id)).id,id);
    assert.equal((await files.metadata({id:3,shop_id:2,role:'admin'},id)).id,id); // published catalog artwork is shared, private data is not.
    await assert.rejects(files.metadata({id:9,role:'admin',shop_id:3},id),{status:404});
    await assert.rejects(files.metadata({id:9,role:'admin',shop_id:999},id),{status:404});
    row=await service.status(admin,row.key,{version:row.version,status:'archived'});
    await assert.rejects(files.metadata(shop,id),{status:404});
    assert.equal((await files.metadata(admin,id)).id,id);
    row=await service.update(admin,row.key,metadata(row));
    assert.equal(row.artwork[0].id,id); // omitted slots preserve artwork.
  });
  await t.test('invalid and another uploader artwork rolls back metadata, version and attachment changes',async()=>{
    const row=(await service.list(admin)).find(row=>row.key==='analytics');
    const id=crypto.randomUUID();
    await db('files').insert({id,scope_key:'platform',uploader_id:4,purpose:'moon.icon',original_name:'other.png',storage_key:'files/final/'+id,status:'ready',mime_type:'image/png',verified_bytes:10});
    await assert.rejects(service.update(admin,row.key,metadata(row,{name:'Should roll back',icon_ids:[id]})),{status:403});
    await assert.rejects(service.update(admin,row.key,metadata(row,{icon_ids:[crypto.randomUUID()]})),{publicCode:'FILE_NOT_READY'});
    const current=(await service.list(admin)).find(item=>item.key===row.key);
    assert.equal(current.name,row.name);assert.equal(current.version,row.version);assert.equal(current.artwork[0].id,row.artwork[0].id);
    const disabled=createMoonsService({db,files:()=>({enabled:()=>false})});
    await assert.rejects(disabled.update(admin,row.key,metadata(row,{icon_ids:[]})),{publicCode:'FILES_DISABLED'});
  });
  await t.test('audit insert failure rolls back catalog and can be retried',async()=>{
    let row=(await service.list(admin)).find(item=>item.key==='analytics');
    await db.raw("CREATE TRIGGER reject_moon_event BEFORE INSERT ON moon_catalog_events BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END");
    await assert.rejects(service.update(admin,row.key,metadata(row,{name:'Rollback'})));
    assert.equal((await db('moon_catalog').where({id:row.id}).first()).version,row.version);
    await db.raw('DROP TRIGGER reject_moon_event');
    row=await service.update(admin,row.key,metadata(row,{name:'Recovered'}));assert.equal(row.name,'Recovered');
  });
  await t.test('subscription foundation prevents cross-shop event links and invalid periods',async()=>{
    const moon=(await service.list(admin))[0];
    await db('shop_moon_subscriptions').insert({id:1,shop_id:1,moon_id:moon.id,state:'ended'});
    await assert.rejects(db('moon_subscription_events').insert({shop_id:2,subscription_id:1,action:'test',details_json:'{}'}));
    await assert.rejects(db('shop_moon_subscriptions').insert({shop_id:2,moon_id:moon.id,state:'active'}));
    await assert.rejects(db('shop_moon_subscriptions').insert({shop_id:1,moon_id:moon.id,state:'ended'}));
  });
  await t.test('shop directory exposes only published first Moon and preserves permission boundaries',async()=>{
    const {createDirectoryService}=require('../src/modules/moons/moons.directory');
    const directory=createDirectoryService({db,catalog:service});
    let row=(await service.list(admin)).find(row=>row.key==='analytics');
    assert.deepEqual(await directory.list(shop,['analytics.view']),[]);
    row=await service.status(admin,row.key,{version:row.version,status:'published'});
    let items=await directory.list(shop,['analytics.view']);
    assert.deepEqual(items.map(item=>item.key),['analytics']);assert.equal(items[0].route,'/app/moons/analytics');assert.equal(items[0].can_open,true);
    items=await directory.list(shop,[]);assert.equal(items[0].can_open,false);
    await assert.rejects(directory.list({id:3,shop_id:1,role:'admin'},['analytics.view']),{status:403});
    await db('users').where({id:2}).update({status:'blocked'});
    await assert.rejects(directory.list(shop,['analytics.view']),{status:403});
    await db('users').where({id:2}).update({status:'active'});
    assert.equal((await db('shop_moon_subscriptions')).length,1); // Only the deliberate schema fixture exists; directory never subscribes.
  });
  await t.test('upload policies reject shop authors and bound artwork size/count',()=>{
    assert.equal(policy('moon.icon').maxBytes,2*1024*1024);assert.equal(policy('moon.screenshot').maxCount,6);
    assert.equal(scope(admin,'moon.icon'),'platform');assert.throws(()=>scope(shop,'moon.icon'),{status:403});
  });
 } finally { await db.destroy();if(saved===undefined)delete process.env.MOONS_ENABLED;else process.env.MOONS_ENABLED=saved; }
});

test('Moons HTTP auth, flag, permissions, CSRF and database failure recovery',async()=>{
 const express=require('express');const app=express();let actor=null,enabled=false,failNext=false;
 const service={list:async()=>{if(failNext){failNext=false;throw new Error('password=secret database connection');}return [];}};
 app.use(express.json());app.use((req,res,next)=>{req.session=actor?{user:actor}:{};req.permissions=actor?.permissions||ALL_PERMISSION_KEYS;next();});
 app.use(createCsrfProtection({isProduction:true}));app.use('/api/moons/admin',createMoonsRouter({service,isEnabled:()=>enabled,filesEnabled:()=>false}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port+'/api/moons/admin';
 try{
  assert.equal((await fetch(url)).status,401);
  actor=shop;assert.equal((await fetch(url)).status,403);
  actor=admin;assert.equal((await fetch(url)).status,503);enabled=true;
  actor={...admin,permissions:[]};assert.equal((await fetch(url)).status,403);
  actor=admin;let response=await fetch(url);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal((await response.json()).subscriptions_enabled,false);
  response=await fetch(url+'/staff',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:'https://attacker.example'},body:'{}'});assert.equal(response.status,403);
  failNext=true;response=await fetch(url);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/password|secret|connection/);
  assert.equal((await fetch(url)).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));await require('../db/knex').destroy();}
});
