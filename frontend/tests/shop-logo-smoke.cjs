// Mocked browser verification; no real shop data or R2 objects are changed.
const {chromium,expect}=require('@playwright/test');const {spawn}=require('node:child_process');const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os'),crypto=require('node:crypto');
async function main(){
 const cwd=path.resolve(__dirname,'..'),port=4191,base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,[path.join(cwd,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd,windowsHide:true,stdio:'ignore'});let browser;
 try{
  for(let n=0;n<60;n++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=','base64');let id,ready=false,saved=null,failSave=false,saves=0,legacy=true;
  const meta=()=>({id,purpose:'company.logo',status:ready?'ready':'verifying',name:'logo.png',mime:'image/png',size:png.length,preview_url:'/api/files/'+id+'/content'});
  await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname;if(!p.startsWith('/api/'))return route.continue();let data={};
   if(p==='/api/shop-settings/logo'){
    if(req.method()==='PUT'){saves++;if(failSave)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Save unavailable. Please retry.'})});const body=req.postDataJSON();saved=body.file_id;legacy=false;}
    data={file:saved?{...meta(),id:saved,status:'ready'}:null,legacy_url:legacy?'data:image/png;base64,'+png.toString('base64'):null};
   }else if(p.startsWith('/api/files/policies/'))data={types:['image/png'],maxCount:1,maxBytes:5242880,maxTotalBytes:5242880,autoResize:true};
   else if(p==='/api/files/upload-sessions'){id=crypto.randomUUID();data={fileId:id,sessionId:crypto.randomUUID(),url:base+'/api/mock-staging',headers:{'Content-Type':'image/png'}};}
   else if(p==='/api/mock-staging')return route.fulfill({status:200,body:''});
   else if(p.endsWith('/content'))return route.fulfill({status:200,contentType:'image/png',body:png});
   else if(p.endsWith('/complete'))data={status:'verifying'};
   else if(p.startsWith('/api/files/'))data=meta();
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'/app/shop-logo');await expect(page.getByAltText('Current shop logo')).toBeVisible();const save=page.getByRole('button',{name:'Save shop logo',exact:true});await expect(save).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});await expect(page.locator('.file-upload')).toContainText('verifying');await expect(save).toBeDisabled();if(saves)throw Error('Saved before verification');ready=true;await expect(page.locator('.file-upload')).toContainText('ready');
  failSave=true;await save.click();await expect(page.getByRole('alert')).toContainText('Save unavailable');if(!legacy||saved)throw Error('Failed save replaced legacy logo');await expect(page.getByAltText('Current shop logo')).toBeVisible();
  failSave=false;await save.click();await expect(page.getByRole('status').filter({hasText:'Shop logo saved'})).toBeVisible();if(saved!==id)throw Error('Wrong file ID saved');await expect(page.getByAltText('Current shop logo')).toHaveCount(0);
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'rms-shop-logo-ui-'));await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.reload();await expect(page.locator('.file-upload li')).toHaveCount(1);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:path.join(output,'mobile-dark.png'),fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
  await page.getByRole('button',{name:/Remove logo/}).click();await save.click();await expect(page.getByRole('status').filter({hasText:'Shop logo saved'})).toBeVisible();if(saved!==null)throw Error('Logo removal was not saved');if(errors.length)throw Error(errors.join('\n'));
  await page.setContent('<iframe title="Shop logo" src="'+base+'/app/shop-logo" style="width:100%;height:580px"></iframe>');
  const frame=page.frameLocator('iframe');await expect(frame.getByRole('heading',{name:'Shop logo',exact:true})).toBeVisible();
  await page.evaluate(()=>document.documentElement.classList.add('dark'));await expect(frame.locator('html')).toHaveClass(/dark/);
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));await expect(frame.locator('html')).not.toHaveClass(/dark/);
  console.log('PASS: legacy preview, verification gate, failed save preservation/retry, file-ID save, reload, removal, mobile dark layout. Screenshots: '+output);
 }finally{if(browser)await browser.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
