const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const knex=require('knex');
const {ensureFilesSchema}=require('../src/modules/files/files.migration');
const {createFilesService}=require('../src/modules/files/files.service');
// This variable must point to a disposable test database. Never falls back to DATABASE_URL.
test('PostgreSQL serializes scope reservations, completion, attachment and deletion',{skip:!process.env.FILES_TEST_DATABASE_URL},async()=>{
 const schema='rms_files_test_'+crypto.randomBytes(8).toString('hex');
 const adminDb=knex({client:'pg',connection:process.env.FILES_TEST_DATABASE_URL,pool:{min:0,max:1}});let db,created=false;
 try{
  await adminDb.raw('CREATE SCHEMA ??',[schema]);created=true;
  db=knex({client:'pg',connection:process.env.FILES_TEST_DATABASE_URL,searchPath:[schema],pool:{min:0,max:5}});
  await db.schema.createTable('users',t=>t.integer('id').primary());await db.schema.createTable('shops',t=>t.integer('id').primary());await db('users').insert({id:1});
  await ensureFilesSchema(db);await ensureFilesSchema(db);
  const store=new Map(),storageFactory=()=>({uploadUrl:async key=>'https://test.invalid/'+key,read:async key=>Buffer.from(store.get(key)),put:async(key,bytes)=>store.set(key,Buffer.from(bytes)),remove:async key=>store.delete(key),close(){}});
  const user={id:1,role:'superadmin'},resource={type:'art',id:1,purpose:'announcement.artwork'};
  const files=createFilesService({db,storageFactory,verifier:async bytes=>({bytes,mime:'image/png',width:1,height:1}),resources:{art:{purpose:'announcement.artwork',authorizeEdit:async()=>{},authorizeView:async()=>{}}},config:{maxPending:2,scopeQuotaBytes:100000000,uploadTtlSeconds:900,unattachedHours:24,maxAttempts:5}});
  const body={purpose:'announcement.artwork',filename:'art.png',contentType:'image/png',size:5,idempotencyKey:crypto.randomUUID()};
  const repeats=await Promise.all([files.reserve(user,body),files.reserve(user,body),files.reserve(user,body)]);assert.equal(new Set(repeats.map(s=>s.fileId)).size,1);
  const results=await Promise.allSettled([files.reserve(user,{...body,idempotencyKey:crypto.randomUUID()}),files.reserve(user,{...body,idempotencyKey:crypto.randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const session=repeats[0],row=await db('file_upload_sessions').where({id:session.sessionId}).first();store.set(row.staging_key,Buffer.from('image'));
  await Promise.all([files.complete(user,session.sessionId),files.complete(user,session.sessionId)]);await Promise.all([files.sweep(),files.sweep()]);assert.equal((await files.metadata(user,session.fileId)).status,'ready');
  const races=await Promise.allSettled([db.transaction(trx=>files.syncAttachments(trx,user,resource,[session.fileId])),files.cancel(user,session.sessionId)]);
  assert.ok(races.some(r=>r.status==='fulfilled'));await files.sweep();
  const attachment=await db('file_attachments').where({file_id:session.fileId}).first(),file=await db('files').where({id:session.fileId}).first();
  if(attachment){assert.equal(file.status,'ready');assert.ok(store.has(file.storage_key));}else assert.equal(file.status,'deleted');
 }finally{if(db)await db.destroy();if(created)await adminDb.raw('DROP SCHEMA ?? CASCADE',[schema]);await adminDb.destroy();}
});
