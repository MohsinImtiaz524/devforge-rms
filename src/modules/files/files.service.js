const crypto = require('node:crypto');
const { policy, scope, projection, fail } = require('./files.policies');
const schemas = require('./files.schema');
const { verify } = require('./files.verification');
const DAY = 86400000;
function createFilesService({ db, storageFactory = require('./files.storage').createStorage, verifier = verify, resources = {}, purposeAuthorizers = {}, config: configuredLimits }) {
  const workListeners = new Set();
  function onWork(listener) { workListeners.add(listener); return () => workListeners.delete(listener); }
  function wakeWorker() { for (const listener of workListeners) listener(); }
  const notifiedTransactions = new WeakSet();
  function wakeAfterCommit(trx) {
    if (notifiedTransactions.has(trx)) return;
    notifiedTransactions.add(trx);
    // Knex resolves executionPromise after commit, rejects it on rollback.
    trx.executionPromise.then(wakeWorker, () => {}).catch(() => {
      console.error('[Files worker] Wakeup failed; durable jobs remain queued.');
    });
  }
  const limits=()=>configuredLimits||require('./files.config').uploadConfig();
  const scoped = (user,purpose) => scope(user,purpose,{allowTenant:Boolean(purposeAuthorizers[purpose])});
  async function authorizePurpose(user,purpose) { const key=scoped(user,purpose); if(purposeAuthorizers[purpose])await purposeAuthorizers[purpose](user);return key; }
  const summary = row => ({preview_url:row.status==='ready'&&String(row.mime_type).startsWith('image/')?`/api/files/${row.id}/content`:null,id:row.id,purpose:row.purpose,name:row.original_name,mime:row.mime_type,size:Number(row.verified_bytes||0),width:row.width,height:row.height,status:row.status});
  async function job(trx,id,kind,runAt=new Date()) { await trx('file_jobs').insert({id:crypto.randomUUID(),file_id:id,kind,run_at:runAt}).onConflict(['file_id','kind']).ignore(); wakeAfterCommit(trx); }
  async function scheduleUnreferencedDeletion(trx,fileId){
    const runAt=new Date(Date.now()+limits().unattachedHours*3600000);
    await trx('file_jobs').insert({id:crypto.randomUUID(),file_id:fileId,kind:'delete',run_at:runAt}).onConflict(['file_id','kind']).merge({run_at:runAt,attempts:0,last_error:null});
    wakeAfterCommit(trx);
  }
  async function owned(user,id,trx=db) {
    const row=await trx('files').where({id:schemas.id.parse(id)}).first();
    if(!row || Number(row.uploader_id)!==Number(user.id))fail(404,'File not found.','FILE_NOT_FOUND');
    if(scoped(user,row.purpose)!==row.scope_key)fail(404,'File not found.','FILE_NOT_FOUND');
    return row;
  }
  async function reserve(user,raw) {
    const config=limits();
    const data=schemas.upload.parse(raw), key=await authorizePurpose(user,data.purpose), rules=policy(data.purpose);
    if(!rules.types.includes(data.contentType))fail(415,'File type is not allowed.','TYPE_NOT_ALLOWED');
    if(data.size>rules.maxBytes)fail(413,'File exceeds its size limit.','FILE_TOO_LARGE');
    // Validate storage before reserving quota; credentials never leave the adapter.
    const storage=storageFactory();
    try {
      const session=await db.transaction(async trx=>{
        await trx('file_scopes').insert({scope_key:key}).onConflict('scope_key').ignore();
        await trx('file_scopes').where({scope_key:key}).forUpdate().first();
        const existing=await trx('file_upload_sessions').where({scope_key:key,uploader_id:user.id,idempotency_key:data.idempotencyKey}).first();
        if(existing){const f=await trx('files').where({id:existing.file_id}).first();if(f.purpose!==data.purpose||f.original_name!==data.filename||Number(existing.expected_bytes)!==data.size||existing.expected_type!==data.contentType)fail(409,'Idempotency key belongs to a different upload.','IDEMPOTENCY_CONFLICT');if(f.status!=='pending'||new Date(existing.expires_at)<=new Date())fail(409,'Upload session is no longer pending.','UPLOAD_EXPIRED');return existing;}
        const stagingExists="EXISTS (SELECT 1 FROM file_jobs j WHERE j.file_id = f.id AND j.kind = 'staging')";
        const totals=await trx('files as f').join('file_upload_sessions as s','s.file_id','f.id').where('f.scope_key',key).where(q=>q.whereNot('f.status','deleted').orWhereRaw(stagingExists)).select(trx.raw("COALESCE(SUM(CASE WHEN f.status = 'deleted' THEN 0 WHEN f.verified_bytes IS NOT NULL THEN f.verified_bytes WHEN f.status IN ('pending','verifying') THEN s.reserved_final_bytes ELSE 0 END + CASE WHEN "+stagingExists+" THEN s.expected_bytes ELSE 0 END),0) AS reserved_bytes")).select(trx.raw("COALESCE(SUM(CASE WHEN f.status IN ('pending','verifying') THEN 1 ELSE 0 END),0) AS pending_count")).first();
        if(Number(totals.pending_count)>=config.maxPending||Number(totals.reserved_bytes)+data.size+rules.maxBytes>config.scopeQuotaBytes)fail(429,'Upload quota exceeded.','UPLOAD_QUOTA_EXCEEDED');
        const id=crypto.randomUUID(), sid=crypto.randomUUID();
        await trx('files').insert({id,scope_key:key,shop_id:key==='platform'?null:Number(user.shop_id),uploader_id:user.id,purpose:data.purpose,original_name:data.filename,storage_key:`files/final/${id}`,status:'pending'});
        const row={id:sid,file_id:id,scope_key:key,uploader_id:user.id,idempotency_key:data.idempotencyKey,staging_key:`files/staging/${sid}`,expected_bytes:data.size,reserved_final_bytes:rules.maxBytes,expected_type:data.contentType,expires_at:new Date(Date.now()+config.uploadTtlSeconds*1000)};
        await trx('file_upload_sessions').insert(row); await job(trx,id,'staging',new Date(Date.now()+DAY+config.uploadTtlSeconds*1000)); return row;
      });
      const seconds=Math.max(1,Math.floor((new Date(session.expires_at)-Date.now())/1000));
      return {fileId:session.file_id,sessionId:session.id,url:await storage.uploadUrl(session.staging_key,session.expected_type,seconds),headers:{'Content-Type':session.expected_type},expiresAt:session.expires_at};
    } finally { storage.close(); }
  }
  async function complete(user,id) {
    const result = await db.transaction(async trx=>{
      const s=await trx('file_upload_sessions').where({id:schemas.id.parse(id),uploader_id:user.id}).first();
      if(!s)fail(404,'Upload not found.','FILE_NOT_FOUND');
      const row=await owned(user,s.file_id,trx);
      await trx('files').where({id:row.id}).forUpdate().first();
      const current=await trx('files').where({id:row.id}).first();
      if(['ready','verifying'].includes(current.status))return summary(current);
      if(current.status!=='pending'||new Date(s.expires_at)<=new Date())fail(409,'Upload has expired or was cancelled.','UPLOAD_EXPIRED');
      await trx('files').where({id:row.id}).update({status:'verifying',updated_at:new Date()}); await job(trx,row.id,'verify');
      return {...summary(row),status:'verifying'};
    });
    return result;
  }
  async function cancel(user,id) {
    await db.transaction(async trx=>{
      const session=await trx('file_upload_sessions').where({id:schemas.id.parse(id),uploader_id:user.id}).first();
      if(!session)fail(404,'Upload not found.','FILE_NOT_FOUND');
      const row=await owned(user,session.file_id,trx);
      await trx('files').where({id:row.id}).forUpdate().first();
      if(await trx('file_attachments').where({file_id:row.id}).first())fail(409,'Attached files cannot be cancelled.','FILE_ATTACHED');
      await trx('files').where({id:row.id}).update({status:'deleting',updated_at:new Date()});await job(trx,row.id,'delete');
    });
  }
  async function syncAttachments(trx,user,resource,ids) {
    const resolver=resources[resource.type];if(!resolver||!resolver.purpose)fail(400,'Unsupported attachment resource.','INVALID_RESOURCE');
    if(resource.purpose!==resolver.purpose)fail(400,'Attachment purpose does not match its resource.','INVALID_RESOURCE');
    await resolver.authorizeEdit(trx,user,resource.id);
    const key=await authorizePurpose(user,resource.purpose), rules=policy(resource.purpose);
    if(!Array.isArray(ids)||ids.length>rules.maxCount||new Set(ids).size!==ids.length)fail(422,'Attachment count exceeds its limit.','ATTACHMENT_LIMIT_EXCEEDED');
    ids.forEach(id=>schemas.id.parse(id));
    const rows=ids.length?await trx('files').where({scope_key:key,purpose:resource.purpose}).whereIn('id',ids).orderBy('id').forUpdate():[];
    if(rows.length!==ids.length||rows.some(r=>r.status!=='ready'))fail(409,'Files must be ready before saving.','FILE_NOT_READY');
    if(rows.reduce((sum,r)=>sum+Number(r.verified_bytes),0)>rules.maxTotalBytes)fail(422,'Total attachments exceed their size limit.','ATTACHMENT_LIMIT_EXCEEDED');
    const links=await trx('file_attachments').where({scope_key:key,resource_type:resource.type,resource_id:String(resource.id)});
    for(const row of rows){const link=await trx('file_attachments').where({file_id:row.id}).first();if(link&&!(link.resource_type===resource.type&&link.resource_id===String(resource.id)))fail(409,'File is already attached.','FILE_ATTACHED');if(!link&&Number(row.uploader_id)!==Number(user.id))fail(403,'You cannot attach another uploader\'s file.','FORBIDDEN');}
    await trx('file_attachments').where({scope_key:key,resource_type:resource.type,resource_id:String(resource.id)}).del();
    if(ids.length)await trx('file_attachments').insert(ids.map((id,i)=>({scope_key:key,shop_id:key==='platform'?null:Number(user.shop_id),file_id:id,resource_type:resource.type,resource_id:String(resource.id),display_order:i,attached_by:user.id})));
    for(const link of links.filter(l=>!ids.includes(l.file_id))){await trx('files').where({id:link.file_id}).update({updated_at:new Date()});await scheduleUnreferencedDeletion(trx,link.file_id);}
  }
  async function listAttachments(user,resource,trx=db) {
    const resolver=resources[resource.type];if(!resolver||!resolver.purpose)fail(400,'Unsupported attachment resource.','INVALID_RESOURCE');
    await resolver.authorizeView(trx,user,resource.id);
    const resourceScope=policy(resolver.purpose).scope==='platform'?'platform':scoped(user,resolver.purpose);
    const rows=await trx('file_attachments as a').join('files as f','f.id','a.file_id').where({'a.resource_type':resource.type,'a.resource_id':String(resource.id),'f.status':'ready','f.scope_key':resourceScope,'f.purpose':resolver.purpose}).orderBy('a.display_order').select('f.*');
    return rows.map(summary);
  }
  // Internal read model: owning modules must authorize resource IDs before calling.
  async function readResourceFiles(resourceType,resourceIds,scopeKey,trx=db) {
    const resolver=resources[resourceType];if(!resolver)fail(400,'Unsupported resource.','INVALID_RESOURCE');
    if(!resourceIds.length)return [];
    const rows=await trx('file_attachments as a').join('files as f',function(){this.on('f.id','=','a.file_id').andOn('f.scope_key','=','a.scope_key')}).where({'a.resource_type':resourceType,'a.scope_key':scopeKey,'f.purpose':resolver.purpose,'f.status':'ready'}).whereIn('a.resource_id',resourceIds.map(String)).orderBy('a.display_order').select('f.*','a.resource_id');
    return rows.map(row=>({...summary(row),resourceId:row.resource_id}));
  }
  async function content(user,id) {
    const meta=await metadata(user,id);
    const rules=policy(meta.purpose);
    if(meta.status!=='ready'||!rules.inline||!rules.types.includes(meta.mime)||!meta.mime.startsWith('image/'))fail(409,'Image is unavailable.','FILE_NOT_READY');
    const row=await db('files').where({id}).first(),storage=storageFactory();
    try {
      const bytes=await storage.read(row.storage_key,rules.maxBytes);
      if(bytes.length!==Number(row.verified_bytes)||crypto.createHash('sha256').update(bytes).digest('hex')!==row.checksum)fail(409,'Image integrity check failed.','FILE_INTEGRITY');
      return {bytes,mime:row.mime_type};
    }finally{storage.close();}
  }
  async function metadata(user,id) {
    const row=await db('files').where({id:schemas.id.parse(id)}).first();if(!row || (row.shop_id!==null&&Number(row.shop_id)!==Number(user.shop_id)))fail(404,'File not found.','FILE_NOT_FOUND');
    const link=await db('file_attachments').where({file_id:row.id}).first();
    if(link){const resolver=resources[link.resource_type];if(!resolver)fail(404,'File not found.','FILE_NOT_FOUND');await resolver.authorizeView(db,user,link.resource_id);}else await owned(user,id);
    return summary(row);
  }
  async function download(user,id) {
    const meta=await metadata(user,id);if(meta.status!=='ready')fail(409,'File is not ready.','FILE_NOT_READY');
    const row=await db('files').where({id}).first(),storage=storageFactory();
    try{return{url:await storage.downloadUrl(row.storage_key,row.original_name),expiresIn:60};}finally{storage.close();}
  }
  async function processJob(id) {
    const config=limits();
    // Row locks serialize publication, cancellation, attachment, and deletion.
    await db.transaction(async trx=>{
      const initial=await trx('file_jobs').where({id}).first();if(!initial)return;
      const row=await trx('files').where({id:initial.file_id}).forUpdate().first();
      const work=await trx('file_jobs').where({id}).first();if(!work||new Date(work.run_at)>new Date()||work.attempts>=config.maxAttempts)return;
      const session=await trx('file_upload_sessions').where({file_id:row.id}).first();
      if(work.kind==='delete'){if(await trx('file_attachments').where({file_id:row.id}).first()){await trx('file_jobs').where({id}).del();return;}await trx('files').where({id:row.id}).update({status:'deleting',updated_at:new Date()});}
      let storage;
      try {
        storage=storageFactory();
        await trx.transaction(async task=>{
        if(work.kind==='verify'&&row.status==='verifying'){
          const rules=policy(row.purpose),bytes=await storage.read(session.staging_key,rules.maxBytes);
          if(bytes.length!==Number(session.expected_bytes))fail(415,'Uploaded size does not match its reservation.','SIZE_MISMATCH');
          const result=await verifier(bytes,session.expected_type,rules.maxBytes,rules);
          await storage.put(row.storage_key,result.bytes,result.mime);
          await task('files').where({id:row.id}).update({status:'ready',mime_type:result.mime,verified_bytes:result.bytes.length,checksum:crypto.createHash('sha256').update(result.bytes).digest('hex'),width:result.width,height:result.height,updated_at:new Date()});
        }else if(work.kind==='staging')await storage.remove(session.staging_key);
        else if(work.kind==='delete'){
          if(await task('file_attachments').where({file_id:row.id}).first()){await task('file_jobs').where({id}).del();return;}
          await storage.remove(row.storage_key);await task('files').where({id:row.id}).update({status:'deleted',updated_at:new Date()});
        }
        await task('file_jobs').where({id}).del();
        });
      }catch(error){
        const terminal=work.kind==='verify'&&[400,413,415].includes(error.status);
        if(terminal||work.attempts>=config.maxAttempts-1){if(work.kind==='verify')await trx('files').where({id:row.id}).update({status:'rejected',updated_at:new Date()});}
        await trx('file_jobs').where({id}).update({attempts:terminal?config.maxAttempts:work.attempts+1,last_error:error.publicCode||'STORAGE_UNAVAILABLE',run_at:new Date(Date.now()+Math.min(3600000,30000*2**work.attempts))});
      }finally{storage?.close();}
    });
  }
  async function cleanup() {
    const config=limits();
    const expired=await db('file_upload_sessions as s').join('files as f','f.id','s.file_id').where('s.expires_at','<=',new Date()).where('f.status','pending').select('f.id').limit(100);
    for(const row of expired)await db('files').where({id:row.id,status:'pending'}).update({status:'expired',updated_at:new Date()});
    const rows=await db('files').whereIn('status',['pending','ready','rejected','expired']).whereNotExists(db('file_attachments').select('id').whereRaw('file_attachments.file_id = files.id')).where('updated_at','<',new Date(Date.now()-config.unattachedHours*3600000)).limit(100);
    for(const row of rows)await db.transaction(async trx=>{
      const current=await trx('files').where({id:row.id}).forUpdate().first();
      if(!['pending','ready','rejected','expired'].includes(current.status)||new Date(current.updated_at)>new Date(Date.now()-config.unattachedHours*3600000))return;
      if(await trx('file_attachments').where({file_id:row.id}).first())return;
      await trx('files').where({id:row.id}).update({status:'deleting',updated_at:new Date()});await job(trx,row.id,'delete');
    });
    return expired.length + rows.length;
  }
  async function processDueJobs() {
    const config=limits();
    const jobs=await db('file_jobs').where('run_at','<=',new Date()).where('attempts','<',config.maxAttempts).orderBy('run_at').limit(10);
    for(const work of jobs)await processJob(work.id);
    return jobs.length;
  }
  async function nextJobAt() {
    const row = await db('file_jobs').where('attempts','<',limits().maxAttempts).min({run_at:'run_at'}).first();
    return row?.run_at ? new Date(row.run_at).getTime() : null;
  }
  // Retain the maintenance entry point used by existing callers.
  async function sweep() { await cleanup(); return processDueJobs(); }
  async function policyFor(user,purpose) { await authorizePurpose(user,purpose);return projection(purpose); }
  return {onWork,cleanup,processDueJobs,nextJobAt,scheduleUnreferencedDeletion,content,readResourceFiles,policyFor,reserve,complete,cancel,metadata,download,syncAttachments,listAttachments,sweep,processJob,projection};
}
module.exports = { createFilesService };
