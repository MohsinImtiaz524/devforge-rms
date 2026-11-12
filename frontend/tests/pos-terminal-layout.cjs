const {chromium,expect,devices}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const {page,errors}=await setup(browser,['orders.create','orders.view','orders.take_payment','orders.complete'],'cashier',1,{shopType:'retail_restaurant'});
 await page.route('**/api/order-workload',route=>route.fulfill({json:{members:[{user_id:1,active_orders:2,active_deliveries:0},{user_id:3,active_orders:4,active_deliveries:0},{user_id:4,active_orders:0,active_deliveries:2}],updated_at:new Date().toISOString()}}));
 await page.route('**/api/tables',route=>route.fulfill({json:[{id:1,table_number:'A1',assigned_waiter_id:3,status:'available'}]}));
 await page.route('**/api/notifications/unread-count?*',route=>route.fulfill({json:{count:3}}));
 await page.goto(base);await expect(page.locator('.pos-products-heading')).toBeVisible();
 await expect(page.locator('.pos-products-table th')).toHaveText(['SKU','Product','Category','Stock','Price']);
 const catalog=await page.locator('.pos-catalog-layout').boundingBox(),checkout=await page.locator('.pos-checkout').boundingBox(),toolbar=await page.locator('.pos-tools').boundingBox();
 assert.ok(catalog.x+catalog.width<=checkout.x+2);assert.ok(toolbar.width>catalog.width);assert.ok(Math.abs(catalog.y-checkout.y)<3);
 await expect(page.getByRole('textbox',{name:'Search products or variants'})).toBeFocused();
 await expect(page.locator('.pos-inbox')).toContainText('3');await expect(page.locator('.pos-inbox')).toHaveAttribute('href','/app/notification-inbox');
 await expect(page.locator('.pos-network')).toHaveText('Online');await page.context().setOffline(true);await expect(page.locator('.pos-network')).toHaveText('Offline');await page.context().setOffline(false);await expect(page.locator('.pos-network')).toHaveText('Online');
 await page.keyboard.press('F2');await expect(page.getByRole('textbox',{name:'Search products or variants'})).toBeFocused();
 await page.getByRole('button',{name:'Focus barcode scanner input'}).click();await expect(page.getByRole('textbox',{name:'Search products or variants'})).toBeFocused();
 await expect(page.locator('.pos-terminal-totals')).toContainText('Grand Total');
 await page.getByRole('button',{name:'Delivery',exact:true}).click();await expect(page.getByRole('combobox',{name:'Rider',exact:true}).locator('option[value="4"]')).toContainText('2 active deliveries');
 await page.getByRole('button',{name:'Walk-in',exact:true}).click();await expect(page.getByRole('combobox',{name:'Order taker',exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Order taker',exact:true})).toHaveValue('1');await expect(page.getByRole('combobox',{name:'Order taker',exact:true}).locator('option[value="3"]')).toContainText('4 active orders');await page.getByRole('combobox',{name:'Order taker',exact:true}).selectOption('3');await expect(page.getByRole('combobox',{name:'Order taker',exact:true})).toHaveValue('3');
 await page.getByRole('button',{name:'Takeaway',exact:true}).click();await expect(page.getByRole('combobox',{name:'Order taker',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Order taker',exact:true})).toHaveValue('1');await expect(page.getByLabel('Token',{exact:true})).toHaveCount(0);
 await page.locator('.pos-products-table tbody tr').first().locator('td').last().click();await page.getByRole('button',{name:'Add to cart',exact:true}).click();
 const remove=page.getByRole('button',{name:'Remove Burger',exact:true});await expect(remove).toBeVisible();const productName=await page.locator('.pos-cart-product-name>b').boundingBox(),deleteIcon=await remove.boundingBox();assert.ok(Math.abs((productName.y+productName.height/2)-(deleteIcon.y+deleteIcon.height/2))<3);assert.ok(deleteIcon.x-(productName.x+productName.width)<12);await expect(page.locator('.pos-cart-toolbar').getByRole('combobox',{name:'Order taker',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Decrease Burger'})).toBeDisabled();await page.getByRole('button',{name:'Increase Burger'}).click();await expect(page.getByRole('textbox',{name:'Quantity of Burger'})).toHaveValue('2');await expect(page.getByRole('textbox',{name:'Quantity of Burger'})).toBeDisabled();
 await page.screenshot({path:path.join(__dirname,'../../tmp/pos-terminal-reference-desktop.png'),fullPage:true});
 await remove.click();await expect(page.locator('.cart-empty')).toBeVisible();
 await page.getByRole('button',{name:'Dine-in',exact:true}).click();await expect(page.getByRole('dialog',{name:'Select a Table',exact:true})).toBeVisible();await expect(page.locator('.pos-terminal')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Select a Table',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Tables',exact:true}).click();await page.getByRole('dialog',{name:'Select a Table',exact:true}).getByRole('button',{name:/Table A1/}).click();await expect(page.locator('.pos-cart-toolbar')).toContainText('Waiter');await expect(page.getByRole('combobox',{name:'Order taker',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Open checkout'})).toBeVisible();await page.getByRole('button',{name:'Open checkout'}).click();await expect(page.locator('.pos-checkout')).toBeVisible();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(__dirname,'../../tmp/pos-terminal-reference-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await page.getByRole('button',{name:'Takeaway',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Order taker'}).locator('option[value="9"]')).toHaveCount(0);
 await page.locator('.pos-products-table tbody tr').first().locator('td').last().click();await page.getByRole('button',{name:'Add to cart',exact:true}).click();
 let releaseSale,releasePrint,savedBody;const saleReady=new Promise(resolve=>releaseSale=resolve),printReady=new Promise(resolve=>releasePrint=resolve);
 await page.route('**/api/sales',async route=>{if(route.request().method()!=='POST')return route.fallback();savedBody=route.request().postDataJSON();await saleReady;await route.fulfill({json:{saleId:99,orderNumber:1099,total:100,print_jobs_queued:0}})});
 await page.route('**/api/print-jobs/queue',async route=>{await printReady;await route.fulfill({json:{queued:1}})});
 await page.getByRole('button',{name:'Kitchen',exact:true}).click();await expect(page.locator('.pos-task-feedback')).toContainText('Placing order');assert.equal(savedBody.waiter_id,null);assert.match(savedBody.token_number,/^TK-\d+$/);releaseSale();await expect(page.locator('.pos-task-feedback')).toContainText('Sending kitchen ticket');releasePrint();await expect(page.locator('.pos-task-feedback')).toHaveCount(0);await expect(page.locator('.pos-done')).toContainText('1099');
 await page.getByRole('button',{name:'Continue Ordering',exact:true}).click();await page.getByRole('button',{name:'Takeaway',exact:true}).click();await page.locator('.pos-products-table tbody tr').first().locator('td').last().click();await page.getByRole('button',{name:'Add to cart',exact:true}).click();
 await page.route('**/api/sales',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{error:'Ordering temporarily unavailable'}}):route.fallback());
 await page.getByRole('button',{name:'Kitchen',exact:true}).click();await expect(page.locator('.pos-error')).toContainText('Ordering temporarily unavailable');await expect(page.locator('.pos-task-feedback')).toHaveCount(0);await expect(page.getByRole('button',{name:'Kitchen',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Remove Burger',exact:true})).toBeVisible();

 await page.route('**/api/order-workload',route=>route.fulfill({status:503,json:{error:'Workload temporarily unavailable'}}));await page.goto(base);await expect(page.locator('.pos-workload-note')).toContainText('Workload unavailable');
 await page.route('**/api/order-workload',route=>route.fulfill({json:{members:[{user_id:1,active_orders:3,active_deliveries:0},{user_id:3,active_orders:0,active_deliveries:0}]}}));await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.pos-workload-note')).toHaveCount(0);await page.getByRole('button',{name:'Takeaway',exact:true}).click();await expect(page.getByRole('combobox',{name:'Order taker'}).locator('option[value="1"]')).toContainText('3 active orders');
 for(const model of ['iPhone 13','Pixel 7']){
   const device=devices[model];const touchBrowser={newPage:options=>browser.newPage({...options,...device})};
   const {page:touch,errors:touchErrors}=await setup(touchBrowser,['orders.create','orders.view'],'cashier',1,{shopType:'retail_restaurant'});
   await touch.goto(base);await touch.getByRole('button',{name:'Open checkout'}).tap();await touch.getByRole('button',{name:'Dine-in',exact:true}).tap();
   const popup=touch.getByRole('dialog',{name:'Select a Table',exact:true});await expect(popup).toBeVisible();
   for(const viewport of [device.viewport,{width:844,height:390},{width:768,height:1024}]){
     await touch.setViewportSize(viewport);const box=await popup.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1);
   }
   await touch.setViewportSize(device.viewport);await touch.screenshot({path:path.join(__dirname,'../../tmp/pos-table-popup-'+model.replaceAll(' ','-')+'.png'),fullPage:true});await popup.getByRole('button',{name:/Table A1/}).tap();await expect(popup).toHaveCount(0);await expect(touch.locator('.pos-terminal')).toBeVisible();assert.deepEqual(touchErrors,[]);await touch.close();
 }
 console.log('PASS: terminal columns, product headers, totals, and mobile checkout.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
