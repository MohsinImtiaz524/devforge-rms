const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
test('announcement saves commit attachments atomically and preserve existing attachments when IDs are omitted',async()=>{
 const root=path.resolve(__dirname,'..'),previous=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-files-announcement-'));
 fs.mkdirSync(path.join(tmp,'db'));process.chdir(tmp);process.env.DB_CLIENT='sqlite';const enabled=process.env.FILES_ENABLED;process.env.FILES_ENABLED='true';
 const db=require(path.join(root,'db/knex'));
 try{
  await db.raw('PRAGMA foreign_keys = ON');await db.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');});await db.schema.createTable('shops',t=>{t.integer('id').primary();t.string('shop_type');t.string('status');});await db('shops').insert([{id:1,shop_type:'restaurant',status:'active'},{id:2,shop_type:'retail',status:'active'}]);await db('users').insert([{id:1,shop_id:null},{id:2,shop_id:1},{id:3,shop_id:2}]);await db.schema.createTable('roles',t=>{t.increments('id');t.integer('shop_id');t.string('name');});await db.schema.createTable('user_roles',t=>{t.integer('user_id');t.integer('role_id');});
  await require('../src/modules/announcements/announcements.migration').ensureAnnouncementsKnexSchema(db);await require('../src/modules/files/files.migration').ensureFilesSchema(db);await require('../src/modules/announcements/announcements.migration').ensureAnnouncementArtworkSchema(db);await require('../src/modules/announcements/announcements.migration').ensureAnnouncementArtworkSchema(db);
  const service=require('../src/modules/announcements/announcements.service'),files=require('../src/modules/files/files.runtime').service;
  const user={id:1,role:'superadmin'},id=crypto.randomUUID(),foreign=crypto.randomUUID();
  await db('files').insert([id,foreign].map((value,i)=>({id:value,scope_key:'platform',shop_id:null,uploader_id:i+1,purpose:'announcement.attachment',original_name:'file.png',storage_key:'files/final/'+value,status:'ready',verified_bytes:100,mime_type:'image/png'})));
  const data={internal_name:'attachment-test',headline:'Shared attachments',summary:'Attachment test summary',body:'Attachment test body',type:'product_update',priority:'normal',display_policy:'standard',shop_types:['restaurant'],roles:[],permissions:[],attachment_ids:[id]};
  let row=await service.create(user,data);assert.deepEqual((await files.listAttachments(user,{type:'announcement',id:row.id})).map(f=>f.id),[id]);
  row=await service.update(user,row.id,{headline:'Headline edited',version:row.version});assert.equal((await files.listAttachments(user,{type:'announcement',id:row.id})).length,1);
  await assert.rejects(service.create(user,{...data,attachment_ids:[foreign]}),{status:403});assert.equal((await db('announcements')).length,1);
  await assert.rejects(service.update(user,row.id,{version:row.version,attachment_ids:[foreign]}),{status:403});assert.equal((await db('announcements').where({id:row.id}).first()).version,row.version);assert.equal((await files.listAttachments(user,{type:'announcement',id:row.id})).length,1);
  process.env.FILES_ENABLED='false';await assert.rejects(service.update(user,row.id,{version:row.version,attachment_ids:[]}),{publicCode:'FILES_DISABLED'});process.env.FILES_ENABLED='true';
  row=await service.update(user,row.id,{version:row.version,attachment_ids:[]});assert.equal((await files.listAttachments(user,{type:'announcement',id:row.id})).length,0);
  const artId=crypto.randomUUID(),nextArt=crypto.randomUUID();
  await db('files').insert([artId,nextArt].map(value=>({id:value,scope_key:'platform',shop_id:null,uploader_id:1,purpose:'announcement.artwork',original_name:'art.png',storage_key:'files/final/'+value,status:'ready',verified_bytes:100,mime_type:'image/png'})));
  let artworkAnnouncement=await service.create(user,{...data,attachment_ids:[],artwork_file_id:artId,artwork_alt:'New artwork'});
  const recipient={id:2,role:'admin',shop_id:1,permissions:[]},wrongAudience={id:3,role:'admin',shop_id:2,permissions:[]};
  await assert.rejects(files.metadata(recipient,artId),{status:404});
  const published=await service.changeStatus(user,artworkAnnouncement.id,'publish',{version:artworkAnnouncement.version});artworkAnnouncement.version=published.version;
  assert.equal((await files.metadata(recipient,artId)).id,artId);await assert.rejects(files.metadata(wrongAudience,artId),{status:404});
  assert.equal(artworkAnnouncement.artwork_file_id,artId);assert.equal(artworkAnnouncement.media_url,'/api/files/'+artId+'/content');assert.equal(artworkAnnouncement.media_alt,'New artwork');
  await assert.rejects(service.update(user,artworkAnnouncement.id,{version:artworkAnnouncement.version,artwork_file_id:foreign}),{publicCode:'FILE_NOT_READY'});
  assert.equal((await db('announcements').where({id:artworkAnnouncement.id}).first()).version,artworkAnnouncement.version);
  assert.equal((await files.listAttachments(user,{type:'announcement.artwork',id:artworkAnnouncement.id}))[0].id,artId);
  let artworkRow=await service.update(user,artworkAnnouncement.id,{version:artworkAnnouncement.version,artwork_file_id:nextArt,artwork_alt:'Replacement'});
  assert.equal(artworkRow.artwork_file_id,nextArt);assert.equal((await db('files').where({id:artId}).first()).status,'ready');
  await assert.rejects(service.update(user,artworkRow.id,{version:0,artwork_file_id:artId}),{publicCode:'ANNOUNCEMENT_VERSION_CONFLICT'});
  artworkRow=await service.update(user,artworkRow.id,{version:artworkRow.version,artwork_file_id:null});assert.equal(artworkRow.media_url,null);assert.equal(artworkRow.artwork_source,'none');
  await assert.rejects(service.uploadMedia(user,artworkRow.id,null),{publicCode:'LEGACY_UPLOAD_DISABLED'});
  await service.changeStatus(user,row.id,'archive',{});await assert.rejects(service.update(user,row.id,{version:row.version+1,attachment_ids:[id]}),{publicCode:'ANNOUNCEMENT_LOCKED'});
 }finally{await db.destroy();if(enabled===undefined)delete process.env.FILES_ENABLED;else process.env.FILES_ENABLED=enabled;process.chdir(previous);fs.rmSync(tmp,{recursive:true,force:true});}
});
