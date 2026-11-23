const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),knex=require('knex');
const {ensureIconSchema}=require('../src/modules/platform-icons/icons.migration');
const {createIconRouter}=require('../src/modules/platform-icons/icons.routes');
const {validate}=require('../src/modules/files/files.verify-worker');
const {policy}=require('../src/modules/files/files.policies');

test('SVG passes real upload reservation, verification, attachment and restaurant image reads', async () => {
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try {
  await db.raw('PRAGMA foreign_keys = ON');
  await db.schema.createTable('users',t=>t.integer('id').primary());
  await db.schema.createTable('shops',t=>t.integer('id').primary());
  await db('users').insert([{id:1},{id:2}]);
  await require('../src/modules/files/files.migration').ensureFilesSchema(db);
  await ensureIconSchema(db);
  await db('platform_icons').insert({key:'foodpanda',label:'Foodpanda'});
  const objects=new Map();
  const storageFactory=()=>({uploadUrl:async key=>'https://storage.test/'+key,read:async key=>Buffer.from(objects.get(key)),put:async(key,bytes)=>objects.set(key,Buffer.from(bytes)),remove:async key=>objects.delete(key),close(){}});
  const service=require('../src/modules/files/files.service').createFilesService({db,storageFactory,resources:require('../src/modules/platform-icons/icons.files').resources});
  const bytes=Buffer.from('<?xml version="1.0" encoding="UTF-8"?><!-- exported icon --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#e21b70" d="M0 0h32v32H0z"/></svg>');
  const payload={purpose:'platform.icon',filename:'foodpanda.svg',contentType:'image/svg+xml',size:bytes.length,idempotencyKey:require('crypto').randomUUID()};
  const admin={id:1,role:'superadmin'},restaurant={id:2,role:'admin',shop_id:1};
  await assert.rejects(service.reserve(restaurant,payload),{status:403});
  await assert.rejects(service.reserve(admin,{...payload,purpose:'announcement.attachment'}),{status:415});
  const session=await service.reserve(admin,payload);
  assert.equal((await service.reserve(admin,payload)).fileId,session.fileId);
  const row=await db('file_upload_sessions').where({id:session.sessionId}).first();
  assert.equal(row.expected_type,'image/svg+xml');objects.set(row.staging_key,bytes);
  await service.complete(admin,session.sessionId);await service.sweep();
  assert.equal((await service.metadata(admin,session.fileId)).status,'ready');
  await db.transaction(trx=>service.syncAttachments(trx,admin,{type:'platform.icon',id:'foodpanda',purpose:'platform.icon'},[session.fileId]));
  await db('platform_icons').where({key:'foodpanda'}).update({file_id:session.fileId});
  const content=await service.content(restaurant,session.fileId);
  assert.equal(content.mime,'image/svg+xml');assert.deepEqual(content.bytes,bytes);
 } finally { await db.destroy(); }
});

test('SVG export headers and namespaces are accepted while executable content stays blocked', async () => {
 const rules=policy('platform.icon');
 const header='<?xml version="1.0" encoding="UTF-8"?>';
 const safe=Buffer.from('\uFEFF'+header+'\n<!-- Exported icon -->\n<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" viewBox="0 0 32 32"><path fill="#e21b70" d="M0 0h32v32H0z"/></svg>');
 const result=await validate(safe,'image/svg+xml',rules);
 assert.deepEqual(result.bytes,safe);assert.equal(result.mime,'image/svg+xml');
 for(const source of [
  header+'<svg><script>alert(1)</script></svg>',
  header+'<!DOCTYPE svg SYSTEM "https://evil.test/svg.dtd"><svg/>',
  header+'<?xml-stylesheet href="https://evil.test/a.css"?><svg/>',
  '<!-- harmless --><svg onload="alert(1)"></svg>',
  '<svg><!-- malformed -- comment --><path/></svg>',
  '<svg><image href="data:image/png;base64,AAAA"/></svg>',
  '<svg xmlns:xlink="https://evil.test/"><path/></svg>',
 ]) await assert.rejects(validate(Buffer.from(source),'image/svg+xml',rules));
});

