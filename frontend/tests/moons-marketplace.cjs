const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
(async()=>{
 const dist=path.resolve(__dirname,'../dist');
 const server=http.createServer((req,res)=>{
  const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/app\//,'');
  const file=(relative.startsWith('assets/')||relative.startsWith('images/'))?path.join(dist,relative):path.join(dist,'index.html');
  if(!file.startsWith(dist+path.sep)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');
  fs.createReadStream(file).on('error',()=>{res.statusCode=404;res.end();}).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[],requests=[];
  let fail=false;
  const modules=[['dashboard','Overview','/app/dashboard'],['pos','Point of sale','/app/pos'],['sales-history','Sales','/app/sales'],['raw-stock','Inventory','/app/inventory'],['customers','Customers','/dashboard#customers'],['users','Staff','/app/staff'],['reports','Reports','/app/reports'],['settings','Settings','/dashboard#settings']].map(([id,label,target])=>({id,label,target,frontend:target.startsWith('/app/')?'react':'legacy'}));
  // Example catalog entries are browser fixtures only; they are never seeded into the application.
  const items=[['analytics','Analytics Moon','insights','See what is growing your business.',150000],['website','Website Moon','web','Give your shop a home online.',200000],['reviews','Reviews Moon','other','Turn customer feedback into better experiences.',100000],['staff','Staff Moon','people','Keep your team connected and on track.',100000],['inventory','Inventory Moon','other','Stay a step ahead of low stock.',0],['announcements','Announcements Moon','web','Share updates your customers care about.',50000]].map(([key,name,category,summary,amount])=>({key,name,category,summary,description:summary,artwork:[],features:['A helpful workspace'],price:{currency:'PKR',monthly_amount_minor:amount},route:'/app/moons/analytics',can_open:key==='analytics'}));
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());requests.push(url.pathname);let body={},status=200;
   if(url.pathname==='/api/auth/me')body={user:{id:1,role:'admin',name:'Muawia Imtiaz',shop_name:'My shop',permissions:['analytics.view']}};
   else if(url.pathname==='/api/lobby')body={modules};
   else if(url.pathname==='/api/moons/directory'){if(fail){status=503;body={error:'The directory is temporarily unavailable.'};}else body={items,user:{id:1,role:'admin',name:'Muawia Imtiaz',shop_name:'My shop'},subscriptions_enabled:false};}
   await route.fulfill({status,json:body});
  });
  const url='http://127.0.0.1:'+server.address().port+'/app/moons';await page.goto(url);
  await page.getByRole('heading',{name:'Find your next Moon',exact:true}).waitFor();
  await page.locator('.market-hero-combined').evaluate(image=>image.decode());
  assert.equal(await page.locator('.market-hero-png-slot').count(),0);
  assert.equal(await page.locator('.market-card').count(),6);
  assert.equal(requests.filter(url=>url==='/api/auth/me').length,0,'Moons must not load the expensive full profile endpoint');
  assert.equal(requests.filter(url=>url==='/api/moons/directory').length,1,'Only one directory bootstrap request per page load');
  const moonNav=page.getByRole('navigation',{name:'Moons navigation'});
  await moonNav.getByRole('button',{name:'My Moons'}).click();await page.getByRole('heading',{name:'Your next possibility starts here'}).waitFor();
  await moonNav.getByRole('button',{name:'Discover',exact:true}).click();
  assert.equal(await page.locator('.market-card').filter({hasText:'Free'}).count(),1);
  assert.equal(await page.locator('.market-active').count(),0,'Existing permissions must not be labelled active subscriptions');
  await page.getByRole('textbox',{name:'Search Moons'}).fill('analytics');assert.equal(await page.locator('.market-card').count(),1);
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('heading',{name:'No matching Moons'}).waitFor();
  await page.getByRole('button',{name:'Clear filters'}).click();assert.equal(await page.locator('.market-card').count(),6);
  await page.getByRole('tab',{name:/My Moons/}).click();await page.getByRole('heading',{name:'Your next possibility starts here'}).waitFor();
  await page.getByRole('tab',{name:'Discover',exact:true}).click();
  await page.getByRole('button',{name:'Manage subscriptions'}).click();await page.getByRole('dialog',{name:'Your Moon subscriptions'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'View details for Analytics Moon'}).click();await page.getByRole('dialog',{name:'Analytics Moon'}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Integrations',exact:true}).click();await page.getByRole('button',{name:/WhatsApp Coming soon/}).click();await page.getByRole('dialog',{name:'WhatsApp integration'}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Discover',exact:true}).click();
  const screenshots=path.resolve(__dirname,'../../reports/moons-marketplace');fs.mkdirSync(screenshots,{recursive:true});
  await page.screenshot({path:path.join(screenshots,'desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Open account menu'}).click();await page.getByRole('button',{name:'Switch to dark mode'}).click();assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),true);
  await page.screenshot({path:path.join(screenshots,'desktop-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Moons navigation'}).getByRole('button',{name:'Discover',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Point of sale',exact:true}).count(),0);await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).evaluate(element=>element===document.activeElement),true);
  await page.screenshot({path:path.join(screenshots,'mobile-dark.png'),fullPage:true});
  fail=true;await page.reload();await page.getByRole('alert').filter({hasText:'temporarily unavailable'}).waitFor();
  fail=false;await page.getByRole('button',{name:'Try again'}).click();await page.locator('.market-card').first().waitFor();
  assert.deepEqual(errors,[]);
  console.log('Marketplace: filters, tabs, details, honest subscription states, theme, internal Moons navigation, mobile drawer, retry and no-overflow checks passed.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
