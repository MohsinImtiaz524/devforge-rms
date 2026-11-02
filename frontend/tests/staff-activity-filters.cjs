const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
(async()=>{
 const dist=path.resolve(__dirname,'../dist');
 const server=http.createServer((req,res)=>{
  const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/app\//,'');const file=relative.startsWith('assets/')?path.join(dist,relative):path.join(dist,'index.html');
  if(!file.startsWith(dist+path.sep)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).on('error',()=>res.writeHead(404).end()).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1366,height:950}});const errors=[],requests=[];
  let failMetrics=false;
  const staff=[{id:1,full_name:'Alice',department_id:10},{id:2,full_name:'Bob',department_id:20},{id:3,full_name:'Carol',department_id:10}];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url());requests.push(url.pathname+url.search);let body={},status=200;
   if(url.pathname==='/api/auth/me')body={user:{id:1,shop_id:1,role:'manager',name:'Manager',permissions:['staff_activity.view','staff_activity.manage','staff_activity.export']}};
   else if(url.pathname==='/api/staff-activity/filters')body={staff,departments:[{id:10,name:'Service'},{id:20,name:'Kitchen'}]};
   else if(url.pathname==='/api/staff-activity/report'){
    if(url.searchParams.get('staff_profile_id')==='1')await new Promise(resolve=>setTimeout(resolve,600));
    if(failMetrics){status=503;body={error:'Metrics temporarily unavailable'};}
    else {const from=url.searchParams.get('from'),to=url.searchParams.get('to');body={rows:staff.filter(person=>(!url.searchParams.get('department_id')||String(person.department_id)===url.searchParams.get('department_id'))&&(!url.searchParams.get('staff_profile_id')||String(person.id)===url.searchParams.get('staff_profile_id'))).map(person=>({staff_profile_id:person.id,full_name:person.full_name,employee_id:'EMP-'+person.id,orders_handled:1,orders_total:from==='2026-11-01'&&to==='2026-11-02'?100000:70000}))};}
   }else if(url.pathname==='/api/staff-activity/records'){
    const records=[{id:1,staff_profile_id:1,department_id:10,full_name:'Alice',record_type:'task',title:'Early task',details:'Earlier date',occurred_on:'2026-11-01',status:'completed'},{id:2,staff_profile_id:2,department_id:20,full_name:'Bob',record_type:'recognition',title:'Later recognition',details:'Later date',occurred_on:'2026-11-02',status:'completed'}];
    body=records.filter(record=>record.occurred_on>=url.searchParams.get('from')&&record.occurred_on<=url.searchParams.get('to')&&(!url.searchParams.get('department_id')||String(record.department_id)===url.searchParams.get('department_id'))&&(!url.searchParams.get('staff_profile_id')||String(record.staff_profile_id)===url.searchParams.get('staff_profile_id'))&&(!url.searchParams.get('record_type')||record.record_type===url.searchParams.get('record_type')));
   }
   try{await route.fulfill({status,json:body});}catch(error){if(!request.failure())throw error;}
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/app/staff');
  await page.getByRole('heading',{name:'Staff activity & records'}).waitFor();const filters=page.locator('.activity-filters');
  await filters.getByLabel('From',{exact:true}).fill('2026-11-01');await filters.getByLabel('To',{exact:true}).fill('2026-11-02');
  await page.locator('.activity-metrics').getByText(/100,000/).first().waitFor();
  const firstRequest=page.waitForRequest(req=>req.url().includes('/staff-activity/report?')&&new URL(req.url()).searchParams.get('staff_profile_id')==='1');
  await filters.getByLabel('Staff',{exact:true}).selectOption('1');await firstRequest;
  await filters.getByLabel('Staff',{exact:true}).selectOption('2');
  await page.locator('.activity-metrics tbody tr').filter({hasText:'Bob'}).waitFor();await page.waitForTimeout(750);
  assert.equal(await page.locator('.activity-metrics tbody tr').filter({hasText:'Alice'}).count(),0,'Older request must not overwrite newer Staff filter');
  await filters.getByLabel('Department',{exact:true}).selectOption('10');assert.equal(await filters.getByLabel('Staff',{exact:true}).inputValue(),'');
  assert.equal(await filters.getByLabel('Staff',{exact:true}).locator('option').count(),3);
  await page.locator('.activity-metrics tbody tr').filter({hasText:'Carol'}).waitFor();
  await filters.getByLabel('Department',{exact:true}).selectOption('');
  await page.getByRole('button',{name:'Tasks & records',exact:true}).click();await page.getByRole('heading',{name:'Early task',exact:true}).waitFor();
  await filters.getByLabel('From',{exact:true}).fill('2026-11-02');await page.getByRole('heading',{name:'Later recognition',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Early task',exact:true}).waitFor({state:'hidden'});
  await filters.getByLabel('Record type').selectOption('task');await page.getByText('No tasks or records in this range.').waitFor();
  await filters.getByLabel('Record type').selectOption('recognition');await page.getByRole('heading',{name:'Later recognition',exact:true}).waitFor();
  const exportUrl=await filters.getByRole('link',{name:'Export metrics CSV'}).getAttribute('href');assert.ok(exportUrl.includes('from=2026-11-02'));assert.ok(exportUrl.includes('to=2026-11-02'));
  await filters.getByLabel('From',{exact:true}).fill('');await page.getByRole('alert').filter({hasText:'Choose both'}).waitFor();assert.equal(await filters.getByRole('link',{name:'Export metrics CSV',includeHidden:true}).count(),0);
  await filters.getByLabel('From',{exact:true}).fill('2026-11-02');await page.getByRole('heading',{name:'Later recognition',exact:true}).waitFor();
  failMetrics=true;await page.getByRole('button',{name:'Operational metrics',exact:true}).click();await page.getByRole('alert').filter({hasText:'Metrics temporarily unavailable'}).waitFor();
  await page.getByRole('button',{name:'Tasks & records',exact:true}).click();await page.getByRole('heading',{name:'Later recognition',exact:true}).waitFor();
  failMetrics=false;await page.getByRole('button',{name:'Operational metrics',exact:true}).click();await page.locator('.activity-metrics').waitFor();assert.equal(await page.getByRole('alert').count(),0);
  assert.equal(requests.filter(url=>url==='/api/staff-activity/filters').length,1,'Options load independently once');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('Staff activity filters: custom dates, staff/department, record type, request races, invalid dates, export scope and independent recovery passed.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
