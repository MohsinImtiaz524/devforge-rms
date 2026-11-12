const test=require('node:test'),assert=require('node:assert/strict');
const {validateDeliveryCharge,resolveDeliveryCharge,addDeliveryCharge}=require('../src/modules/delivery/delivery-charge');
test('delivery charge validates money and is separate from discounted/taxed products',()=>{
  for(const value of [-1,Infinity,NaN,'150',null,.001,100000000])assert.throws(()=>validateDeliveryCharge(value));
  assert.equal(validateDeliveryCharge(0),0);assert.equal(validateDeliveryCharge(150.25),150.25);
  assert.throws(()=>validateDeliveryCharge(1,'takeaway'));assert.equal(validateDeliveryCharge(0,'walk_in'),0);
  assert.equal(resolveDeliveryCharge(undefined,'delivery','150'),150);assert.equal(resolveDeliveryCharge(0,'delivery',150),0);
  assert.equal(addDeliveryCharge((1000-100)*1.1,150),1140);assert.equal(addDeliveryCharge(.1,.2),.3);
});
test('explicit additive migration is repeatable and preserves historical totals',async()=>{
  const db=require('knex')({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
  try{await db.schema.createTable('sales',t=>{t.increments('id');t.decimal('total',12,2)});await db('sales').insert({total:990});const {up}=require('../src/modules/delivery/delivery-charge.migration');await up(db);await up(db);const row=await db('sales').first();assert.equal(Number(row.total),990);assert.equal(Number(row.delivery_service_charge),0);await assert.rejects(db('sales').update({delivery_service_charge:-1}));}finally{await db.destroy()}
});


test('startup migration can repeat without altering existing charges or totals',async()=>{
  const db=require('knex')({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
  try {
    await db.schema.createTable('sales',t=>{t.increments('id');t.decimal('total',12,2)});
    await db('sales').insert({total:990});
    const {ensureDeliveryChargeSchema}=require('../src/modules/delivery/delivery-charge.migration');
    await ensureDeliveryChargeSchema(db);
    await db('sales').where({id:1}).update({delivery_service_charge:150,total:1140});
    await ensureDeliveryChargeSchema(db);
    const row=await db('sales').first();assert.equal(Number(row.total),1140);assert.equal(Number(row.delivery_service_charge),150);
  } finally {await db.destroy()}
});

test('startup migration propagates failure and can recover on the next attempt',async()=>{
  const db=require('knex')({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
  try {
    const {ensureDeliveryChargeSchema}=require('../src/modules/delivery/delivery-charge.migration');
    await assert.rejects(ensureDeliveryChargeSchema(db),/sales/);
    await db.schema.createTable('sales',t=>{t.increments('id');t.decimal('total',12,2)});
    await ensureDeliveryChargeSchema(db);
    assert.equal(await db.schema.hasColumn('sales','delivery_service_charge'),true);
  } finally {await db.destroy()}
});

test('PostgreSQL startup obtains the shared transaction lock before inspecting schema',async()=>{
  const events=[];
  const trx={client:{config:{client:'pg'}},raw:async sql=>events.push(sql),schema:{hasColumn:async()=>{events.push('inspect');return true}}};
  const db={client:{config:{client:'pg'}},transaction:async callback=>callback(trx)};
  await require('../src/modules/delivery/delivery-charge.migration').ensureDeliveryChargeSchema(db);
  assert.match(events[0],/pg_advisory_xact_lock.*orbit_delivery_service_charge_v1/);
  assert.equal(events[1],'inspect');
  trx.raw=async()=>{throw Error('lock unavailable')};
  await assert.rejects(require('../src/modules/delivery/delivery-charge.migration').ensureDeliveryChargeSchema(db),/lock unavailable/);
});


test('server waits for delivery schema readiness and does not listen on migration failure',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=source.indexOf('    if (usePostgres()) {',source.indexOf('if (require.main === module)'));
  const end=source.indexOf('    startServer();',start)+'    startServer();'.length;
  const code='(async()=>{'+source.slice(start,end)+'})()';
  for(const fail of [false,true]){
    const events=[];let release;
    const ready=new Promise(resolve=>{release=resolve});
    const generic=new Proxy({},{get:(_target,key)=>key==='enabled'?()=>false:async()=>{}});
    const db={transaction:async callback=>callback({raw:async()=>{}})};
    const context={db,usePostgres:()=>true,initPostgres:async()=>{},process:{env:{}},console:{log(){}},startServer:()=>events.push('listening'),require:name=>name.includes('delivery-charge.migration')?{ensureDeliveryChargeSchema:async configured=>{assert.equal(configured,db);events.push('migrating');await ready;if(fail)throw Error('migration failed');events.push('ready')}}:generic};
    const result=vm.runInNewContext(code,context);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['migrating']);release();
    if(fail){await assert.rejects(result,/migration failed/);assert.deepEqual(events,['migrating'])}else{await result;assert.deepEqual(events,['migrating','ready','listening'])}
  }
});
