const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
(async()=>{
 const dist=path.resolve(__dirname,'../dist');
 const server=http.createServer((req,res)=>{
  const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/app\//,'');
  const publicDir=path.resolve(__dirname,'../../public');
  const iconPath=new URL(req.url,'http://localhost').pathname;
  const file=iconPath.startsWith('/icons/')?path.join(publicDir,iconPath.slice(1)):relative.startsWith('assets/')?path.join(dist,relative):path.join(dist,'index.html');
  if(!file.startsWith(dist+path.sep)&&!file.startsWith(publicDir+path.sep)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');
  fs.createReadStream(file).on('error',()=>{res.statusCode=404;res.end();}).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],mutations=[];
  let role='superadmin',failure=false;
  let items=['staff','analytics','website'].map((key,i)=>({id:i+1,key,name:['Staff Management','Analytics','Website Builder & Publisher'][i],summary:'A useful module for your shop.',description:'Catalog details for this Moon.',category:['people','insights','web'][i],sort_order:i*10,version:0,status:'draft',implemented:i<2,launch_ready:key==='analytics',features:['A feature'],artwork:[],price:null}));
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());let data={},status=200;
   if(url.pathname==='/api/auth/me')data={user:{id:1,name:'Platform owner',role,permissions:[]}};
   else if(url.pathname==='/api/moons/admin')data={items,files_enabled:false};
   else if(url.pathname.startsWith('/api/moons/admin/')&&req.method()!=='GET'){
    const body=req.postDataJSON(),key=url.pathname.split('/')[4];mutations.push({body,path:url.pathname});
    if(failure){status=409;data={error:'This Moon changed. Reload it before saving.'};}
    else {items=items.map(item=>item.key!==key?item:{...item,...(url.pathname.endsWith('/prices')?{price:{id:1,...body}}:body),version:item.version+1});data=items.find(item=>item.key===key);}
   }
   else if(url.pathname.endsWith('/history'))data={events:[],prices:[]};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  const url='http://127.0.0.1:'+server.address().port+'/app/moons/manage';
  await page.goto(url);await page.getByRole('heading',{name:'Moons Catalog',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit details',exact:true}).first().waitFor();
  assert.equal(await page.locator('.moons-card').count(),3);
  assert.equal(await page.getByLabel('Status for Website Builder & Publisher').locator('option[value="published"]').evaluate(option=>option.disabled),true);
  await page.getByRole('button',{name:'Edit details',exact:true}).first().click();
  let dialog=page.getByRole('dialog',{name:'Edit Moon details'});await dialog.waitFor();
  await dialog.getByLabel('Name',{exact:true}).fill('People workspace');
  await dialog.getByRole('button',{name:'Save details',exact:true}).click();
  await page.getByRole('heading',{name:'People workspace',exact:true}).waitFor();
  const card=page.locator('.moons-card').first();
  await card.getByLabel('Monthly price for People workspace').fill('3000.50');
  await card.getByRole('button',{name:'Save offered price'}).click();
  await page.getByText('PKR 3,000.50 / month',{exact:true}).waitFor();
  assert.equal(mutations.at(-1).body.monthly_amount_minor,300050);
  failure=true;await page.getByRole('button',{name:'Edit details',exact:true}).first().click();
  dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Save details',exact:true}).click();
  await dialog.getByRole('alert').waitFor();assert.equal(await dialog.isVisible(),true);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'Edit details',exact:true}).first().evaluate(el=>el===document.activeElement),true);
  const screenshots=path.resolve(__dirname,'../../reports/moons-catalog');fs.mkdirSync(screenshots,{recursive:true});
  await page.screenshot({path:path.join(screenshots,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page must not overflow');
  await page.screenshot({path:path.join(screenshots,'mobile-dark.png'),fullPage:true});
  role='admin';await page.reload();await page.getByRole('alert').filter({hasText:'Only the Super Admin'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Edit details',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Moons UI: desktop/mobile, dark mode, edit/price, conflict recovery, focus and unauthorized checks passed.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
