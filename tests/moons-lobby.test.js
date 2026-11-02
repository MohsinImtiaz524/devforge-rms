const test=require('node:test'),assert=require('node:assert/strict');
const {getLobby,MODULES}=require('../services/LobbyService');
test('Moons navigation separates shop directory from Super Admin management',async()=>{
 const saved=process.env.MOONS_ENABLED;
 try{
  assert.equal(MODULES[0].id,'reports');
  process.env.MOONS_ENABLED='false';
  assert.ok(!(await getLobby({id:1,role:'superadmin'},['platform_moons.view'])).modules.some(row=>row.id==='moons'));
  process.env.MOONS_ENABLED='true';
  const owner=await getLobby({id:1,role:'superadmin'},['platform_moons.view']);
  assert.equal(owner.modules.find(row=>row.id==='moons').target,'/app/moons/manage');
  const staff=await getLobby({id:2,role:'cashier',shop_id:1,allowed_panels:['moons']},['platform_moons.view']);
  assert.equal(staff.modules.find(row=>row.id==='moons').target,'/app/moons');
  assert.equal(staff.modules.find(row=>row.id==='moons').label,'Moons');
  const analytics=await getLobby({id:2,role:'cashier',shop_id:1,allowed_panels:['analytics']},['analytics.view']);
  assert.equal(analytics.modules.find(row=>row.id==='analytics').target,'/app/analytics');
 }finally{if(saved===undefined)delete process.env.MOONS_ENABLED;else process.env.MOONS_ENABLED=saved;await require('../db/knex').destroy();}
});
