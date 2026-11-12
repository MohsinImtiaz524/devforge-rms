const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')'),browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const scenario of ['queue','already-queued','print-failure']){
  const {page,errors}=await setup(browser,['orders.create','orders.view','orders.take_payment','orders.complete'],'cashier',1,{shopType:'retail_restaurant'});
  await page.goto(base);await page.getByRole('button',{name:'Walk-in',exact:true}).click();await page.locator('.pos-products-table tbody tr').first().click();await page.getByRole('button',{name:'Add to cart',exact:true}).click();
  let saves=0,prints=0,printBody;
  await page.route('**/api/sales',async route=>{if(route.request().method()!=='POST')return route.fallback();saves++;assert.equal(route.request().postDataJSON().order_status,'payment_pending');await route.fulfill({json:{saleId:123,orderNumber:1123,total:100,print_jobs_queued:scenario==='already-queued'?2:0}})});
  await page.route('**/api/print-jobs/queue',async route=>{prints++;printBody=route.request().postDataJSON();await route.fulfill(scenario==='print-failure'?{status:503,json:{error:'Printer offline'}}:{json:{queued:1}})});
  await page.getByRole('button',{name:'Save Order',exact:true}).click();await expect(page.locator('.pos-orders')).toBeVisible();assert.equal(saves,1);assert.equal(prints,0);if(printBody){assert.equal(printBody.format,'kitchen');assert.equal(printBody.sale_id,123)}
  await expect(page.locator('.pos-toast')).toContainText('Order saved successfully.');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: Save Order matches vanilla: sales API owns kitchen routing; no extra client print or duplicate ticket.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
