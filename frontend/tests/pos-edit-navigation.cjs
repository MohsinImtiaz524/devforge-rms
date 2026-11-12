const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const {page,calls,errors}=await setup(browser,['orders.view','orders.create','orders.update'],'cashier');
 async function edit(number){await page.setViewportSize({width:1024,height:844});await page.locator('.order-cards article').filter({hasText:'Order #'+number}).getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('.pos-edit-banner')).toContainText('Editing #'+number)}
 await edit(1001);await page.getByRole('button',{name:'Increase Burger',exact:true}).click();await page.getByRole('textbox',{name:'Order Note',exact:true}).fill('Unsaved note');
 const cancel=page.getByRole('button',{name:'Cancel Edit',exact:true});const idle=await cancel.evaluate(el=>getComputedStyle(el).backgroundColor);await cancel.hover();await expect.poll(()=>cancel.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(idle);await cancel.focus();await expect(cancel).toBeFocused();
 await page.getByRole('button',{name:'View Orders',exact:true}).click();await expect(page.locator('.pos-orders')).toBeVisible();assert.equal(calls.filter(call=>call.method!=='GET').length,0);
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.locator('.pos-edit-banner')).toHaveCount(0);await expect(page.locator('.cart-empty')).toBeVisible();await expect(page.getByRole('textbox',{name:'Order Note',exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'View Orders',exact:true}).click();await edit(1004);
 const table=page.getByRole('button',{name:'Change table',exact:true});await expect(table).toHaveText('Table A1');await expect(table).toHaveAttribute('aria-haspopup','dialog');const tb=await table.boundingBox(),label=await page.locator('.pos-table-label').boundingBox();assert.ok(Math.abs((tb.y+tb.height/2)-(label.y+label.height/2))<3);
 await table.click();await expect(page.getByRole('dialog',{name:'Select a Table',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.pos-edit-banner')).toBeVisible();
 let release;const pending=new Promise(resolve=>release=resolve);await page.route('**/api/sales/4/items',async route=>{await pending;await route.fulfill({status:503,json:{error:'Could not save test order'}})});
 await page.getByRole('button',{name:'Update Kitchen #1004',exact:true}).click();await expect(cancel).toBeDisabled();await expect(table).toBeDisabled();await expect(page.getByRole('button',{name:'View Orders',exact:true})).toBeDisabled();release();await expect(cancel).toBeEnabled();await expect(page.locator('.pos-edit-banner')).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await expect(page.locator('.pos-edit-banner')).toHaveCount(0);await expect(page.locator('.cart-empty')).toBeVisible();await expect(page.getByRole('textbox',{name:'Order Note',exact:true})).toHaveValue('');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open checkout',exact:true}).click();await page.getByRole('button',{name:'Dine-in',exact:true}).click();await page.keyboard.press('Escape');const select=page.getByRole('button',{name:'Select table',exact:true});await expect(select).toBeVisible();assert.ok((await select.boundingBox()).height>=42);
 assert.deepEqual(errors,[]);console.log('PASS: navigation discards local edits without writes, new order is clean, Cancel Edit states, aligned table dialog trigger, in-flight save protection, failed-save recovery, page departure cleanup, and mobile table control');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
