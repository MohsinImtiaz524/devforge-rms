const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const {page,errors}=await setup(browser,['orders.create','orders.view'],'cashier',1,{shopType:'retail_restaurant'});
 await page.route('**/api/categories',route=>route.fulfill({json:[{name:'Groceries'},{name:'Drinks'}]}));
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.goto(base);await expect(page.locator('.pos-product').first()).toBeVisible();
  const search=await page.locator('.pos-unified-search').boundingBox();assert.ok(search.width>=width-20);
  const trigger=page.getByRole('button',{name:'Categories',exact:true});const button=await trigger.boundingBox();assert.ok(button.y>=search.y+search.height);
  await expect(page.locator('.pos-products-heading')).toHaveCount(0);await expect(page.locator('.pos-product-scroll')).toHaveCount(0);
  assert.ok((await page.locator('.pos-product').first().boundingBox()).height<190);
  assert.equal(await page.locator('.pos-pagination').evaluate(el=>getComputedStyle(el).position),'static');
  const network=page.locator('.pos-network');assert.ok((await network.boundingBox()).width<30);await expect(network).toHaveAttribute('title','Online');
  await trigger.click();const drawer=page.getByRole('dialog',{name:'Categories',exact:true});await expect(drawer).toBeVisible();await expect(drawer).toHaveCSS('transform','none');
  const box=await drawer.boundingBox();assert.ok(Math.abs(box.x)<1&&Math.abs(box.width-width)<1&&Math.abs(box.height-844)<1);
  await drawer.getByRole('button',{name:'All Products',exact:true}).click();await expect(drawer).toHaveCount(0);await expect(trigger).toBeFocused();
  await trigger.click();await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);
  await page.screenshot({path:path.join(__dirname,'../../tmp/pos-mobile-catalog-'+width+'.png')});
  await page.getByRole('button',{name:'Open checkout',exact:true}).click();const types=page.locator('.pos-order-types button');
  const idle=await types.evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).color));assert.equal(new Set(idle).size,1);
  await page.getByRole('button',{name:'Walk-in',exact:true}).click();const active=await page.getByRole('button',{name:'Walk-in',exact:true}).evaluate(el=>getComputedStyle(el).color);assert.notEqual(active,idle[0]);
 }
 assert.deepEqual(errors,[]);console.log('PASS: full-width mobile search, compact cards, full-screen category drawer, dismissal/focus, flow pagination, connectivity dot, and neutral/purple order types');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});

