const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage();let permissions=['waste.view','waste.create'],posts=[],fail=false;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data={};
  if(url.pathname==='/api/auth/me')data={user:{role:'staff',shop_id:1,shop_currency:'PKR',permissions}};
  else if(url.pathname==='/api/lobby')data={modules:permissions.length?[{id:'waste-management'}]:[]};
  else if(url.pathname==='/api/waste/context')data={products:[{id:2,name:'Milk',stock:10,recipe_count:1}],rawStocks:[{id:3,name:'Flour',unit:'kg',usage_unit:'g',current_stock:2,conversion_factor:1000}],recipes:[{id:4,name:'Dough'}],recentSales:[{id:5,total:100}],recentReturns:[{id:6,total_refund:10}]};
  else if(url.pathname==='/api/waste'&&req.method()==='POST'){posts.push(req.postDataJSON());if(fail){fail=false;await route.fulfill({status:400,json:{error:'Insufficient stock'}});return}data={id:7}}
  else if(url.pathname==='/api/waste')data=[{id:1,product_name:'Milk',quantity:1,cost_amount:20,stock_action:'deduct',source_type:'product',user_name:'Tester'}];
  await route.fulfill({json:data});
 });
 const open=()=>page.goto('http://127.0.0.1:4173/app/waste-management');
 await open();await page.getByRole('cell',{name:'Tester',exact:true}).waitFor();
 await page.getByRole('button',{name:'Record waste',exact:true}).click();
 await page.getByRole('button',{name:/Raw ingredient/}).click();
 assert.equal(await page.getByLabel('Waste Source').count(),0);
 await page.getByRole('dialog',{name:'Ingredient waste',exact:true}).waitFor();
 await page.getByLabel(/Select Ingredient/).selectOption('raw:3');
 assert.match(await page.getByLabel(/Select Ingredient/).textContent(),/2000 g/);
 await page.getByLabel('Quantity Wasted').fill('25');
 await page.getByRole('button',{name:'Record Waste',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Waste recorded!'}).waitFor();
 assert.equal(posts[0].raw_stock_id,3);assert.equal(posts[0].unit,'g');assert.equal(posts[0].quantity,25);assert.ok(!('manual_cost_amount' in posts[0]));
 await page.getByRole('button',{name:'Record waste',exact:true}).click();
 await page.getByRole('button',{name:/Sale \/ order/}).click();
 await page.getByLabel('Select Sale / Order').selectOption('sale:5');
 assert.equal(await page.getByLabel('Stock Action').inputValue(),'already_deducted');
 fail=true;await page.getByRole('button',{name:'Record Waste',exact:true}).click();await page.getByRole('alert').filter({hasText:'Insufficient stock'}).waitFor();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 permissions=['waste.view'];await open();await page.getByRole('cell',{name:'Tester',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Record waste',exact:true}).count(),0);
 permissions=[];await open();await page.getByRole('alert').filter({hasText:'permission'}).waitFor();
 permissions=['waste.view','waste.create'];await page.setViewportSize({width:390,height:844});await open();await page.getByRole('cell',{name:'Tester',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);await browser.close();console.log('Waste React browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});

