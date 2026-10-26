// Mocked browser flow: never touches a database or R2 bucket.
const {chromium,expect}=require('@playwright/test');
const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os'),crypto=require('node:crypto');
async function main(){
 const cwd=path.resolve(__dirname,'..'),port=4189,base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,[path.join(cwd,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd,windowsHide:true,stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/app/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=','base64');
  let ready=false,saved=null,enabled=true,legacyPosts=0,currentId=null;const sessions=new Map();
  const metadata=id=>({id,purpose:'announcement.artwork',name:'artwork.png',mime:'image/png',size:png.length,status:ready?'ready':'verifying',preview_url:base+'/api/files/'+id+'/content'});
  await page.route('**/api/**',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname;if(!p.startsWith('/api/'))return route.continue();let data={};
   if(p==='/api/auth/me')data={user:{id:1,role:'superadmin',name:'Test Admin'}};
   else if(p==='/api/announcements/admin/options')data={files_enabled:enabled,shop_types:['restaurant'],roles:[],permissions:[]};
   else if(p==='/api/announcements/admin')data={items:saved?[saved]:[]};
   else if(p.startsWith('/api/files/policies/'))data={types:['image/png','image/gif'],maxBytes:8388608,maxCount:p.endsWith('announcement.artwork')?1:5,maxTotalBytes:52428800};
   else if(p==='/api/files/upload-sessions'){currentId=crypto.randomUUID();const sessionId=crypto.randomUUID();sessions.set(sessionId,currentId);data={fileId:currentId,sessionId,url:base+'/api/mock-staging',headers:{'Content-Type':'image/png'}};}
   else if(p==='/api/mock-staging')return route.fulfill({status:200,body:''});
   else if(p.endsWith('/content'))return route.fulfill({status:200,contentType:'image/png',body:png});
   else if(p.endsWith('/complete'))data={status:'verifying'};
   else if(p.startsWith('/api/files/')&&req.method()==='GET')data=metadata(p.split('/').pop());
   else if(p.endsWith('/media')&&req.method()==='POST')legacyPosts++;
   else if(p.endsWith('/attachments'))data={enabled,items:[]};
   else if((p==='/api/announcements'&&req.method()==='POST')||(p==='/api/announcements/99'&&req.method()==='PATCH')){const body=req.postDataJSON();saved={...body,id:99,version:(saved?.version??-1)+1,status:'draft',artwork_source:body.artwork_file_id?'files':'none',artwork_file:body.artwork_file_id?metadata(body.artwork_file_id):null,media_url:body.artwork_file_id?'/api/files/'+body.artwork_file_id+'/content':null};data=saved;}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'/app/announcements/manage');await page.getByRole('button',{name:'New announcement'}).click();
  for(const [field,value]of Object.entries({internal_name:'shared-artwork',headline:'Shared image pipeline',summary:'Announcement image test',body:'Transactional artwork and image validation'}))await page.locator(`[name=${field}]`).fill(value);
  const art=page.getByRole('region',{name:'Announcement artwork'}),picker=art.locator('input[type=file]');await expect(picker).toBeEnabled();
  await picker.setInputFiles({name:'artwork.png',mimeType:'image/png',buffer:png});await expect(art).toContainText('verifying');await expect(page.getByRole('button',{name:'Save draft'})).toBeDisabled();
  ready=true;await expect(art).toContainText('ready');const first=currentId;
  ready=false;await picker.setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:png});await expect(art).toContainText('verifying');await expect(art.locator('li')).toHaveCount(1);ready=true;await expect(art).toContainText('ready');const replacement=currentId;if(first===replacement)throw Error('Replacement reused a file ID');
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'rms-artwork-ui-'));await art.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'desktop-light.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));await art.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'mobile-dark.png'),fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal mobile overflow');
  await page.getByRole('button',{name:'Save draft'}).click();await expect(page.locator('.announcement-editor')).toHaveCount(0);if(saved.artwork_file_id!==replacement||legacyPosts)throw Error('Artwork did not save exclusively through stable file IDs');
  await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(art.locator('img')).toHaveCount(1);await art.getByRole('button',{name:/Remove/}).click();await page.getByRole('button',{name:'Save draft'}).click();await expect(page.locator('.announcement-editor')).toHaveCount(0);if(saved.artwork_file_id!==null)throw Error('Artwork removal was not explicit');
  enabled=false;await page.reload();await page.getByRole('button',{name:'New announcement'}).click();await expect(page.locator('.file-upload')).toHaveCount(0);await expect(page.locator('input[name=media]')).toHaveCount(1);
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: artwork verification, replacement, file-ID save, existing preview, removal, mobile layout and flag-off compatibility. Screenshots: '+output);
 }finally{if(browser)await browser.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
