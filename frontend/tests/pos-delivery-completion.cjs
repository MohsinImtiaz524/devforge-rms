const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const shopType of ['retail_restaurant','retail'])for(const payment of [true,false]){
  const permissions=['orders.view','orders.create','orders.complete',...(payment?['orders.take_payment']:[])];
  const {page,calls,orders,errors}=await setup(browser,permissions,'cashier',1,{shopType,previousWalkin:true});
  orders[1].order_status='ready';await page.getByRole('button',{name:'Refresh',exact:true}).click();
  const card=page.locator('.order-cards article').filter({hasText:'Order #1002'});await expect(card).toContainText('Ready');
  await page.route('**/api/sales/2/complete',route=>route.fulfill({status:400,json:{error:'Retail completion is available only for retail or walk-in orders.'}}));
  await page.route('**/api/kds/2/status',route=>{if(route.request().postDataJSON()?.status==='completed')orders[1].order_status='completed';return route.fallback()});
  if(payment){await card.getByRole('button',{name:'Pay',exact:true}).click();await page.getByRole('dialog',{name:'Collect Payment',exact:true}).getByRole('button',{name:'Complete Order',exact:true}).click();await expect(page.getByRole('dialog',{name:'Collect Payment',exact:true})).toHaveCount(0);}
  else{page.on('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Complete',exact:true}).click();}
  await expect.poll(()=>calls.some(call=>call.url==='/api/kds/2/status'&&call.method==='PATCH'&&call.body.status==='completed')).toBe(true);
  await expect(card).toHaveCount(0);
  assert.equal(calls.some(call=>call.url==='/api/sales/2/complete'),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: delivery payment and direct completion use restaurant routing after a previous Walk-in selection');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
