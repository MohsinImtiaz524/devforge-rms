const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const {page,errors}=await setup(browser,['orders.create','orders.view'],'cashier',1,{shopType:'retail_restaurant'});
 const products=Array.from({length:4},(_,i)=>({id:i+1,name:'Product '+(i+1),sku:'SKU-'+(i+1),category:'Groceries',selling_price:100,stock:1000}));
 await page.route('**/api/products?*',route=>route.fulfill({json:{items:products,pagination:{page:1,page_size:20,total:4,total_pages:1}}}));
 await page.goto(base);await expect(page.locator('.pos-products-table th')).toHaveText(['SKU','Product','Category','Stock','Price']);
 await expect(page.locator('.pos-products-table tbody tr').first().locator('td').first()).toHaveText('SKU-1');
 await expect(page.locator('.pos-products-table tbody tr').first()).toContainText('Groceries');
 await page.getByRole('button',{name:'Walk-in',exact:true}).click();
 for(let i=1;i<=4;i++){
  await page.getByRole('button',{name:'Select Product '+i,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Product '+i,exact:true});await expect(dialog).toBeVisible();
  const quantity=dialog.getByRole('spinbutton',{name:'Product quantity'});
  if(i===1){await quantity.fill('0');await expect(dialog.getByRole('button',{name:'Add to cart',exact:true})).toBeDisabled();await quantity.fill('200');await dialog.getByRole('button',{name:'Increase quantity'}).click();await expect(quantity).toHaveValue('201');await dialog.getByRole('button',{name:'Decrease quantity'}).click();await expect(quantity).toHaveValue('200');}
  await dialog.getByRole('button',{name:'Add to cart',exact:true}).click();
 }
 await expect(page.locator('.pos-cart article')).toHaveCount(4);
 const row=page.locator('.pos-cart article').first();const del=await row.getByRole('button',{name:'Remove Product 1',exact:true}).boundingBox(),name=await row.locator('.pos-cart-product-name>b').boundingBox();assert.ok(del.x<name.x);
 assert.equal(await row.evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
 const price=await row.locator(':scope>b').boundingBox(),qty=await row.locator(':scope>div').boundingBox();assert.ok(price.x<qty.x);
 await expect(page.locator('.pos-terminal-totals dt')).toHaveText(['Grand Total']);
 const search=page.getByRole('textbox',{name:'Search products or variants'});await search.fill('Product');
 const clear=page.getByRole('button',{name:'Clear product search'});await expect(clear).toBeVisible();
 const sb=await search.boundingBox(),cb=await clear.boundingBox();assert.ok(Math.abs((cb.y+cb.height/2)-(sb.y+sb.height/2))<2);assert.equal(await clear.evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');await clear.click();
 await page.screenshot({path:path.join(__dirname,'../../tmp/pos-cart-desktop.png')});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Open checkout',exact:true}).click();
  const header=page.locator('.pos-cart-toolbar');assert.ok(await header.evaluate(el=>el.scrollWidth<=el.clientWidth));
  const count=await header.locator('.pos-cart-count').boundingBox(),actions=await header.locator('.pos-cart-header-actions').boundingBox();assert.ok(actions.x>count.x&&Math.abs(actions.y-count.y)<15);
  await page.screenshot({path:path.join(__dirname,'../../tmp/pos-cart-mobile-'+width+'.png')});
  await page.locator('.pos-checkout').getByRole('button',{name:'Close checkout',exact:true}).click();
  const collapse=page.getByRole('button',{name:'Collapse categories',exact:true});if(await collapse.isVisible())await collapse.click();
  await page.locator('.pos-product').first().click();const dialog=page.getByRole('dialog',{name:'Product 1',exact:true});
  const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await dialog.getByRole('spinbutton',{name:'Product quantity'}).fill('100');await expect(dialog.getByRole('button',{name:'Add to cart',exact:true})).toBeEnabled();
  await page.screenshot({path:path.join(__dirname,'../../tmp/pos-product-popup-'+width+'.png')});await dialog.getByRole('button',{name:'Close',exact:true}).click();
 }
 await page.setViewportSize({width:1440,height:1000});
 const typeColors=await page.locator('.pos-order-types button').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor));assert.equal(new Set(typeColors).size,2);
 let release;const pending=new Promise(resolve=>release=resolve);
 await page.route('**/api/sales',async route=>{if(route.request().method()!=='POST')return route.fallback();await pending;await route.fulfill({json:{saleId:99,orderNumber:1099,total:20300,print_jobs_queued:0}})});
 await page.getByRole('button',{name:'Save Order',exact:true}).click();
 const feedback=page.locator('.pos-task-feedback');await expect(feedback).toBeVisible();const center=await feedback.boundingBox();assert.ok(Math.abs(center.y+center.height/2-500)<3);release();await expect(feedback).toHaveCount(0);
 assert.deepEqual(errors,[]);console.log('PASS: SKU/category table, bulk quantities, cart positions/borders/totals, search clear, compact header, mobile popup, service colors, and centered save loader');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
