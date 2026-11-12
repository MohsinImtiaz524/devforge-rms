const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5175/app/pos';
const source=fs.readFileSync(path.join(__dirname,'pos-orders-parity.cjs'),'utf8');
const setupSource=source.slice(source.indexOf('async function setup('),source.indexOf('\n(async'));
(async()=>{const setup=eval('('+setupSource.trim()+')');const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const {page,errors}=await setup(browser,['orders.view','orders.create'],'cashier');
 await page.route('**/api/product-categories',route=>route.fulfill({json:[{name:'Drinks'},{name:'Groceries'}]}));await page.goto(base);
 await expect(page.locator('.pos-products-table')).toBeVisible();const collapse=page.getByRole('button',{name:'Collapse categories',exact:true});if(await collapse.isVisible())await collapse.click();
 const icon=page.getByRole('navigation',{name:'Category shortcuts'}).getByRole('button',{name:'Drinks',exact:true});await expect(icon).toBeVisible();assert.equal(await icon.getAttribute('title'),null);
 await icon.hover();const tooltip=page.getByRole('tooltip');await expect(tooltip).toHaveText('Drinks');await expect(tooltip).toHaveCSS('border-radius','9999px');const box=await tooltip.boundingBox(),button=await icon.boundingBox();assert.ok(box.x>button.x+button.width);await tooltip.hover();await expect(tooltip).toBeVisible();await page.mouse.move(900,700);await expect(tooltip).toHaveCount(0);
 await icon.focus();await expect(tooltip).toHaveText('Drinks');const tooltipId=await tooltip.getAttribute('id');await expect(icon).toHaveAttribute('aria-describedby',tooltipId);await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);
 await icon.hover();await icon.click();await expect(tooltip).toHaveCount(0);await expect(icon).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.mouse.move(900,700);await icon.hover();await expect(tooltip).toHaveText('Drinks');await expect(tooltip).toHaveCSS('background-color','rgb(41, 32, 68)');assert.deepEqual(errors,[]);
 console.log('PASS: custom pill category tooltips, no browser title, unclipped placement, hover/focus, Escape, selection, and dark mode');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
