const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex');
test('kitchen refresh batches reads, skips unchanged writes, repairs legacy rows and isolates tenants',async t=>{
 process.env.DB_CLIENT='sqlite';
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 const dbPath=require.resolve('../db/knex');const previous=require.cache[dbPath];require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:db};
 try{
 await db.schema.createTable('shops',t=>{t.integer('id').primary();t.string('shop_type')});
 await db.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.string('name');t.string('username');t.string('role')});
 await db.schema.createTable('tables',t=>{t.integer('id').primary();t.string('table_number')});
 await db.schema.createTable('sales',t=>{t.integer('id').primary();t.integer('shop_id');t.integer('user_id');t.integer('waiter_id');t.integer('kitchen_id');t.integer('table_id');t.integer('order_number');t.integer('token_number');t.integer('guest_count');t.string('order_type');t.string('order_status');t.text('special_instructions');for(const c of ['created_at','updated_at','preparing_at','kitchen_completed_at','served_at'])t.timestamp(c)});
 await db.schema.createTable('products',t=>{t.integer('id').primary();t.integer('shop_id');t.string('name');t.string('category')});
 await db.schema.createTable('product_categories',t=>{t.increments('id');t.integer('shop_id');t.string('name');t.string('printer_station');t.text('route_targets')});
 await db.schema.createTable('sale_items',t=>{t.increments('id');t.integer('sale_id');t.integer('product_id');t.integer('quantity');for(const c of ['custom_name','special_instructions','variants_json','addons_json'])t.text(c)});
 for(const name of ['kitchen_order_updates','kitchen_order_pending_updates'])await db.schema.createTable(name,t=>{t.integer('sale_id');t.integer('shop_id');t.integer('kitchen_id');t.text('changes_json');t.timestamp('updated_at')});
 await db('shops').insert([{id:1,shop_type:'restaurant'},{id:2,shop_type:'restaurant'}]);
 await db('users').insert([{id:1,shop_id:1,name:'Creator',username:'creator',role:'waiter'},{id:101,shop_id:1,name:'Hot',role:'kitchen'},{id:102,shop_id:1,name:'Cold',role:'kitchen'}]);
 await db('product_categories').insert([{shop_id:1,name:'Hot',route_targets:'["KITCHEN:101"]'},{shop_id:1,name:'Cold',route_targets:'["KITCHEN:102"]'}]);
 await db('products').insert([{id:1,shop_id:1,name:'Soup',category:'Hot'},{id:2,shop_id:1,name:'Salad',category:'Cold'},{id:3,shop_id:2,name:'Private',category:'Hot'}]);
 const sale=(id,shop_id=1)=>({id,shop_id,user_id:1,kitchen_id:shop_id===1?101:201,order_type:'dine_in',order_status:'pending',created_at:'2026-11-04 10:00:00',updated_at:'2026-11-04 10:00:00'});
 await db('sales').insert([...Array.from({length:20},(_,i)=>sale(i+1)),sale(99,2)]);
 await db('sale_items').insert([...Array.from({length:20},(_,i)=>({sale_id:i+1,product_id:i%2?2:1,quantity:1})),{sale_id:99,product_id:3,quantity:1}]);
 const service=require('../services/InfrastructureService');
 const first=await service.listActiveKitchenOrders(1,101,{view:'new'});assert.equal(first.length,10);
 const queries=[];db.on('query',q=>queries.push(q.sql));
 const second=await service.listActiveKitchenOrders(1,101,{view:'new'});
 assert.deepEqual(second,first.map(order=>({...order,kitchen_queue_kind:order.kitchen_queue_kind||'new'})));assert.equal(queries.length,4);assert.ok(queries.every(q=>/^select/i.test(q)),queries.join('\n'));
 assert.ok(second.every(o=>o.items.every(i=>i.product_name==='Soup')));
 assert.ok(second.every(o=>o.punched_by_name==='Creator'));
 const ids=(await db('kitchen_order_statuses').where({shop_id:1})).map(x=>x.sale_id);assert.ok(!ids.includes(99));
 await db('kitchen_order_statuses').where({sale_id:1,kitchen_id:101}).update({status:'preparing'});
 assert.equal((await service.listActiveKitchenOrders(1,101,{view:'preparing'}))[0].order_status,'preparing');
 await db('sales').where({id:1}).update({order_status:'ready'});
 await service.listActiveKitchenOrders(1,101,{view:'completed',completedPeriod:'all'});
 assert.equal((await db('kitchen_order_statuses').where({sale_id:1,kitchen_id:101}).first()).status,'completed');
 queries.length=0;await service.listActiveKitchenOrders(1,101,{view:'completed',completedPeriod:'all'});assert.ok(queries.every(q=>/^select/i.test(q)));
 await db('kitchen_order_statuses').where({sale_id:3,kitchen_id:101}).update({queue_kind:'updated'});
 await db('kitchen_order_pending_updates').insert({shop_id:1,sale_id:3,kitchen_id:101,changes_json:JSON.stringify([{product_category:'Hot',quantity:2,change_action:'add'},{product_category:'Cold',quantity:1,change_action:'add'}]),updated_at:'2026-11-04 11:00:00'});
 const updated=await service.listActiveKitchenOrders(1,101,{view:'updated'});assert.equal(updated.length,1);assert.equal(updated[0].id,3);assert.equal(updated[0].kitchen_changes.length,1);assert.equal(updated[0].kitchen_changes[0].product_category,'Hot');
 queries.length=0;const manager=await service.listActiveKitchenOrders(1);assert.equal(manager.length,20);assert.equal(queries.length,2);assert.ok(queries.every(q=>/^select/i.test(q)));
 await db('sales').insert(sale(21));await db('sale_items').insert({sale_id:21,product_id:1,quantity:2});
 const results=await Promise.all([service.listActiveKitchenOrders(1,101,{view:'new'}),service.listActiveKitchenOrders(1,101,{view:'new'})]);
 assert.ok(results.every(rows=>rows.some(o=>o.id===21)));assert.equal((await db('kitchen_order_statuses').where({sale_id:21,kitchen_id:101})).length,1);
 assert.equal((await service.listActiveKitchenOrders(2,101)).length,0);
 const more=Array.from({length:405},(_,i)=>sale(i+1000));
 for(let i=0;i<more.length;i+=50){await db('sales').insert(more.slice(i,i+50));await db('sale_items').insert(more.slice(i,i+50).map(row=>({sale_id:row.id,product_id:1,quantity:1})));}
 await service.listActiveKitchenOrders(1,101);
 queries.length=0;const large=await service.listActiveKitchenOrders(1,101);assert.ok(large.some(row=>row.id===1404));assert.equal(queries.length,6);assert.ok(queries.every(q=>/^select/i.test(q)));

 async function reset() {
  for(const table of ['kitchen_order_pending_updates','kitchen_order_updates','kitchen_order_statuses','sale_items','sales'])await db(table).del();
  await db('product_categories').where({shop_id:1,name:'Hot'}).update({route_targets:'["KITCHEN:101"]',printer_station:null});
 }
 async function add(id,overrides={},items=[{product_id:1,quantity:1}]) {
  await db('sales').insert({...sale(id),...overrides});
  if(items.length)await db('sale_items').insert(items.map(item=>({sale_id:id,...item})));
 }
 await t.test('mixed orders expose only each kitchen portion and retain independent preparation states',async()=>{
  await reset();await add(201,{},[{product_id:1,quantity:2},{product_id:2,quantity:3}]);
  const hot=await service.listActiveKitchenOrders(1,101),cold=await service.listActiveKitchenOrders(1,102);
  assert.deepEqual(hot[0].items.map(x=>x.product_name),['Soup']);assert.deepEqual(cold[0].items.map(x=>x.product_name),['Salad']);
  await db('kitchen_order_statuses').where({sale_id:201,kitchen_id:101}).update({status:'completed'});
  assert.equal((await service.listActiveKitchenOrders(1,101))[0].order_status,'ready');
  assert.equal((await service.listActiveKitchenOrders(1,102))[0].order_status,'pending');
  assert.equal((await db('sales').where({id:201}).first()).order_status,'pending');
 });
 await t.test('duplicate multi-kitchen routing does not create duplicate statuses or items',async()=>{
  await reset();await db('product_categories').where({shop_id:1,name:'Hot'}).update({route_targets:'["KITCHEN:101","KITCHEN:102","KITCHEN:101"]'});await add(202);
  for(const id of [101,102])assert.equal((await service.listActiveKitchenOrders(1,id))[0].items.length,1);
  assert.equal((await db('kitchen_order_statuses').where({sale_id:202})).length,2);
 });
 await t.test('legacy printer_station routing survives malformed route_targets',async()=>{
  await reset();await db('product_categories').where({shop_id:1,name:'Hot'}).update({route_targets:'broken-json',printer_station:'KITCHEN:101'});await add(203);
  assert.equal((await service.listActiveKitchenOrders(1,101))[0].id,203);assert.deepEqual(await service.listActiveKitchenOrders(1,102),[]);
 });
 await t.test('custom items retain assigned-kitchen fallback, notes, variants and addons',async()=>{
  await reset();await add(204,{special_instructions:'No salt'},[{custom_name:'Custom meal',quantity:1,special_instructions:'Separate sauce',variants_json:'[{"name":"Large"}]',addons_json:'[{"name":"Cheese"}]'}]);
  const rows=await service.listActiveKitchenOrders(1,101);assert.equal(rows[0].order_notes,'No salt');assert.equal(rows[0].items[0].product_name,'Custom meal');assert.equal(rows[0].items[0].special_instructions,'Separate sauce');assert.deepEqual(rows[0].items[0].variants,[{name:'Large'}]);assert.deepEqual(rows[0].items[0].addons,[{name:'Cheese'}]);assert.deepEqual(await service.listActiveKitchenOrders(1,102),[]);
 });
 await t.test('removed-item updates remain visible even when the order has no current items',async()=>{
  await reset();await add(205,{},[]);await db('kitchen_order_statuses').insert({shop_id:1,sale_id:205,kitchen_id:101,status:'pending',queue_kind:'updated'});
  await db('kitchen_order_pending_updates').insert({shop_id:1,sale_id:205,kitchen_id:101,changes_json:'[{"product_category":"Hot","quantity":1,"change_action":"remove"}]'});
  const rows=await service.listActiveKitchenOrders(1,101,{view:'updated'});assert.equal(rows.length,1);assert.equal(rows[0].items.length,0);assert.equal(rows[0].kitchen_changes[0].change_action,'remove');
 });
 await t.test('malformed changes keep full routed items visible in updated queue',async()=>{
  await reset();await add(206);await service.listActiveKitchenOrders(1,101);await db('kitchen_order_statuses').where({sale_id:206}).update({queue_kind:'updated'});await db('kitchen_order_pending_updates').insert({shop_id:1,sale_id:206,kitchen_id:101,changes_json:'invalid-json'});
  const rows=await service.listActiveKitchenOrders(1,101,{view:'updated'});assert.equal(rows.length,1);assert.equal(rows[0].items.length,1);assert.deepEqual(rows[0].kitchen_changes,[]);
 });
 await t.test('completed history keeps start inclusive, end exclusive and all-history access',async()=>{
  await reset();const start='2026-10-01T00:00:00.000Z',end='2026-10-02T00:00:00.000Z';
  await add(207,{order_status:'completed',kitchen_completed_at:new Date(start)});await add(208,{order_status:'served',kitchen_completed_at:new Date(end)});
  const rows=await service.listActiveKitchenOrders(1,101,{view:'completed',completedFrom:start,completedTo:end});assert.deepEqual(rows.map(x=>x.id),[207]);
  const all=await service.listActiveKitchenOrders(1,101,{view:'completed',completedPeriod:'all'});assert.deepEqual(all.map(x=>x.id),[207,208]);
 });
 await t.test('empty shops, walk-in and retail orders never enter the kitchen',async()=>{
  await reset();assert.deepEqual(await service.listActiveKitchenOrders(123,101),[]);
  await add(209,{order_type:'walk_in'});assert.deepEqual(await service.listActiveKitchenOrders(1,101),[]);
  await db('shops').insert({id:3,shop_type:'retail'});await add(210,{shop_id:3});assert.deepEqual(await service.listActiveKitchenOrders(3),[]);
 });
 await t.test('repeated refreshes leave statuses and their timestamps unchanged',async()=>{
  await reset();await add(211);await service.listActiveKitchenOrders(1,101);const before=await db('kitchen_order_statuses').where({sale_id:211});
  queries.length=0;for(let i=0;i<10;i++)await service.listActiveKitchenOrders(1,101);assert.equal(queries.length,40);assert.ok(queries.every(q=>/^select/i.test(q)));assert.deepEqual(await db('kitchen_order_statuses').where({sale_id:211}),before);
 });
 await t.test('a failed item read fails clearly and the next refresh recovers',async()=>{
  await reset();await add(212);const failRead=q=>{if(/select.*sale_items/i.test(q.sql))throw new Error('simulated item read failure')};db.on('query',failRead);
  try{await assert.rejects(service.listActiveKitchenOrders(1,101),/simulated item read failure/);}finally{db.removeListener('query',failRead);}
  assert.equal((await service.listActiveKitchenOrders(1,101))[0].id,212);
 });
 console.log('Measured warm refresh: 20 candidate orders, 4 SELECTs, 0 writes; legacy repair and concurrent refresh preserved.');
 }finally{await db.destroy();if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];}
});
