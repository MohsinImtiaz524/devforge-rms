const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setup=eval('('+source.slice(source.indexOf('async function setup('),source.indexOf('\n(async')).trim()+')');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const {page,errors}=await setup(browser,['orders.view','orders.create'],'cashier',1,{shopType:'retail_restaurant'});
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Delivery',exact:true}).click();
 const controls=page.locator('.pos-delivery-controls'),fee=controls.getByRole('spinbutton'),rider=controls.getByRole('combobox'),customer=controls.getByRole('button',{name:'Customer details',exact:true});
 const original=await fee.evaluate(el=>getComputedStyle(el).backgroundColor);
 await expect(controls.locator('[data-filled=true]')).toHaveCount(0);
 await fee.fill('150');await rider.selectOption('4');await customer.click();
 const dialog=page.getByRole('dialog',{name:'Customer details',exact:true});
 await dialog.getByRole('textbox',{name:'Customer Name',exact:true}).fill('Delivery Guest');await dialog.getByRole('textbox',{name:'Phone Number',exact:true}).fill('03009998888');await dialog.getByRole('textbox',{name:'Delivery Address',exact:true}).fill('Block 4');await dialog.getByRole('button',{name:'Save customer details',exact:true}).click();
 await expect(controls.locator('[data-filled=true]')).toHaveCount(3);
 await expect.poll(()=>fee.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(original);
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:900});
  if(width<1280){const open=page.getByRole('button',{name:'Open checkout',exact:true});if(await open.isVisible() && await page.locator('.checkout-open').count()===0)await open.click();}
  await expect(fee).toBeVisible();const a=await fee.boundingBox(),b=await rider.boundingBox(),c=await customer.boundingBox();
  assert.ok(Math.abs(a.y-b.y)<1,'fields align at '+width);assert.ok(Math.abs(a.width-b.width)<1,'equal widths at '+width);assert.equal(a.height,b.height);assert.equal(a.height,c.height);assert.ok(Math.abs(c.y-a.y)<1,'customer aligns in same row at '+width);assert.ok(Math.abs(c.width-a.width)<1,'customer has equal width at '+width);assert.ok(c.x+c.width<=width+1,'customer fits viewport');
 }
 await page.evaluate(()=>document.documentElement.classList.add('dark'));await expect(controls.locator('[data-filled=true]')).toHaveCount(3);await page.screenshot({path:path.join(__dirname,'../../tmp/delivery-controls-filled-dark.png')});
 await fee.fill('0');await rider.selectOption('');await expect(controls.locator('label[data-filled=true]')).toHaveCount(0);await expect(customer).toHaveAttribute('data-filled','true');
 assert.deepEqual(errors,[]);console.log('PASS: delivery controls align and fit desktop/tablet/mobile; charge, rider and customer filled states update independently in light/dark themes');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
