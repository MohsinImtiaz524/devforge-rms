const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const view of ['cards','table']){
  const {page,calls,errors}=await setup(browser,['orders.view','orders.update'],'cashier');
  if(view==='table')await page.setViewportSize({width:1440,height:1000});else await page.setViewportSize({width:390,height:844});
  const order=page.locator(view==='table'?'.orders-table tbody tr':'.order-cards article').first();
  let releaseBill;const billGate=new Promise(resolve=>releaseBill=resolve);let reads=0;
  await page.route('**/api/sales/1/bill',async route=>{reads++;await billGate;return route.fallback()});
  await order.getByRole('button',{name:view==='table'?'View':'Order Details',exact:true}).click();
  await expect(page.locator('.pos-orders-busy')).toHaveText('Loading order details...');
  await expect(page.locator('.pos-orders-busy')).not.toContainText('Updating');releaseBill();
  const details=page.getByRole('dialog',{name:'Order #1001 - Details',exact:true});await expect(details).toBeVisible();await expect(details.getByRole('button',{name:'Edit Order',exact:true})).toHaveCount(0);await expect(details).toContainText('No onion');
  await details.getByRole('button',{name:'Close',exact:true}).first().click();assert.equal(reads,1);
  let releaseMenu;const menuGate=new Promise(resolve=>releaseMenu=resolve);
  await page.route('**/api/products',async route=>{await menuGate;return route.fallback()});
  await order.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('.pos-orders-busy')).toHaveText('Opening order in POS...');await expect(page.getByRole('dialog')).toHaveCount(0);releaseMenu();
  await expect(page.locator('.pos-terminal')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Quantity of Burger',exact:true})).toHaveValue('1');await expect(page.getByRole('textbox',{name:'Order Note',exact:true})).toHaveValue('Pack carefully');await expect(page.getByRole('button',{name:'Decrease Burger',exact:true})).toBeDisabled();assert.equal(reads,2);
  assert.equal(calls.filter(call=>call.method!=='GET').length,0);
  if(view==='cards')await page.locator('.pos-checkout').getByRole('button',{name:'Close checkout',exact:true}).click();
  await page.getByRole('button',{name:'View Orders',exact:true}).click();
  await page.route('**/api/sales/1/bill',route=>route.fulfill({status:503,json:{error:'Unable to load order'}}));await order.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('.pos-orders-busy')).toHaveCount(0);await expect(order.getByRole('button',{name:'Edit',exact:true})).toBeEnabled();await expect(page.locator('.pos-orders')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);assert.deepEqual(errors,[]);await page.close();
 }
 const viewer=await setup(browser,['orders.view'],'cashier');await expect(viewer.page.locator('.order-cards').getByRole('button',{name:'Edit',exact:true})).toHaveCount(0);await viewer.page.close();
 console.log('PASS: read-only details loading, no details Edit, direct POS editing in cards/table, menu-loading feedback, preserved item data/removal permissions, no writes on view/edit, and failed-load recovery');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
