const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const {page,errors}=await setup(browser,['orders.view','orders.update'],'cashier',1,{view:'auto'});
 await expect(page.locator('.orders-table')).toBeVisible();await expect(page.getByRole('heading',{name:'Orders',exact:true})).toHaveCSS('font-size','20px');assert.ok((await page.locator('.orders-page-header').boundingBox()).height<70);
 await page.getByRole('textbox',{name:'Search orders'}).fill('no matching customer');await expect(page.locator('.orders-empty h2')).toHaveText('No matching orders');await expect(page.locator('.orders-empty')).not.toContainText('active');await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.getByRole('combobox',{name:'Order status filter'}).selectOption('cancelled');await expect(page.locator('.orders-empty h2')).toHaveText('No matching orders');await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.screenshot({path:path.join(__dirname,'../../tmp/orders-compact-desktop.png')});
 for(const width of [1024,768,390]){await page.setViewportSize({width,height:844});await expect(page.locator('.order-cards')).toBeVisible();await expect(page.locator('.orders-view-toggle')).toHaveCount(0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.locator('.order-cards article').first().getByRole('button',{name:'Order Details',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Close',exact:true})).toHaveCount(1);await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await page.screenshot({path:path.join(__dirname,'../../tmp/orders-compact-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.orders-table')).toBeVisible();
 await page.route('**/socket.io/**',route=>route.fulfill({contentType:'application/javascript',body:'window.io=()=>({connected:true,on(){},off(){}})'}));await page.goto(base);await page.getByRole('button',{name:'View Orders',exact:true}).click();await expect(page.locator('[data-realtime-status=live]')).toHaveText('Live');await expect(page.locator('[data-realtime-status=live]')).toHaveCSS('color','rgb(22, 101, 52)');
 await page.route('**/api/sales',route=>route.fulfill({json:[]}));await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.locator('.orders-empty h2')).toHaveText('No orders to complete');assert.deepEqual(errors,[]);await page.close();
 const tabletBrowser={newPage:options=>browser.newPage({...options,viewport:{width:1024,height:1366},isMobile:true,hasTouch:true})};const tablet=await setup(tabletBrowser,['orders.view'],'cashier',1,{view:'auto'});await expect(tablet.page.locator('.order-cards')).toBeVisible();await tablet.page.close();
 console.log('PASS: single Close control, filtered/empty-queue wording, compact desktop header, automatic desktop/tablet/mobile views, touch-tablet layout, and green live status');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
