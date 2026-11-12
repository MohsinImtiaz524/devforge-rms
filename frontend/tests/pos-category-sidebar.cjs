const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});
 await page.route('http://sidebar.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('http://sidebar.test');
 const source=fs.readFileSync(path.resolve(__dirname,'../../public/js/app.js'),'utf8');
 const start=source.indexOf('          <div id="pos-catalog-layout"'),end=source.indexOf('          <div id="pos-products"',start);
 const markup=source.slice(start,end)+'</div></div>';
 const a=source.indexOf('function posCategoriesCollapsed()'),b=source.indexOf('function scrollPOSCategories(',a);
 await page.evaluate(({markup,functions})=>{
  window.$c=id=>document.getElementById(id);window.escapeOrderValue=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');window._productCategories=[{name:'Food'},{name:'Drinks'}];window.filterPOSByCategory=value=>{window.selectedCategory=value};
  window.eval(functions);document.body.innerHTML=window.eval('\u0060'+markup+'\u0060');
 },{markup,functions:source.slice(a,b)});
 await page.addStyleTag({content:fs.readFileSync(path.resolve(__dirname,'../../public/css/pos-categories.css'),'utf8')});
 await page.getByRole('button',{name:'Collapse categories',exact:true}).click();await expect(page.locator('#pos-category-pills')).toBeHidden();
 await page.getByRole('button',{name:'Expand categories',exact:true}).click();await page.getByRole('button',{name:'Food',exact:true}).click();assert.equal(await page.evaluate(()=>window.selectedCategory),'Food');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Drinks',exact:true}).click();await expect(page.locator('#pos-category-pills')).toBeHidden();assert.equal(await page.evaluate(()=>window.selectedCategory),'Drinks');
 await page.getByRole('button',{name:'Expand categories',exact:true}).click();await expect(page.locator('#pos-category-pills')).toBeVisible();await page.screenshot({path:path.resolve(__dirname,'../../tmp/pos-vanilla-sidebar-mobile.png')});
 console.log('PASS: vanilla sidebar collapse, expansion, filtering, and mobile auto-collapse.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});