test('SVG picker MIME normalization is scoped to policies that allow SVG', async () => {
 const {normalizeUploadFile}=await import('../frontend/src/components/files/upload-file.js');
 for(const type of ['', 'text/xml', 'application/xml', 'image/svg']) {
  const file=new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],'Foodpanda.SVG',{type});
  const normalized=normalizeUploadFile(file,policy('platform.icon'));
  assert.equal(normalized.type,'image/svg+xml');assert.equal(await normalized.text(),await file.text());
  assert.equal(normalizeUploadFile(file,policy('company.logo')),file);
 }
 const html=new File(['<script/>'],'icon.svg',{type:'text/html'});
 assert.equal(normalizeUploadFile(html,policy('platform.icon')),html);
 const xml=new File(['<svg/>'],'icon.xml',{type:'text/xml'});
 assert.equal(normalizeUploadFile(xml,policy('platform.icon')),xml);
});
test('icon raster becomes WebP and restricted SVG preserves bytes',async()=>{
 const rules=policy('platform.icon');const png=await require('sharp')({create:{width:16,height:16,channels:3,background:'#e21b70'}}).png().toBuffer();
 const result=await validate(png,'image/png',rules);assert.equal(result.mime,'image/webp');assert.equal((await require('sharp')(result.bytes).metadata()).format,'webp');
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M0 0h24v24H0z"/></svg>');assert.deepEqual((await validate(svg,'image/svg+xml',rules)).bytes,svg);
 for(const content of ['<svg><script>alert(1)</script></svg>','<svg onload="alert(1)"></svg>','<svg><image href="https://evil.test/a"/></svg>','<!DOCTYPE svg><svg/>','<svg><foreignObject/></svg>','<svg><path fill="url(https://evil.test)"/></svg>'])await assert.rejects(validate(Buffer.from(content),'image/svg+xml',rules));
});
test('icon routes require root and attach through shared file lifecycle',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});await ensureIconSchema(db);await ensureIconSchema(db);
 let bound;const runtime={enabled:()=>true,service:{syncAttachments:async(trx,user,resource,ids)=>{bound={resource,ids};if(ids[0]==='wrong-purpose')throw Object.assign(Error('Wrong purpose'),{status:409});},metadata:async(user,id)=>({id,preview_url:'/api/files/'+id+'/content'})}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers['x-role'])req.session={user:{role:req.headers['x-role'],id:1}};next()});app.use('/icons',createIconRouter(db,runtime));const server=app.listen(0);await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/icons';
 const put=(body,role='superadmin')=>fetch(url+'/foodpanda',{method:'PUT',headers:{'Content-Type':'application/json','x-role':role},body:JSON.stringify(body)});
 try{
 assert.equal((await fetch(url)).status,403);assert.equal((await put({label:'Foodpanda'},'admin')).status,403);
 assert.equal((await put({label:'Foodpanda',image_data:'anything'})).status,400);
 assert.equal((await put({label:'Foodpanda',file_id:'ready-file'})).status,200);assert.deepEqual(bound.ids,['ready-file']);assert.equal(bound.resource.type,'platform.icon');
 assert.equal((await put({label:'Foodpanda',file_id:'wrong-purpose'})).status,409);assert.equal((await db('platform_icons').first()).file_id,'ready-file');
 const rows=await(await fetch(url,{headers:{'x-role':'superadmin'}})).json();assert.equal(rows[0].image_url,'/api/files/ready-file/content');
 assert.equal((await put({label:'Foodpanda',file_id:null})).status,200);assert.equal((await db('platform_icons').first()).file_id,null);
 }finally{await new Promise(r=>server.close(r));await db.destroy()}
});
