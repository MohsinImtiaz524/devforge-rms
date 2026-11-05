const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex');
const {ensureMoonsSchema}=require('../src/modules/moons/moons.migration');
const {createMoonsService}=require('../src/modules/moons/moons.service');
const {createDirectoryService,createDirectoryRouter}=require('../src/modules/moons/moons.directory');
const {createFilesService}=require('../src/modules/files/files.service');
const {resources}=require('../src/modules/moons/moons.files');

test('Moons published cache reduces reads, coalesces misses and rechecks identity/permissions without caching private state',async t=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  await db.raw('PRAGMA foreign_keys=ON');
  await db.schema.createTable('shops',table=>{table.integer('id').primary();table.string('name');table.string('status');});
  await db.schema.createTable('users',table=>{table.integer('id').primary();table.integer('shop_id');table.string('role');table.string('name');table.string('username');table.string('status');table.boolean('must_change_password').defaultTo(false);});
  await db('shops').insert([{id:1,name:'One',status:'active'},{id:2,name:'Two',status:'active'}]);
  await db('users').insert([{id:1,shop_id:null,role:'superadmin',name:'Owner',status:'active'},{id:2,shop_id:1,role:'manager',name:'First',status:'active'},{id:3,shop_id:2,role:'cashier',name:'Second',status:'active'}]);
  await db.transaction(ensureMoonsSchema);await require('../src/modules/files/files.migration').ensureFilesSchema(db);
  const files=createFilesService({db,resources});let clock=1000,reads=0,throwFile=false;
  const fileService={...files,readResourceFiles:async(...args)=>{reads++;if(throwFile)throw new Error('Temporary storage failure');return files.readResourceFiles(...args);}};
  const fileRuntime=()=>({enabled:()=>true,service:fileService});
  const catalog=createMoonsService({db,files:fileRuntime,now:()=>clock});
  const admin={id:1,role:'superadmin'};
  let moon=(await catalog.list(admin)).find(row=>row.key==='analytics');
  moon=await catalog.update(admin,'analytics',{version:moon.version,name:'Analytics',summary:'Business performance insights',description:'Helpful analytics.',category:'insights',sort_order:0});
  moon=await catalog.price(admin,'analytics',{version:moon.version,currency:'PKR',monthly_amount_minor:150000});
  moon=await catalog.status(admin,'analytics',{version:moon.version,status:'published'});
  let queries=[];db.on('query',query=>queries.push(query.sql));
  await t.test('cold catalog uses four queries, warm uses one current catalog read',async()=>{
   queries=[];await catalog.published();assert.equal(queries.length,4);
   queries=[];const rows=await catalog.published();assert.equal(queries.length,1);assert.match(queries[0],/moon_catalog/);
   rows[0].name='Mutated caller';rows[0].can_open=true;
   assert.equal((await catalog.published())[0].name,'Analytics');assert.equal((await catalog.published())[0].can_open,undefined);
   console.log('Catalog query counts: cold=4, warm=1 (previous uncached path=5).');
  });
  await t.test('cold concurrent readers share expensive price/artwork work',async()=>{
   clock+=16000;reads=0;
   await Promise.all(Array.from({length:12},()=>catalog.published()));
   assert.equal(reads,2,'Only icon and cover are loaded once for the whole concurrent batch');
  });
  await t.test('another server mutation invalidates immediately through current catalog version',async()=>{
   const other=createMoonsService({db,files:fileRuntime});
   const changed=await other.update(admin,'analytics',{version:moon.version,name:'Updated Analytics',summary:moon.summary,description:moon.description,category:moon.category,sort_order:moon.sort_order});moon=changed;
   assert.equal((await catalog.published())[0].name,'Updated Analytics');
   moon=await other.status(admin,'analytics',{version:moon.version,status:'archived'});
   assert.deepEqual(await catalog.published(),[]);
   moon=await other.status(admin,'analytics',{version:moon.version,status:'published'});
  });
  await t.test('failed refresh is not cached and recovers on retry',async()=>{
   clock+=16000;throwFile=true;await assert.rejects(catalog.published(),/Temporary storage failure/);
   throwFile=false;assert.equal((await catalog.published()).length,1);
  });
  await t.test('bootstrap reads current membership and permission for each shop while reusing only global catalog',async()=>{
   let granted=true,permissionChecks=0;
   const directory=createDirectoryService({db,catalog,resolvePermissions:async actor=>{permissionChecks++;return actor.shop_id===1&&granted?['analytics.view']:[];}});
   const first={id:2,shop_id:1,role:'manager'},second={id:3,shop_id:2,role:'cashier'};
   let response=await directory.bootstrap(first);assert.equal(response.user.name,'First');assert.equal(response.items[0].can_open,true);
   await assert.rejects(directory.bootstrap(second),{status:403,publicCode:'MOON_ACCESS_REQUIRED'});
   granted=false;await assert.rejects(directory.bootstrap(first),{status:403,publicCode:'MOON_ACCESS_REQUIRED'});assert.equal(permissionChecks,3);
   await assert.rejects(directory.bootstrap({...first,shop_id:2}),{status:403});
   await db('users').where({id:2}).update({status:'blocked'});await assert.rejects(directory.bootstrap(first),{status:403});
   await db('users').where({id:2}).update({status:'active',must_change_password:true});await assert.rejects(directory.bootstrap(first),{publicCode:'PASSWORD_CHANGE_REQUIRED'});
   await db('users').where({id:2}).update({must_change_password:false});
   await db('shops').where({id:1}).update({status:'blocked'});await assert.rejects(directory.bootstrap(first),{status:403});
   await db('shops').where({id:1}).update({status:'active'});
   await assert.rejects(directory.bootstrap({id:999}),{status:401});
  });
  await t.test('HTTP bootstrap delivers profile and directory together with private no-store headers',async()=>{
   const express=require('express'),app=express();
   const directory=createDirectoryService({db,catalog,resolvePermissions:async()=>['analytics.view']});
   app.use((req,res,next)=>{req.session={user:{id:2,shop_id:1,role:'manager'}};next();});
   app.use('/api/moons/directory',createDirectoryRouter({service:directory,isEnabled:()=>true}));
   const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/moons/directory');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('server-timing'),/moons;dur=/);const body=await response.json();assert.equal(body.user.id,2);assert.equal(body.items[0].can_open,true);assert.equal(body.user.permissions,undefined);}
   finally{await new Promise(resolve=>server.close(resolve));}
  });
 }finally{await db.destroy();await require('../db/knex').destroy();}
});
