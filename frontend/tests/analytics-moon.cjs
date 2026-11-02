const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const fixture=require('./fixtures/analytics-moon.json');
(async()=>{
 const dist=path.resolve(__dirname,'../dist'),publicDir=path.resolve(__dirname,'../../public');
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),relative=url.pathname.replace(/^\/app\//,'');
  const file=url.pathname.startsWith('/icons/')?path.join(publicDir,url.pathname.slice(1)):relative.startsWith('assets/')?path.join(dist,relative):path.join(dist,'index.html');
  if(!file.startsWith(dist+path.sep)&&!file.startsWith(publicDir+path.sep)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');
  fs.createReadStream(file).on('error',()=>{res.statusCode=404;res.end();}).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],requests=[];let denied=false;
  const actor={id:2,shop_id:1,name:'Shop owner',shop_name:'Test Restaurant',role:'admin',permissions:['analytics.view','dashboard.view']};
  const moon={key:'analytics',name:'Analytics',summary:'Understand sales and business performance.',description:'The existing Analytics panel, available as a Moon.',artwork:[],features:['Overview','Sales analysis'],can_open:true,route:'/app/moons/analytics'};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());requests.push(url.pathname+url.search);let body={};
   if(url.pathname==='/api/auth/me')body={user:{...actor,permissions:denied?[]:actor.permissions}};
   else if(url.pathname==='/api/moons/directory')body={items:[moon],user:actor,subscriptions_enabled:false};
   else if(url.pathname==='/api/lobby')body={user:actor,modules:[{id:'analytics',label:'Analytics',frontend:'react',target:'/app/analytics'},{id:'moons',label:'Moons',frontend:'react',target:'/app/moons'}],register:{active:false}};
   else if(url.pathname==='/api/analytics/dashboard-data')body={...fixture,selectedBrandId:url.searchParams.get('brand_id')?1:null};
   else if(url.pathname==='/api/ai/insights')body={summary:{verdict:'Steady performance',aiConfidence:'High'},rawMetrics:{margin:'60%',growth:'20%'},insights:[],recommendations:[]};
   await route.fulfill({json:body});
  });
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/app/lobby');
  await page.getByRole('button').filter({hasText:'Moons'}).first().click();
  await page.waitForURL('**/app/moons');await page.getByRole('heading',{name:'Moons',exact:true}).waitFor();
  await page.getByRole('link',{name:'Open Analytics',exact:true}).click();
  await page.waitForURL('**/app/moons/analytics');await page.locator('#chart-sales-overview svg').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Analytics & Reports',exact:true}).count(),1);
  const navigation=page.getByRole('navigation',{name:'Analytics panels'});const count=await navigation.getByRole('button').count();
  assert.equal(count,11,'All existing Analytics tabs should be retained');
  for(let i=0;i<count;i++){await navigation.getByRole('button').nth(i).click();await page.waitForTimeout(70);}
  assert.deepEqual(errors,[]);
  await navigation.getByRole('button').first().click();
  const screenshots=path.resolve(__dirname,'../../reports/analytics-moon');fs.mkdirSync(screenshots,{recursive:true});
  await page.screenshot({path:path.join(screenshots,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(screenshots,'mobile-dark.png'),fullPage:true});
  await page.goto(base+'/app/analytics');await page.locator('#chart-sales-overview svg').waitFor();
  assert.ok(requests.some(url=>url.startsWith('/api/analytics/dashboard-data')));
  assert.ok(!requests.some(url=>url.startsWith('/api/moons/analytics/dashboard-data')),'Both panel copies retain existing API calls');
  denied=true;await page.reload();await page.getByRole('alert').filter({hasText:'You do not have permission to view Analytics.'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Analytics copy: Moons navigation, all 11 tabs, original URL, mobile/dark mode and existing permission behavior passed.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
