const test=require('node:test');
const assert=require('node:assert/strict');
const knex=require('knex');
const sharp=require('sharp');
const {ensureWebsiteSchema}=require('../src/modules/moons/website/website.migration');
const {createWebsiteService}=require('../src/modules/moons/website/website.service');
const {defaults}=require('../src/modules/moons/website/website.schema');
const {createWebsiteRouter,createPublicWebsiteHandler}=require('../src/modules/moons/website/website.routes');
// Native HTTP preserves the explicit Host header used to exercise virtual hosting.
function hostFetch(url,options={}) { return new Promise((resolve,reject)=>{const req=require('node:http').request(url,{method:options.method||'GET',headers:options.headers},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:{get:key=>res.headers[key.toLowerCase()]??null},text:async()=>body}));});req.on('error',reject);req.end();}); }
const a={id:1,shop_id:1},b={id:2,shop_id:2},viewer={id:3,shop_id:1};
async function fixture(){
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 await db.raw('PRAGMA foreign_keys=ON');
 await db.schema.createTable('shops',t=>{t.integer('id').primary();t.string('status');});
 await db.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.string('role');t.string('status');t.boolean('must_change_password').defaultTo(false);});
 await db('shops').insert([{id:1,status:'active'},{id:2,status:'active'}]);
 await db('users').insert([{id:1,shop_id:1,role:'admin',status:'active'},{id:2,shop_id:2,role:'admin',status:'active'},{id:3,shop_id:1,role:'waiter',status:'active'}]);
 await db.transaction(ensureWebsiteSchema);await db.transaction(ensureWebsiteSchema);
 const objects=new Map();let failure=false;
 const options={db,domain:()=> 'sites.example.test',resolvePermissions:async actor=>actor.id===3?['website.view']:['website.view','website.edit','website.publish'],storageFactory:()=>({put:async(k,v)=>objects.set(k,v),read:async k=>objects.get(k),remove:async k=>objects.delete(k),close(){}}),beforeActivate:async()=>{if(failure)throw new Error('injected failure');}};
 return {db,service:createWebsiteService(options),options,objects,failPublish:()=>{failure=true;}};
}
const draft=(subdomain='shop-one',revision=0,configuration=defaults())=>({subdomain,revision,configuration});
test('Website Moon database isolation, draft snapshots, idempotency and failure recovery',async t=>{
 const f=await fixture(),{db,service}=f;
 try {
 await t.test('active membership and every operation require live permissions',async()=>{
  await assert.rejects(service.get(null),{status:401});
  await assert.rejects(service.get({...a,shop_id:2}),{status:403});
  await assert.rejects(service.save(viewer,draft()),{status:403});
  await assert.rejects(service.publish(viewer,{revision:1}),{status:403});
  await assert.rejects(service.unpublish(viewer,{revision:1}),{status:403});
 });
 await t.test('each tenant can see only its own draft and cannot supply tenant scope',async()=>{
  const first=await service.save(a,draft());assert.equal(first.revision,1);
  assert.equal((await service.get(b)).website,null);
  await assert.rejects(service.preview(b),{status:404});
  await assert.rejects(service.save(b,{...draft('shop-two'),shop_id:1}),e=>!!e.issues);
  await assert.rejects(service.save(b,draft()),e=>e.code==='SQLITE_CONSTRAINT_UNIQUE');
  await service.save(b,draft('shop-two'));
  assert.equal((await service.get(a)).website.subdomain,'shop-one');
 });
 await t.test('unpublished drafts are unavailable publicly and publish is idempotent',async()=>{
  await assert.rejects(service.publicWebsite('shop-one.sites.example.test'),{status:404});
  await service.publish(a,{revision:1});await service.publish(a,{revision:1});
  assert.equal((await db('moon_website_versions').where({shop_id:1})).length,1);
  const events=await db('moon_website_events').where({shop_id:1,action:'publish'});assert.equal(events.length,1);assert.equal(events[0].actor_id,1);
 });
 await t.test('draft edits leave live site unchanged and failed publishing rolls back',async()=>{
  await service.save(a,draft('shop-one',1,{...defaults(),businessName:'New draft'}));
  assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.businessName,'Your business');
  f.failPublish();await assert.rejects(service.publish(a,{revision:2}),/injected failure/);
  assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.businessName,'Your business');
  assert.equal((await db('moon_website_versions').where({shop_id:1})).length,1);
  await assert.rejects(service.save(a,draft('changed-host',2)),{status:422});
 });
 await t.test('stale revisions and concurrent edits do not silently overwrite',async()=>{
  await assert.rejects(service.publish(a,{revision:1}),{status:409});
  const outcomes=await Promise.allSettled([service.save(b,draft('shop-two',1,{...defaults(),tagline:'First'})),service.save(b,draft('shop-two',1,{...defaults(),tagline:'Second'}))]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 });
 await t.test('unpublish is idempotent and never leaks draft or private fields',async()=>{
  const publicData=await service.publicWebsite('shop-one.sites.example.test');
  assert.deepEqual(Object.keys(publicData.configuration).sort(),Object.keys(defaults()).sort());
  await service.unpublish(a,{revision:2});await service.unpublish(a,{revision:2});
  await assert.rejects(service.publicWebsite('shop-one.sites.example.test'),{status:404});
  assert.equal((await db('moon_website_events').where({shop_id:1,action:'unpublish'})).length,1);
 });
 }finally{await db.destroy();}
});
test('Website Moon verifies images, tenant ownership and published-only public access',async()=>{
 const {db,service}=await fixture();
 try{
  await assert.rejects(service.upload(a,{buffer:Buffer.from('<svg onload="alert(1)"/>'),mimetype:'image/svg+xml'}),{status:415});
  await assert.rejects(service.upload(a,{buffer:Buffer.from('<html>evil</html>'),mimetype:'image/png'}));
  const png=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).png().toBuffer();
  const image=await service.upload(a,{buffer:png,mimetype:'image/png'});
  await assert.rejects(service.privateAsset(b,image.id),{status:404});
  await assert.rejects(service.save(b,draft('shop-two',0,{...defaults(),logo:image.id})),{status:422});
  await service.save(a,draft('shop-one'));await service.publish(a,{revision:1});
  await assert.rejects(service.publicAsset('shop-one.sites.example.test',image.id),{status:404});
  await service.save(a,draft('shop-one',1,{...defaults(),logo:image.id}));
  await assert.rejects(service.publicAsset('shop-one.sites.example.test',image.id),{status:404});
  await service.publish(a,{revision:2});assert.equal((await service.publicAsset('shop-one.sites.example.test',image.id)).mime,'image/png');
  assert.equal((await sharp((await service.privateAsset(a,image.id)).bytes).metadata()).format,'png');
 }finally{await db.destroy();}
});
test('Website Moon public boundary never falls through to sessions or admin routes',async()=>{
 const {db,service}=await fixture();const express=require('express');const app=express();let sessions=0;
 app.use(createPublicWebsiteHandler({service,domain:()=> 'sites.example.test',isEnabled:()=>true,production:false}));
 app.use((req,res,next)=>{sessions++;next();});app.get('*',(req,res)=>res.send('admin-only'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  await service.save(a,draft());await service.publish(a,{revision:1});
  for(const path of ['/api/moons/website','/app/moons/website','/api/auth/me','/uploads/private.png']) assert.equal((await hostFetch(base+path,{headers:{Host:'shop-one.sites.example.test'}})).status,404);
  const page=await hostFetch(base+'/',{headers:{Host:'shop-one.sites.example.test'}});assert.equal(page.status,200);assert.equal(page.headers.get('set-cookie'),null);assert.match(page.headers.get('cache-control'),/no-store/);
  const other=await hostFetch(base+'/',{headers:{Host:'shop-two.sites.example.test','X-Forwarded-Host':'shop-one.sites.example.test'}});assert.equal(other.status,404);
  assert.equal((await hostFetch(base+'/',{headers:{Host:'shop-one.sites.example.test:99999'}})).status,400);
  assert.equal(sessions,0);
 }finally{await new Promise(r=>server.close(r));await db.destroy();}
});
test('Website Moon private preview requires authentication over HTTP',async()=>{
 const {db,service}=await fixture();const express=require('express');const app=express();app.use('/api/moons/website',createWebsiteRouter({service,isEnabled:()=>true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/api/moons/website/preview')).status,401);}finally{await new Promise(r=>server.close(r));await db.destroy();}
});

test('Website Moon concurrent publishing is idempotent and audit failure rolls activation back',async()=>{
 const {db,service}=await fixture();
 try{
  await service.save(a,draft());
  const outcomes=await Promise.all([service.publish(a,{revision:1}),service.publish(a,{revision:1})]);
  assert.ok(outcomes.every(row=>row.status==='published'));
  assert.equal((await db('moon_website_versions')).length,1);
  assert.equal((await db('moon_website_events').where({action:'publish'})).length,1);
  await service.save(a,draft('shop-one',1,{...defaults(),businessName:'Must not go live'}));
  await db.raw("CREATE TRIGGER fail_website_audit BEFORE INSERT ON moon_website_events WHEN NEW.action = 'publish' BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
  await assert.rejects(service.publish(a,{revision:2}));
  assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.businessName,'Your business');
  assert.equal((await db('moon_website_versions')).length,1);
  await db.raw('DROP TRIGGER fail_website_audit');
  await service.publish(a,{revision:2});
  assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.businessName,'Must not go live');
 }finally{await db.destroy();}
});
test('Website Moon host responses remain separated without shared caching',async()=>{
 const {db,service}=await fixture();
 try{
  await service.save(a,draft('shop-one',0,{...defaults(),businessName:'Tenant One'}));
  await service.save(b,draft('shop-two',0,{...defaults(),businessName:'Tenant Two'}));
  await service.publish(a,{revision:1});await service.publish(b,{revision:1});
  for(let i=0;i<4;i++){
   assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.businessName,'Tenant One');
   assert.equal((await service.publicWebsite('shop-two.sites.example.test')).configuration.businessName,'Tenant Two');
  }
  await db('users').where({id:1}).update({status:'blocked'});
  await assert.rejects(service.publish(a,{revision:1}),{status:403});
  await db('shops').where({id:2}).update({status:'blocked'});
  await assert.rejects(service.publicWebsite('shop-two.sites.example.test'),{status:404});
 }finally{await db.destroy();}
});

test('Website Moon R2 adapter failures and database failures preserve asset integrity',async()=>{
 const f=await fixture(),{db,options,objects}=f;let failPut=false,failRead=false,corrupt=false;
 const service=createWebsiteService({...options,storageFactory:()=>({put:async(k,v)=>{if(failPut)throw new Error('storage put failed');objects.set(k,v);},read:async k=>{if(failRead)throw new Error('storage read failed');return corrupt?Buffer.from('corrupted'):objects.get(k);},remove:async k=>objects.delete(k),close(){}})});
 try{
  const buffer=await sharp({create:{width:8,height:8,channels:3,background:'blue'}}).png().toBuffer(),file={buffer,mimetype:'image/png'};
  failPut=true;await assert.rejects(service.upload(a,file),/storage put failed/);assert.equal((await db('moon_website_assets')).length,0);assert.equal(objects.size,0);
  failPut=false;await db.raw("CREATE TRIGGER fail_website_asset BEFORE INSERT ON moon_website_assets BEGIN SELECT RAISE(ABORT, 'asset insert failure'); END");
  await assert.rejects(service.upload(a,file));assert.equal(objects.size,0);assert.equal((await db('moon_website_assets')).length,0);await db.raw('DROP TRIGGER fail_website_asset');
  const image=await service.upload(a,file);await service.save(a,draft('shop-one',0,{...defaults(),logo:image.id}));await service.publish(a,{revision:1});
  failRead=true;await assert.rejects(service.publicAsset('shop-one.sites.example.test',image.id),/storage read failed/);failRead=false;
  assert.equal((await service.publicAsset('shop-one.sites.example.test',image.id)).mime,'image/png');
  corrupt=true;await assert.rejects(service.publicAsset('shop-one.sites.example.test',image.id),{status:503});corrupt=false;
  await service.save(a,draft('shop-one',1,{...defaults(),logo:''}));assert.equal((await service.publicAsset('shop-one.sites.example.test',image.id)).mime,'image/png');
  assert.equal((await service.publicWebsite('shop-one.sites.example.test')).configuration.logo,image.id);
 }finally{await db.destroy();}
});
test('Website Moon HTTPS enforcement, disabled boundary and private preview response headers',async()=>{
 const {db,service}=await fixture(),express=require('express'),app=express();let enabled=true;
 app.set('trust proxy',1);app.use(createPublicWebsiteHandler({service,domain:()=> 'sites.example.test',isEnabled:()=>enabled,production:true}));
 app.use((req,res,next)=>{req.session={user:a};next();});app.use('/api/moons/website',createWebsiteRouter({service,isEnabled:()=>true}));
 app.get('*',(req,res)=>res.send('admin'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  await service.save(a,draft());await service.publish(a,{revision:1});
  let response=await hostFetch(base+'/',{headers:{Host:'shop-one.sites.example.test'}});assert.equal(response.status,400);
  response=await hostFetch(base+'/',{headers:{Host:'shop-one.sites.example.test','X-Forwarded-Proto':'https'}});assert.equal(response.status,200);assert.match(response.headers.get('strict-transport-security'),/includeSubDomains/);assert.equal(response.headers.get('set-cookie'),null);
  assert.ok(!(await response.text()).includes('draft_json'));
  response=await hostFetch(base+'/api/moons/website/preview');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(await response.text(),/noindex,nofollow/);
  enabled=false;response=await hostFetch(base+'/api/auth/me',{headers:{Host:'shop-one.sites.example.test','X-Forwarded-Proto':'https'}});assert.equal(response.status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await db.destroy();}
});

test('Website Moon localhost storefront is public, read-only, published-only and hostname restricted',async()=>{
 const f=await fixture(),{db}=f;
 const service=createWebsiteService({...f.options,domain:()=>null});
 const express=require('express'),app=express();let sessions=0;
 app.use(require('../src/modules/moons/website/website.routes').createLocalWebsiteHandler({service,isEnabled:()=>true,isLocal:()=>true}));
 app.use((req,res)=>{sessions++;res.status(401).send('private application');});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,path='/app/moon/square/website';
 try{
  const c={...defaults(),menuItems:[{name:'<script>Pizza</script>',category:'Food',description:'Fresh pizza',price:'500.00'}],menuCurrency:'PKR'};
  const saved=await service.save(a,draft('square',0,c));assert.equal(saved.url,path);assert.equal((await service.get(a)).domain,null);
  assert.equal((await hostFetch(base+path)).status,404);
  await service.publish(a,{revision:1});let response=await hostFetch(base+path);assert.equal(response.status,200);const html=await response.text();assert.match(html,/Our menu/);assert.match(html,/PKR 500.00/);assert.ok(html.includes('&lt;script&gt;Pizza&lt;/script&gt;'));assert.ok(!html.includes('<script>'));assert.equal(sessions,0);
  assert.equal((await hostFetch(base+path,{method:'POST'})).status,405);
  assert.equal((await hostFetch(base+path,{headers:{Host:'evil.test'}})).status,404);
  assert.equal((await hostFetch(base+'/app/moon/unknown/website')).status,404);
  await service.save(a,draft('square',1,{...c,menuItems:[]}));assert.match(await (await hostFetch(base+path)).text(),/PKR 500.00/);
  await service.unpublish(a,{revision:2});assert.equal((await hostFetch(base+path)).status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await db.destroy();}
});
test('Website Moon menu import projects only public fields and uses authenticated shop ownership',async()=>{
 const f=await fixture(),{db}=f;let observedShop;
 try{
  await db.schema.alterTable('shops',t=>t.string('currency').defaultTo('PKR'));
  const service=createWebsiteService({...f.options,menuProvider:async shopId=>{observedShop=shopId;return [{name:'Burger',category:'Food',description:'Fresh',selling_price:500,buying_price:200,sku:'PRIVATE',stock:99,ingredients:[{secret:'recipe'}],product_type:'recipe_based'},{name:'Drink',product_type:'stock_based',stock_variants:[{name:'Small',selling_price:100,is_on_menu:true},{name:'Private',selling_price:500,is_on_menu:false}]}];}});
  const result=await service.importMenu(a);assert.equal(observedShop,1);assert.equal(result.menuItems.length,2);assert.deepEqual(Object.keys(result.menuItems[0]).sort(),['available','category','description','image','isDeal','label','name','originalPrice','price']);assert.equal(result.menuItems[0].price,'500.00');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(JSON.stringify(result).includes('recipe'),false);
  await assert.rejects(service.importMenu(viewer),{status:403});await assert.rejects(service.importMenu({...a,shop_id:2}),{status:403});
 }finally{await db.destroy();}
});

test('Website Moon checks product-photo ownership in draft validation and private live preview',async()=>{
 const {db,service}=await fixture();
 try{
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).png().toBuffer();const photo=await service.upload(a,{buffer:bytes,mimetype:'image/png'});
  const menuItem={name:'Pizza',category:'Pizza',description:'',price:'500.00',image:photo.id};
  await assert.rejects(service.save(b,draft('shop-two',0,{...defaults(),menuItems:[menuItem]})),{status:422});await assert.rejects(service.renderPreview(b,{...defaults(),template:'premium-restaurant',menuItems:[menuItem]}),{status:422});
  await assert.rejects(service.renderPreview(viewer,{...defaults(),shop_id:2}),error=>Boolean(error.issues));
  await service.save(a,draft('shop-one',0,{...defaults(),template:'premium-restaurant',menuItems:[menuItem]}));await service.publish(a,{revision:1});assert.equal((await service.publicAsset('shop-one.sites.example.test',photo.id)).mime,'image/png');
  await service.save(a,draft('shop-one',1,{...defaults(),template:'premium-restaurant',menuItems:[]}));assert.equal((await service.publicAsset('shop-one.sites.example.test',photo.id)).mime,'image/png');
  const shared=await service.renderPreview(b,{...defaults(),template:'premium-restaurant',menuItems:[{...menuItem,image:'premium:pizza'}]});assert.equal(shared.menuItems[0].image,'premium:pizza');
 }finally{await db.destroy();}
});
