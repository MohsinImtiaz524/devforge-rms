const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const knex=require('knex');const sharp=require('sharp');
const {ensureFilesSchema}=require('../src/modules/files/files.migration');
const {ensureShopLogoSchema}=require('../src/modules/shops/shops.migration');
const {createFilesService}=require('../src/modules/files/files.service');
const {createLogoService}=require('../src/modules/shops/shops.logo');
const {resources,authorizeLogoUpload}=require('../src/modules/shops/shops.files');
async function fixture(){
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});await db.raw('PRAGMA foreign_keys = ON');
 await db.schema.createTable('shops',t=>{t.integer('id').primary();t.text('logo_data');t.text('logo_path');t.text('receipt_header_text')});await db.schema.createTable('users',t=>t.integer('id').primary());
 await db('shops').insert([{id:1,logo_path:'/uploads/receipt-assets/original.png',receipt_header_text:'Keep this header'},{id:2,logo_data:'data:image/png;base64,legacy'}]);await db('users').insert([{id:1},{id:2},{id:3}]);
 await ensureShopLogoSchema(db);await ensureFilesSchema(db);const objects=new Map();
 const storageFactory=()=>({uploadUrl:async()=> 'https://storage.invalid',read:async key=>{if(!objects.has(key))throw Error('Storage unavailable');return objects.get(key)},put:async(key,b)=>objects.set(key,b),remove:async key=>objects.delete(key),close(){}});
 const files=createFilesService({db,resources,purposeAuthorizers:{'company.logo':authorizeLogoUpload},storageFactory});const logos=createLogoService({db,files});const admin={id:1,role:'admin',shop_id:1},other={id:2,role:'admin',shop_id:2},staff={id:3,role:'cashier',shop_id:1};
 async function ready(user=admin,purpose='company.logo'){
 const bytes=await sharp({create:{width:80,height:40,channels:4,background:'#ff6600'}}).png().toBuffer();
 const upload=await files.reserve(user,{purpose,filename:'logo.png',contentType:'image/png',size:bytes.length,idempotencyKey:crypto.randomUUID()});
 const session=await db('file_upload_sessions').where({id:upload.sessionId}).first();objects.set(session.staging_key,bytes);await files.complete(user,upload.sessionId);await files.sweep();return upload.fileId;
 }
 return {db,objects,files,logos,admin,other,staff,ready};
}
test('shop logos preserve legacy data, reject unauthorized uploads, and publish verified receipt snapshots atomically',async()=>{
 const f=await fixture();const {db,logos,files,admin,other,staff}=f;
 try{
  await ensureShopLogoSchema(db);assert.equal((await db('shops').where({id:1}).first()).logo_print_width_mm,60);
  assert.equal((await logos.get(admin)).legacy_url,'/uploads/receipt-assets/original.png');
  await assert.rejects(files.policyFor(staff,'company.logo'),{status:403});await assert.rejects(logos.save(staff,{file_id:null}),{status:403});
  await assert.rejects(logos.save(admin,{file_id:'bad'}));assert.equal((await db('shops').where({id:1}).first()).logo_path,'/uploads/receipt-assets/original.png');
  const id=await f.ready();await assert.rejects(logos.save(other,{file_id:id}),{status:404});
  const saved=await logos.save(admin,{file_id:id});assert.equal(saved.file.id,id);assert.equal(saved.legacy_url,null);
  const shop=await db('shops').where({id:1}).first();assert.equal(shop.logo_path,null);assert.equal(shop.receipt_header_text,'Keep this header');
  const content=await files.content(admin,id);assert.equal(shop.logo_data,'data:'+content.mime+';base64,'+content.bytes.toString('base64'));
  assert.deepEqual((await files.content(staff,id)).bytes,content.bytes);await assert.rejects(files.content(other,id),{status:404});
  assert.equal((await db('shops').where({id:2}).first()).logo_data,'data:image/png;base64,legacy');
  const replacement=await f.ready();const before=(await db('shops').where({id:1}).first()).logo_data;
  await db.raw("CREATE TRIGGER reject_logo BEFORE UPDATE OF logo_data ON shops BEGIN SELECT RAISE(ABORT, 'simulated save failure'); END");
  await assert.rejects(logos.save(admin,{file_id:replacement}),/simulated save failure/);
  assert.equal((await logos.get(admin)).file.id,id);assert.equal((await db('shops').where({id:1}).first()).logo_data,before);assert.equal((await db('file_jobs').where({file_id:id,kind:'delete'})).length,0);
  await db.raw('DROP TRIGGER reject_logo');await logos.save(admin,{file_id:replacement});assert.equal((await logos.get(admin)).file.id,replacement);assert.equal((await db('file_jobs').where({file_id:id,kind:'delete'})).length,1);
  await logos.save(admin,{file_id:null});assert.equal((await logos.get(admin)).file,null);const removed=await db('shops').where({id:1}).first();assert.equal(removed.logo_data,null);assert.equal(removed.logo_path,null);assert.equal(removed.receipt_header_text,'Keep this header');
 }finally{await db.destroy();}
});
test('logo verification and unavailable storage never replace the existing logo',async()=>{
 const f=await fixture();try{
 const id=await f.ready();const row=await f.db('files').where({id}).first();f.objects.delete(row.storage_key);
 await assert.rejects(f.logos.save(f.admin,{file_id:id}),/Storage unavailable/);assert.equal((await f.logos.get(f.admin)).legacy_url,'/uploads/receipt-assets/original.png');
 await f.db('files').where({id}).update({status:'verifying'});await assert.rejects(f.logos.save(f.admin,{file_id:id}),{publicCode:'FILE_NOT_READY'});assert.equal((await f.db('file_attachments')).length,0);
 }finally{await f.db.destroy();}
});
test('receipt preview and server printing retain legacy logos and honor the selected proportional size',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),safety=require('../public/js/image-safety');
 const settings={name:'Test shop',logo_path:'/uploads/receipt-assets/existing.png',logo_url:'/uploads/receipt-assets/existing.png',use_logo_on_receipt:true,use_text_on_receipt:true,logo_print_width_mm:30};
 const context=vm.createContext({RmsImageSafety:safety,document:{getElementById:id=>id==='modal'?{addEventListener(){}}:null},shopCurrencyCode:()=> 'PKR',setTimeout(){},console,fetch:async()=>({ok:true,json:async()=>settings})});
 vm.runInContext(fs.readFileSync(require.resolve('../public/js/settings.js'),'utf8'),context);await vm.runInContext('fetchReceiptSettings()',context);
 const preview=vm.runInContext('renderReceiptPreview()',context);assert.match(preview,/existing\.png/);assert.match(preview,/max-width: 30mm; max-height: 11mm/);
 const markup=await vm.runInContext('renderReceiptSettings()',context);assert.doesNotMatch(markup,/id="logo-file"/);assert.match(markup,/renderSettings\('profile'\)/);assert.match(markup,/id="logo-print-width"/);
 const {renderSaleReceiptPage}=require('../services/ReceiptPrintService');
 const details={sale:{id:1,created_at:new Date().toISOString(),subtotal:0,total:0,payment_method:'cash'},items:[],shop:settings};
 const receipt=renderSaleReceiptPage(details,{autoPrint:false});assert.match(receipt,/existing\.png/);assert.match(receipt,/max-width: 30mm; max-height: 11mm/);
 delete settings.logo_print_width_mm;assert.match(renderSaleReceiptPage(details,{autoPrint:false}),/max-width: 60mm; max-height: 22mm/);
 settings.use_logo_on_receipt=false;assert.doesNotMatch(renderSaleReceiptPage(details,{autoPrint:false}),/existing\.png/);
});
test('logo HTTP APIs enforce authentication, admin access, feature gate, strict payloads, CSRF, and legacy-write rejection',async()=>{
 const express=require('express'),app=express();let actor=null;const {createCsrfProtection}=require('../src/modules/session-security/csrf');
 app.use(express.json());app.use((req,res,next)=>{req.session=actor?{user:actor}:{};next()});app.use(createCsrfProtection({isProduction:true}));app.use('/api/shop-settings',require('../routes/shop-settings'));app.use((e,req,res,next)=>res.status(e.status||400).json({error:'Invalid request'}));
 const previous=process.env.FILES_ENABLED;process.env.FILES_ENABLED='true';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const put=body=>fetch(base+'/api/shop-settings/logo',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/api/shop-settings/logo')).status,401);actor={id:3,role:'cashier',shop_id:1};assert.equal((await put({file_id:null})).status,403);
  actor={id:1,role:'admin',shop_id:1};process.env.FILES_ENABLED='false';assert.equal((await put({file_id:null})).status,404);process.env.FILES_ENABLED='true';
  assert.equal((await put({file_id:null,shop_id:2})).status,400);assert.equal((await put({file_id:'invalid'})).status,400);
  assert.equal((await fetch(base+'/api/shop-settings/logo',{method:'PUT',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{"file_id":null}'})).status,403);
  assert.equal((await fetch(base+'/api/shop-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"logo_data":""}'})).status,409);
  assert.equal((await fetch(base+'/api/shop-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"logo_print_width_mm":999}'})).status,400);
  const form=new FormData();form.append('logo',new Blob(['invalid'],{type:'image/png'}),'logo.png');assert.equal((await fetch(base+'/api/shop-settings',{method:'POST',body:form})).status,400);
 }finally{await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.FILES_ENABLED;else process.env.FILES_ENABLED=previous;await require('../db/knex').destroy();}
});
