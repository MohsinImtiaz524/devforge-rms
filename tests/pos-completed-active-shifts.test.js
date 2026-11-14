const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const knex=require('knex')({client:'pg'});
const logic=import('../frontend/src/modules/pos/orders.logic.js');
test('completed active shifts includes multiple open shifts and excludes closed/missing shifts and other statuses',async()=>{
 const {filterOrders}=await logic;
 const rows=[{id:1,shift_id:10,order_status:'completed',order_shift_status:'open',order_type:'delivery',customer_name:'Alice',table_id:4},{id:2,shift_id:11,order_status:'completed',order_shift_status:'open',order_type:'dine_in'},{id:3,order_status:'completed',order_shift_status:'closed'},{id:4,order_status:'completed'},{id:5,order_status:'pending',order_shift_status:'open'},{id:6,order_status:'cancelled',order_shift_status:'open'}];
 const options={status:'completed_active_shifts'};
 assert.deepEqual(filterOrders(rows,'','',options).map(o=>o.id),[1,2]);
 assert.deepEqual(filterOrders(rows,'delivery','alice',options).map(o=>o.id),[1]);
 assert.deepEqual(filterOrders(rows,'','',{...options,table:'4'}).map(o=>o.id),[1]);
 assert.deepEqual(filterOrders(rows,'','',{...options,table:'99'}),[]);
 assert.deepEqual(filterOrders(rows,'','',{status:'active'}).map(o=>o.id),[5]);
});
test('sales query joins shifts within the tenant and preserves staff restrictions',async()=>{
 const source=fs.readFileSync('services/SalesService.js','utf8');
 const start=source.indexOf('  async getSales(shopId, currentUser = null) {'),end=source.indexOf('  async getSalesPage(',start);
 for(const user of [{id:8,role:'admin'},{id:8,role:'waiter'},{id:8,role:'order_taker'}]){
  let sql;
  const db=table=>{const query=knex(table);query.then=resolve=>{sql=query.toSQL();return Promise.resolve(resolve([]));};return query;};db.raw=knex.raw.bind(knex);
  const context={db};vm.createContext(context);vm.runInContext('service=({'+source.slice(start,end).trim().replace(/\}\s*$/, '},')+'})',context);
  await context.service.getSales(7,user);
  assert.match(sql.sql,/"order_shift"\."shop_id" = "s"\."shop_id"/);
  assert.match(sql.sql,/"s"\."shop_id" = \?/);
  assert.equal(sql.bindings[0],7);
  assert.match(sql.sql,/"order_shift"\."status" as "order_shift_status"/);
  if(user.role!=='admin'){assert.match(sql.sql,/"s"\."user_id" = \? or "s"\."waiter_id" = \?/);assert.deepEqual(sql.bindings,[7,8,8]);}
 }
});
