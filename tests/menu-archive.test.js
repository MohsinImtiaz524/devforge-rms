const test=require('node:test');const assert=require('node:assert/strict');const {registerMenuArchive}=require('../src/modules/menu/menu.archive');
function setup(){let handler;const calls=[];const query={where(v){calls.push(v);return this},clone(){return this},count(){return Promise.resolve([{total:1}])},select(){return this},orderBy(){return this},limit(){return this},offset(){return Promise.resolve([{id:1,name:'Archived'}])}};registerMenuArchive({patch(){},get(path,...handlers){handler=handlers.at(-1)}},table=>{calls.push(table);return query});return {handler,calls}}
test('archive reads scope records to authenticated shop and paginate',async()=>{for(const kind of ['products','addons']){const {handler,calls}=setup();let data;await handler({query:{kind},session:{user:{shop_id:7}}},{json(v){data=v}},e=>{throw e});assert.equal(data.pagination.total,1);assert.equal(calls[1].shop_id,7);assert.equal(kind==='addons'?calls[1].is_active:calls[1].is_deleted,kind==='addons'?0:1)}});
test('archive rejects invalid type/page and missing tenant without querying',async()=>{for(const req of [{query:{kind:'invalid'},session:{user:{shop_id:7}}},{query:{page:'-1'},session:{user:{shop_id:7}}},{query:{},session:{user:{}}}]){const {handler,calls}=setup();let status;await handler(req,{status(v){status=v;return this},json(){}},e=>{throw e});assert.equal(status,400);assert.equal(calls.length,0)}});
function mutationSetup({product={id:3,product_type:'recipe_based',is_deleted:0},affected=1,fail=false}={}){
 let handlers;const calls=[];const query={where(v){calls.push(v);return this},first:async()=>product,update:async()=>{if(fail)throw Error('database unavailable');return affected},increment:async(...args)=>calls.push(args)};
 const db=table=>{calls.push(table);return query};db.transaction=fn=>fn(db);db.fn={now:()=>0};
 registerMenuArchive({get(){},patch(path,...h){handlers=h}},db);return {handlers,calls};
}
async function mutate(setup,{id='3',body={archived:true},shop_id=7,permissions=['products.update'],authenticated=true}={}){
 let status=200,result,error;const req={params:{id},body,permissions,session:authenticated?{user:{shop_id}}:{}};const res={status(v){status=v;return this},json(v){result=v}};
 await setup.handlers[0](req,res,()=>setup.handlers[1](req,res,e=>{error=e}));
 // Middleware next does not return the route promise.
 await new Promise(resolve=>setImmediate(resolve));return {status,result,error};
}
test('menu archive and unarchive use tenant-scoped conditional writes and update count once',async()=>{
 for(const archived of [true,false]){const setup=mutationSetup({product:{id:3,product_type:'recipe_based',is_deleted:archived?0:1}});const result=await mutate(setup,{body:{archived}});assert.equal(result.status,200);assert.equal(result.result.ok,true);assert.ok(setup.calls.some(v=>v?.shop_id===7&&v.id===3));assert.ok(setup.calls.some(v=>Array.isArray(v)&&v[0]==='product_count'&&v[1]===(archived?-1:1)));}
});
test('menu archive requires products.update, including restore',async()=>{for(const archived of [true,false]){const setup=mutationSetup();assert.equal((await mutate(setup,{permissions:['products.delete'],body:{archived}})).status,403);assert.equal(setup.calls.length,0)}const setup=mutationSetup();assert.equal((await mutate(setup,{authenticated:false})).status,401)});
test('menu archive rejects invalid input and missing tenant before querying',async()=>{for(const input of [{id:'bad'},{id:'0'},{body:{archived:'true'}},{shop_id:null}]){const setup=mutationSetup();assert.equal((await mutate(setup,input)).status,400);assert.equal(setup.calls.length,0)}});
test('menu archive returns not found for missing or other-tenant products',async()=>{const setup=mutationSetup({product:null});assert.equal((await mutate(setup)).status,404);assert.deepEqual(setup.calls[1],{id:3,shop_id:7,is_component:0})});
test('menu archive retries and conditional no-ops do not change product count',async()=>{for(const opts of [{product:{is_deleted:1}},{affected:0}]){const setup=mutationSetup(opts);assert.equal((await mutate(setup)).result.ok,true);assert.ok(!setup.calls.some(Array.isArray))}});
test('menu archive forwards database failures for error handling',async()=>{const setup=mutationSetup({fail:true});assert.match((await mutate(setup)).error.message,/database unavailable/)});
test('add-on unarchive restores only the authenticated shop catalog record',async()=>{
 const setup=mutationSetup({product:{id:3,is_active:0}});const result=await mutate(setup,{body:{archived:false,kind:'addons'}});
 assert.equal(result.result.ok,true);assert.equal(setup.calls[0],'menu_addons');assert.deepEqual(setup.calls[1],{id:3,shop_id:7});assert.deepEqual(setup.calls[3],{id:3,shop_id:7,is_active:0});assert.ok(!setup.calls.includes('products'));
});
test('add-on unarchive requires products.update',async()=>{const setup=mutationSetup();assert.equal((await mutate(setup,{permissions:['products.delete'],body:{archived:false,kind:'addons'}})).status,403);assert.equal(setup.calls.length,0)});
test('add-on unarchive rejects invalid kinds and archive requests',async()=>{for(const body of [{archived:false,kind:'invalid'},{archived:true,kind:'addons'}]){const setup=mutationSetup();assert.equal((await mutate(setup,{body})).status,400);assert.equal(setup.calls.length,0)}});
test('add-on unarchive handles missing and already active records',async()=>{const missing=mutationSetup({product:null});assert.equal((await mutate(missing,{body:{archived:false,kind:'addons'}})).status,404);const active=mutationSetup({product:{id:3,is_active:1},fail:true});assert.equal((await mutate(active,{body:{archived:false,kind:'addons'}})).result.ok,true)});
test('add-on unarchive forwards failures so the action can be retried',async()=>{const setup=mutationSetup({product:{id:3,is_active:0},fail:true});assert.match((await mutate(setup,{body:{archived:false,kind:'addons'}})).error.message,/database unavailable/)});
