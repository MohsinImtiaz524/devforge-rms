const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const vanilla=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
const logic=import('../frontend/src/modules/pos/orders.logic.js');

test('legacy completion uses the saved order even when the POS retail flag is stale',async()=>{
  const start=vanilla.indexOf('async function completeOrderFromPOS('),end=vanilla.indexOf('\nlet _tipOrderOptions',start);
  for(const shop_type of ['retail','retail_restaurant'])for(const order_status of ['pending','ready','payment_pending']){
    const calls=[];
    const context={currentUser:{shop_type},window:{_posIsRetail:true},_currentPage:'pos',currentUserHasPermission:()=>true,toast(){},renderPOSOrders(){},api:async(url,method,body)=>{calls.push({url,method,body});return url.endsWith('/bill')?{sale:{order_type:'delivery',order_status}}:{ok:true}}};
    vm.createContext(context);vm.runInContext(vanilla.slice(start,end),context);
    assert.equal(await context.completeOrderFromPOS(42,true,'walk_in'),true);
    const retail=shop_type==='retail'&&order_status==='payment_pending';
    assert.equal(calls[1].url,retail?'/api/sales/42/complete':'/api/kds/42/status');
    assert.equal(calls[1].method,retail?'POST':'PATCH');
  }
});

test('React status labels match the actual vanilla formatter for every service/status',async()=>{
  const {orderStatusLabel}=await logic;
  const start=vanilla.indexOf('function orderStatusLabel('),end=vanilla.indexOf('\nfunction renderActiveOrderCard',start);
  const context={window:{_posIsRetail:false}};vm.createContext(context);vm.runInContext(vanilla.slice(start,end),context);
  for(const retail of [true,false])for(const order_type of ['dine_in','takeaway','delivery','walk_in'])for(const order_status of ['pending','preparing','ready','served','payment_pending','completed']){
    context.window._posIsRetail=retail;
    const order={order_type,order_status};assert.equal(orderStatusLabel(order,retail),context.orderStatusLabel(order));
  }
});

test('React searches and filters all active records before taking the first fifty',async()=>{
  const {filterOrders}=await logic;
  const rows=Array.from({length:65},(_,index)=>({id:index+1,order_number:100+index,order_status:'pending',order_type:index===64?'delivery':'dine_in'}));
  assert.equal(filterOrders(rows,'','').length,50);
  assert.deepEqual(filterOrders(rows,'delivery','').map(order=>order.id),[65]);
  assert.deepEqual(filterOrders(rows,'','164').map(order=>order.id),[65]);
  assert.deepEqual(filterOrders([{...rows[64],order_status:'completed'}],'',''),[]);
});

test('redesigned filters search the complete dataset and separate active and final states',async()=>{
  const {filterOrders}=await logic;
  const rows=Array.from({length:65},(_,index)=>({id:index+1,order_number:1000+index,order_type:'dine_in',order_status:'pending',table_id:4,table_number:'04',customer_name:index===64?'Guest at the end':'Other Guest'}));
  rows.push({id:66,order_type:'delivery',order_status:'completed',customer_name:'Completed Guest'},{id:67,order_type:'takeaway',order_status:'cancelled',customer_name:'Cancelled Guest'});
  assert.equal(filterOrders(rows,'','',{status:'active'}).length,65);
  assert.equal(filterOrders(rows,'','',{status:'all'}).length,66);
  assert.deepEqual(filterOrders(rows,'','guest at the end',{status:'active'}).map(order=>order.id),[65]);
  assert.equal(filterOrders(rows,'','04',{status:'active',table:'4'}).length,65);
  assert.deepEqual(filterOrders(rows,'delivery','',{status:'completed'}),[]);
  assert.deepEqual(filterOrders(rows,'','Completed Guest',{status:'all'}),[]);
  assert.deepEqual(filterOrders(rows,'','',{status:'cancelled'}).map(order=>order.id),[67]);
  assert.equal(filterOrders(rows,'','',{status:'active',table:'missing'}).length,0);
});

test('completion ignores the previous POS selection and uses the actual order type',async()=>{
  const {completionPath,isRetailCompletion}=await logic;
  for(const order_type of ['delivery','dine_in','takeaway']){
    const order={id:42,order_type};
    assert.equal(completionPath({shop_type:'retail_restaurant'},order,true),'/api/kds/42/status');
    assert.equal(isRetailCompletion({shop_type:'retail_restaurant'},order),false);
  }
  assert.equal(isRetailCompletion({shop_type:'retail_restaurant'},{order_type:'walk_in'}),true);
  assert.equal(isRetailCompletion({shop_type:'retail'},{order_type:'delivery',order_status:'ready'}),false);
  assert.equal(isRetailCompletion({shop_type:'retail'},{order_type:'delivery',order_status:'payment_pending'}),true);
});

test('serve eligibility and completion routes preserve vanilla role and service rules',async()=>{
  const {canServe,can,completionPath,validTip}=await logic;
  const ready={id:7,order_type:'takeaway',order_status:'ready',user_id:2,waiter_id:3};
  assert.equal(canServe({id:2,role:'cashier'},ready),true);
  assert.equal(canServe({id:3,role:'waiter'},ready),true);
  assert.equal(canServe({id:9,role:'receptionist'},ready),true);
  assert.equal(canServe({id:9,role:'admin'},ready),false);
  assert.equal(canServe({id:2,role:'cashier'},{...ready,order_status:'pending'}),false);
  assert.equal(can({role:'superadmin'},'orders.take_payment'),true);
  assert.equal(can({role:'admin',permissions:['orders.view']},'orders.take_payment'),false);
  assert.equal(completionPath({shop_type:'restaurant'},ready),'/api/kds/7/status');
  assert.equal(completionPath({shop_type:'retail'},ready),'/api/kds/7/status');
  assert.equal(completionPath({shop_type:'retail'},{...ready,order_status:'payment_pending'}),'/api/sales/7/complete');
  assert.equal(completionPath({shop_type:'restaurant'},{...ready,order_type:'walk_in'}),'/api/sales/7/complete');
  for(const value of [0,-1,1.001,NaN,Infinity])assert.equal(validTip(value),false);
  assert.equal(validTip(12.50),true);
});

test('vanilla order cards expose table print and delivery actions with the existing permission gates',()=>{
  const start=vanilla.indexOf('function renderActiveOrderCard('),end=vanilla.indexOf('\nasync function markOrderServed',start);
  const permissions=new Set(['orders.view','orders.update','orders.take_payment','orders.complete']);
  const context={currentUser:{id:1,role:'admin'},currentUserHasPermission:key=>permissions.has(key),escapeOrderValue:String,shopCurrencyCode:()=>'PKR',relativeOrderTime:()=>'Just now',orderStatusLabel:order=>order.order_status};
  vm.createContext(context);vm.runInContext(vanilla.slice(start,end),context);
  const order={id:7,order_type:'delivery',order_status:'pending',total:100,created_at:new Date().toISOString(),customer_phone:'0300',delivery_address:'Main Road'};
  let html=context.renderActiveOrderCard(order);
  assert.match(html,/showReceiptPrintMenu\(7\)/);
  assert.match(html,/>Out<\/button>/);
  assert.match(html,/0300/);assert.match(html,/Main Road/);
  permissions.delete('orders.view');permissions.delete('orders.update');
  html=context.renderActiveOrderCard(order);
  assert.doesNotMatch(html,/showReceiptPrintMenu/);
  assert.doesNotMatch(html,/editOrder\(/);
});
