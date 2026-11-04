const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const knex=require('knex');
const sharp=require('sharp');
const {createFilesService}=require('../src/modules/files/files.service');
const {ensureFilesSchema}=require('../src/modules/files/files.migration');
const {verify}=require('../src/modules/files/files.verification');
test('shared Files lifecycle isolates owners, publishes immutable bytes, rolls back attachments, and preserves references',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  await db.raw('PRAGMA foreign_keys = ON');
  await db.schema.createTable('users',t=>{t.integer('id').primary()});await db.schema.createTable('shops',t=>{t.integer('id').primary()});await db('users').insert([{id:1},{id:2}]);
  await ensureFilesSchema(db);await ensureFilesSchema(db);
  const objects=new Map();let deleteFails=false;
  const storageFactory=()=>({uploadUrl:async key=>'https://upload.test/'+key,downloadUrl:async key=>'https://download.test/'+key,read:async key=>Buffer.from(objects.get(key)),put:async(key,bytes)=>objects.set(key,Buffer.from(bytes)),remove:async key=>{if(deleteFails)throw new Error('offline');objects.delete(key)},close(){}});
  const admin={id:1,role:'superadmin'},other={id:2,role:'superadmin'},tenant={id:2,role:'admin',shop_id:1};
  const resource={type:'announcement',id:10,purpose:'announcement.attachment'};
  const service=createFilesService({db,storageFactory,resources:{announcement:{purpose:'announcement.attachment',authorizeEdit:async()=>{},authorizeView:async(_,user)=>{if(user.id!==1)throw Object.assign(new Error('Forbidden'),{status:403})}}}});
  const bytes=await sharp({create:{width:5,height:3,channels:3,background:'#336699'}}).png().toBuffer();
  const data={purpose:'announcement.attachment',filename:'photo.png',contentType:'image/png',size:bytes.length,idempotencyKey:crypto.randomUUID()};
  await assert.rejects(service.reserve(tenant,data),{status:403});await assert.rejects(service.reserve(tenant,{...data,purpose:'employee.document'}),{publicCode:'PURPOSE_NOT_ENABLED'});
  const session=await service.reserve(admin,data);assert.equal((await service.reserve(admin,data)).fileId,session.fileId);
  await assert.rejects(service.reserve(admin,{...data,filename:'different.png'}),{publicCode:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(service.metadata(other,session.fileId),{status:404});
  await assert.rejects(db.transaction(trx=>service.syncAttachments(trx,admin,resource,[session.fileId])),{publicCode:'FILE_NOT_READY'});
  const upload=await db('file_upload_sessions').where({id:session.sessionId}).first();objects.set(upload.staging_key,bytes);
  let committedJob; let wakeCount=0;
  const unsubscribe=service.onWork(()=>{wakeCount++;committedJob=db('file_jobs').where({file_id:session.fileId,kind:'verify'}).first();});
  assert.equal((await service.complete(admin,session.sessionId)).status,'verifying');
  assert.ok(await committedJob, 'worker wakeup sees the committed durable job');
  assert.equal((await service.complete(admin,session.sessionId)).status,'verifying');
  assert.equal(wakeCount,1);unsubscribe();
  assert.ok((await service.nextJobAt()) <= Date.now());
  let rollbackWakeups=0;const stopRollbackCheck=service.onWork(()=>rollbackWakeups++);
  await assert.rejects(db.transaction(async trx=>{await service.scheduleUnreferencedDeletion(trx,session.fileId);throw new Error('rollback job');}),/rollback job/);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(rollbackWakeups,0);stopRollbackCheck();
  assert.equal(Number((await db('file_jobs').where({kind:'verify'}).count('* as n').first()).n),1);
  await service.sweep();const file=await db('files').where({id:session.fileId}).first();assert.equal(file.status,'ready');assert.equal(file.width,5);
  assert.equal((await service.content(admin,session.fileId)).mime,'image/png');await assert.rejects(service.content(other,session.fileId),{status:404});
  const published=Buffer.from(objects.get(file.storage_key));objects.set(upload.staging_key,Buffer.from('overwrite'));assert.deepEqual(objects.get(file.storage_key),published);objects.set(file.storage_key,Buffer.from('tampered'));await assert.rejects(service.content(admin,session.fileId),{publicCode:'FILE_INTEGRITY'});objects.set(file.storage_key,published);
  assert.equal((await service.complete(admin,session.sessionId)).status,'ready');
  await assert.rejects(db.transaction(async trx=>{await service.syncAttachments(trx,admin,resource,[session.fileId]);throw new Error('record save failed')}),/record save failed/);
  assert.equal((await db('file_attachments')).length,0);
  await db.transaction(trx=>service.syncAttachments(trx,admin,resource,[session.fileId]));
  await assert.rejects(service.cancel(admin,session.sessionId),{publicCode:'FILE_ATTACHED'});
  await assert.rejects(service.download(other,session.fileId),{status:403});assert.match((await service.download(admin,session.fileId)).url,/download.test/);
  await db('files').where({id:session.fileId}).update({updated_at:new Date(Date.now()-172800000)});await service.sweep();assert.equal((await db('files').where({id:session.fileId}).first()).status,'ready');
  await db.transaction(trx=>service.syncAttachments(trx,admin,resource,[]));await db('files').where({id:session.fileId}).update({updated_at:new Date(Date.now()-172800000)});
  deleteFails=true;await service.sweep();assert.equal((await db('files').where({id:session.fileId}).first()).status,'deleting');assert.ok(objects.has(file.storage_key));
  deleteFails=false;await db('file_jobs').where({kind:'delete'}).update({run_at:new Date(0)});await service.sweep();assert.equal((await db('files').where({id:session.fileId}).first()).status,'deleted');assert.equal(objects.has(file.storage_key),false);
  const corrupt=await service.reserve(admin,{...data,idempotencyKey:crypto.randomUUID()});const corruptUpload=await db('file_upload_sessions').where({id:corrupt.sessionId}).first();objects.set(corruptUpload.staging_key,Buffer.alloc(bytes.length));await service.complete(admin,corrupt.sessionId);await service.sweep();assert.equal((await service.metadata(admin,corrupt.fileId)).status,'rejected');
  const expired=await service.reserve(admin,{...data,idempotencyKey:crypto.randomUUID()});await db('file_upload_sessions').where({id:expired.sessionId}).update({expires_at:new Date(0)});await assert.rejects(service.complete(admin,expired.sessionId),{publicCode:'UPLOAD_EXPIRED'});await service.sweep();assert.equal((await service.metadata(admin,expired.fileId)).status,'expired');
 }finally{await db.destroy()}
});
test('verification rejects forged MIME, non-image formats, and configured frame limits',async()=>{
 await assert.rejects(verify(Buffer.from('<html>bad</html>'),'image/png',10000),{publicCode:'INVALID_FILE'});
 await assert.rejects(verify(Buffer.from('%PDF-1.7 fake'),'application/pdf',10000),{publicCode:'TYPE_NOT_ALLOWED'});
 await assert.rejects(verify(Buffer.from('<svg/>'),'image/svg+xml',10000),{publicCode:'TYPE_NOT_ALLOWED'});
 const bytes=await sharp({create:{width:4,height:3,channels:3,background:'#abc'}}).png().toBuffer();
 const rules={...require('../src/modules/files/files.policies').policy('company.logo'),maxDimension:2};
 const resized=await verify(bytes,'image/png',rules.maxBytes,rules);assert.ok(resized.width<=2&&resized.height<=2);
});
test('registered tenant purposes enforce shop boundaries in services and composite foreign keys',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  await db.raw('PRAGMA foreign_keys = ON');await db.schema.createTable('users',t=>t.integer('id').primary());await db.schema.createTable('shops',t=>t.integer('id').primary());await db('users').insert([{id:1},{id:2}]);await db('shops').insert([{id:1},{id:2}]);await ensureFilesSchema(db);
  const user={id:1,shop_id:1,role:'admin'},wrongShop={id:2,shop_id:2,role:'admin'},file=crypto.randomUUID();
  const service=createFilesService({db,purposeAuthorizers:{'employee.avatar':async()=>{}},resources:{staff:{purpose:'employee.avatar',authorizeEdit:async()=>{},authorizeView:async()=>{}}}});
  await db('files').insert({id:file,shop_id:1,scope_key:'shop:1',uploader_id:1,purpose:'employee.avatar',original_name:'avatar.png',storage_key:'files/final/'+file,status:'ready',verified_bytes:20,mime_type:'image/png'});
  await assert.rejects(service.metadata(wrongShop,file),{status:404});
  await assert.rejects(db.transaction(trx=>service.syncAttachments(trx,wrongShop,{type:'staff',id:10,purpose:'employee.avatar'},[file])),{publicCode:'FILE_NOT_READY'});
  await db.transaction(trx=>service.syncAttachments(trx,user,{type:'staff',id:10,purpose:'employee.avatar'},[file]));
  assert.equal((await service.listAttachments(wrongShop,{type:'staff',id:10})).length,0);
  assert.equal((await service.listAttachments(user,{type:'staff',id:10})).length,1);
  await assert.rejects(db('file_attachments').insert({scope_key:'shop:2',shop_id:2,file_id:file,resource_type:'staff',resource_id:'11',display_order:0,attached_by:2}));
 }finally{await db.destroy()}
});
test('failed SQL publication preserves durable retry accounting after the object is written',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  await db.schema.createTable('users',t=>t.integer('id').primary());await db.schema.createTable('shops',t=>t.integer('id').primary());await db('users').insert({id:1});await ensureFilesSchema(db);
  const store=new Map(),storageFactory=()=>({uploadUrl:async()=>'',read:async key=>Buffer.from(store.get(key)),put:async(key,bytes)=>store.set(key,Buffer.from(bytes)),remove:async key=>store.delete(key),close(){}});
  const service=createFilesService({db,storageFactory,verifier:async bytes=>({bytes,mime:'image/png',width:1,height:1})});
  const user={id:1,role:'superadmin'},upload=await service.reserve(user,{purpose:'announcement.artwork',filename:'art.png',contentType:'image/png',size:5,idempotencyKey:crypto.randomUUID()});
  const session=await db('file_upload_sessions').where({id:upload.sessionId}).first();store.set(session.staging_key,Buffer.from('image'));await service.complete(user,upload.sessionId);
  await db.raw("CREATE TRIGGER fail_publication BEFORE UPDATE ON files WHEN NEW.status = 'ready' BEGIN SELECT RAISE(ABORT, 'simulated publication failure'); END");
  await service.sweep();assert.equal((await service.metadata(user,upload.fileId)).status,'verifying');let job=await db('file_jobs').where({file_id:upload.fileId,kind:'verify'}).first();assert.equal(job.attempts,1);assert.equal(store.has((await db('files').where({id:upload.fileId}).first()).storage_key),true);
  await db.raw('DROP TRIGGER fail_publication');await db('file_jobs').where({id:job.id}).update({run_at:new Date(0)});await service.sweep();assert.equal((await service.metadata(user,upload.fileId)).status,'ready');assert.equal(await db('file_jobs').where({id:job.id}).first(),undefined);
 }finally{await db.destroy()}
});
test('cleanup does not starve abandoned objects behind a full page of retained attachments',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  await db.schema.createTable('users',t=>t.integer('id').primary());await db.schema.createTable('shops',t=>t.integer('id').primary());await db('users').insert({id:1});await ensureFilesSchema(db);
  const linked=Array.from({length:101},()=>crypto.randomUUID()),orphan=crypto.randomUUID(),when=new Date(Date.now()-172800000);
  await db('files').insert([...linked,orphan].map(id=>({id,scope_key:'platform',shop_id:null,uploader_id:1,purpose:'announcement.artwork',original_name:'art.png',storage_key:'files/final/'+id,status:'ready',verified_bytes:1,updated_at:when})));
  await db('file_attachments').insert(linked.map((id,index)=>({scope_key:'platform',shop_id:null,file_id:id,resource_type:'art',resource_id:String(index),display_order:0,attached_by:1})));
  const removed=[];const service=createFilesService({db,storageFactory:()=>({remove:async key=>removed.push(key),close(){}})});await service.sweep();assert.equal((await db('files').where({id:orphan}).first()).status,'deleted');assert.deepEqual(removed,['files/final/'+orphan]);assert.equal(Number((await db('files').where({status:'ready'}).count('* as n').first()).n),101);
 }finally{await db.destroy()}
});
