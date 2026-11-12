const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setup=eval('('+source.slice(source.indexOf('async function setup('),source.indexOf('\n(async')).trim()+')');
const base='http://127.0.0.1:5175/app/pos';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const shopType of ['retail','retail_restaurant','restaurant'])for(const type of ['walk_in','takeaway'])for(const queued of [2,0]){
  if(shopType==='restaurant'&&type==='walk_in')continue;
  const permissions=['orders.create','orders.view','orders.update','orders.take_payment','orders.complete'];
  const {page,errors,orders}=await setup(browser,permissions,'admin',1,{shopType});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:type==='walk_in'?'Walk-in':'Takeaway',exact:true}).click();
  await page.getByRole('combobox',{name:'Order taker',exact:true}).selectOption(type==='takeaway'?'3':'1');
  await page.locator('.pos-products-table tbody tr').first().click();await page.getByRole('button',{name:'Add to cart',exact:true}).click();
  const retailOrder=shopType==='retail'||type==='walk_in',saveFirst=shopType!=='restaurant';
  if(shopType!=='retail')await expect(page.getByRole('button',{name:'Complete Order',exact:true})).toHaveCount(0);
  let saves=0,prints=0;
  await page.route('**/api/sales',async route=>{if(route.request().method()!=='POST')return route.fallback();saves++;const body=route.request().postDataJSON();assert.equal(body.order_status,retailOrder?'payment_pending':'pending');assert.equal(body.kitchen_id,null);assert.equal(body.money_received,false);orders.unshift({id:123,order_number:1123,order_type:type,order_status:body.order_status,total:100,created_at:new Date().toISOString()});await route.fulfill({json:{saleId:123,orderNumber:1123,total:100,print_jobs_queued:queued}})});
  await page.route('**/api/print-jobs/queue',async route=>{prints++;await route.fulfill({json:{queued:1}})});
  await page.getByRole('button',{name:saveFirst?'Save Order':'Kitchen',exact:true}).click();
  if(!saveFirst){await expect(page.locator('.pos-done')).toBeVisible();await page.getByRole('button',{name:'Continue Ordering',exact:true}).click();await page.locator('.pos-tools').getByRole('button',{name:'View Orders',exact:true}).click()}
  await expect(page.locator('.pos-orders')).toBeVisible();
  const row=page.locator('.orders-table tbody tr').first();await expect(row).toContainText('1123');await expect(row).toContainText(saveFirst?'Saved':'Pending');
  assert.equal(saves,1);assert.equal(prints,!saveFirst&&queued===0?1:0,'only restaurant Kitchen may request a missing print job');assert.deepEqual(errors,[]);
  await row.getByRole('button',{name:'Payment & Complete',exact:true}).click();await expect(page.getByRole('dialog',{name:'Collect Payment',exact:true}).getByRole('button',{name:'Complete Order',exact:true})).toBeVisible();
  await page.close();console.log('PASS '+shopType+' '+type+' queued='+queued+': save first, correct status, completion after save, no duplicate print');
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
