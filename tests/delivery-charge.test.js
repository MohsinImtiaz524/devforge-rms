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
