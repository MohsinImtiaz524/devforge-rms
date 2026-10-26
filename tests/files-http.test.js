const test=require('node:test'),assert=require('node:assert/strict');
const {r2Config}=require('../src/modules/files/files.config');
test('Files R2 configuration accepts only private S3 endpoints',()=>{
 const names=['R2_BUCKET_NAME','R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'],saved=names.map(n=>process.env[n]);
 try{names.forEach(n=>delete process.env[n]);assert.throws(r2Config,{publicCode:'STORAGE_UNAVAILABLE'});Object.assign(process.env,{R2_BUCKET_NAME:'private-test',R2_ENDPOINT:'https://test.r2.cloudflarestorage.com',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test'});assert.equal(r2Config().bucket,'private-test');for(const endpoint of ['https://example.com','http://test.r2.cloudflarestorage.com','https://test.r2.cloudflarestorage.com/bucket','https://user:pass@test.r2.cloudflarestorage.com','https://test.r2.cloudflarestorage.com?x=1']){process.env.R2_ENDPOINT=endpoint;assert.throws(r2Config,{publicCode:'STORAGE_UNAVAILABLE'})}}
 finally{names.forEach((n,i)=>saved[i]===undefined?delete process.env[n]:process.env[n]=saved[i]);}
});
test('Files HTTP boundaries enforce authentication, flag, CSRF, purpose authority and safe policy projection',async()=>{
 const express=require('express'),app=express(),{createCsrfProtection}=require('../src/modules/session-security/csrf'),router=require('../src/modules/files/files.routes');
 let actor=null;app.use(express.json());app.use((req,res,next)=>{req.session=actor?{user:actor}:{};next()});app.use(createCsrfProtection({isProduction:true}));app.use('/api/files',router);
 const saved=process.env.FILES_ENABLED;process.env.FILES_ENABLED='true';const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  let response=await fetch(base+'/api/files/policies/announcement.attachment');assert.equal(response.status,401);
  actor={id:1,role:'superadmin'};
  const runtime=require('../src/modules/files/files.runtime'),original=runtime.service.content;
  runtime.service.content=async()=>({bytes:Buffer.from('verified-image'),mime:'image/png'});
  try{process.env.FILES_ENABLED='false';response=await fetch(base+'/api/files/123/content');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy'),/sandbox/);assert.match(response.headers.get('cache-control'),/no-store/);}finally{runtime.service.content=original;}
  process.env.FILES_ENABLED='false';response=await fetch(base+'/api/files/policies/announcement.attachment');assert.equal(response.status,404);process.env.FILES_ENABLED='true';
  response=await fetch(base+'/api/files/policies/announcement.attachment');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const policy=await response.json();assert.equal(policy.maxCount,5);assert.equal('scope' in policy,false);assert.equal(policy.types.includes('application/pdf'),false);
  actor={id:2,role:'admin',shop_id:1};response=await fetch(base+'/api/files/policies/announcement.attachment');assert.equal(response.status,403);
  response=await fetch(base+'/api/files/upload-sessions',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);assert.equal((await response.json()).code,'CSRF_REJECTED');
  actor={id:1,role:'superadmin'};response=await fetch(base+'/api/files/upload-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"bucket":"attacker"}'});assert.equal(response.status,400);
 }finally{await new Promise(resolve=>server.close(resolve));if(saved===undefined)delete process.env.FILES_ENABLED;else process.env.FILES_ENABLED=saved;await require('../db/knex').destroy();}
});
