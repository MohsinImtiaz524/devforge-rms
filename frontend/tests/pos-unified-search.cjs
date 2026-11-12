const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:900,height:900}}),errors=[],searches=[];
  page.on('pageerror',error=>errors.push(error.message));
  const product={id:1,name:'Coffee',selling_price:100,stock:12,category:'Drinks',sku:'COF',barcode:'123456'};
  await page.route('**/api/**',route=>{
   const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.continue();
   let json=[];
   if(url.pathname==='/api/auth/me')json={user:{id:1,role:'admin',shop_id:1,shop_type:'restaurant',permissions:['orders.create','orders.view'],allowed_order_types:['takeaway']}};
   if(url.pathname==='/api/products'){const query=url.searchParams.get('search');if(query)searches.push(query);json={items:[query==='Large'?{...product,stock_variants:[{id:8,name:'Large',stock:12,selling_price:120,is_on_menu:true}]}:product],pagination:{page:1,total_pages:1,total:1,page_size:20}};}
   if(url.pathname==='/api/product-categories')json=[{name:'Drinks'}];
   return route.fulfill({json});
  });
  await page.goto('http://127.0.0.1:5175/app/pos');
  const input=page.getByRole('textbox',{name:'Search products or variants'});
  await expect(input).toHaveCount(1);await expect(page.locator('.pos-checkout input[placeholder="Search name, SKU, barcode or scan QR"]')).toHaveCount(0);
  await input.fill('Cof');
  await expect(page.getByRole('option',{name:/Coffee/})).toBeVisible();
  await page.getByRole('option',{name:/Coffee/}).click();await expect(input).toHaveValue('');
  await page.getByRole('button',{name:'Open checkout',exact:true}).click();await expect(page.locator('.pos-cart')).toContainText('Coffee');
  await page.getByRole('button',{name:'Close checkout',exact:true}).last().click();
  await input.fill('COF');await input.press('Enter');await expect(input).toHaveValue('');
  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator('.pos-cart input[type=number]')).toHaveValue('2');
  await input.fill('123456');await expect(input).toHaveValue('');await expect(page.locator('.pos-cart input[type=number]')).toHaveValue('3');
  await input.fill('Coffee');await page.getByRole('button',{name:'Clear product search',exact:true}).click();await expect(input).toHaveValue('');
  await expect(page.getByRole('listbox',{name:'Quick-add search results'})).toHaveCount(0);
  await input.fill('Large');
  await expect(page.getByRole('option',{name:/Coffee - Large/})).toBeVisible();
  await expect(page.locator('.pos-products-table')).toContainText('Coffee');
  await page.waitForTimeout(450);
  assert.equal(searches.filter(query=>query==='Large').length,1,'One request must serve products and variants');
  await page.getByRole('option',{name:/Coffee - Large/}).click();
  await expect(page.locator('.pos-cart')).toContainText('Large');
  await page.screenshot({path:path.resolve(__dirname,'../../tmp/pos-unified-search-react.png')});assert.deepEqual(errors,[]);

  const legacy=await browser.newPage({viewport:{width:1200,height:800}});
  await legacy.route('http://search.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await legacy.goto('http://search.test');
  const source=fs.readFileSync(path.resolve(__dirname,'../../public/js/app.js'),'utf8');
  const start=source.indexOf('            <div class="pos-unified-search">'),end=source.indexOf('            <button type="button" onclick="returnToPOSOrderTypeSelection()',start);
  const markup=source.slice(start,end);
  const functions=source.slice(source.indexOf('function syncPOSProductSearchClear()'),source.indexOf('function isPOSQuickAddExpired('));
  await legacy.evaluate(({markup,functions,product})=>{
   window.$c=id=>document.getElementById(id);window._posProductSearch='';window._posQuickAddRequest=0;window._posQuickAddResults=[];window.productMap={};window.splitLayout=false;
   window.escapeOrderValue=value=>String(value);window.shopCurrencyCode=()=>'PKR';window.inventoryIsRecipeProduct=()=>false;window.getProductMenuVariants=()=>[];
   window.api=async()=>({items:[product]});window.loadPOSProductsPage=async()=>({items:[product]});window.debounce=fn=>fn;window.quickAdded=[];
   window.eval(functions);window.quickAddPOSItem=(id,variant)=>{window.quickAdded.push({id,variant});window.clearPOSQuickAddSearch(true)};
   document.body.innerHTML=window.eval('`'+markup+'`');
  },{markup,functions,product});
  await legacy.addStyleTag({content:fs.readFileSync(path.resolve(__dirname,'../../public/css/pos-categories.css'),'utf8')+' .hidden{display:none!important}'});
  const search=legacy.getByRole('searchbox',{name:'Search products or variants'});
  await expect(search).toHaveCount(1);await search.fill('Cof');await expect(legacy.getByRole('option',{name:/Coffee/})).toBeVisible();
  await legacy.getByRole('option',{name:/Coffee/}).click();await expect(search).toHaveValue('');
  await search.fill('COF');await search.press('Enter');await expect(search).toHaveValue('');
  await search.fill('123456');await expect(search).toHaveValue('');assert.equal(await legacy.evaluate(()=>window.quickAdded.length),3);
  await search.fill('Coffee');await search.press('Escape');await expect(search).toHaveValue('');
  console.log('PASS: React and vanilla unified search: one field, product results, SKU Enter, barcode auto-add, clear/reset, and both React layouts.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
