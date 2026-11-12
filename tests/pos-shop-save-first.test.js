const test=require('node:test'),assert=require('node:assert/strict');
const logic=import('../frontend/src/modules/pos/orders.logic.js');
test('saved display and filtering preserve underlying category kitchen progress',async()=>{
 const {filterOrders,orderStatusLabel}=await logic;
 const rows=['pending','preparing','ready','served','payment_pending','completed','cancelled'].map((order_status,i)=>({id:i+1,order_type:'takeaway',order_status}));
 for(const order of rows.slice(0,5))assert.equal(orderStatusLabel(order,true),'Saved');
 assert.equal(orderStatusLabel(rows[0],false),'Pending');assert.equal(orderStatusLabel(rows[1],false),'In Progress');
 assert.equal(orderStatusLabel(rows[5],true),'Completed');assert.equal(orderStatusLabel(rows[6],true),'Cancelled');
 assert.deepEqual(filterOrders(rows,'','',{status:'payment_pending',savedShop:true}).map(order=>order.id),[1,2,3,4,5]);
 assert.deepEqual(filterOrders(rows,'','',{status:'pending',savedShop:false}).map(order=>order.id),[1]);
 assert.equal(rows[1].order_status,'preparing');
});
