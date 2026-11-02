const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('Analytics Moon is an unchanged panel copy with only external import paths adjusted',()=>{
 const original=path.resolve(__dirname,'../frontend/src/modules/analytics'),copy=path.resolve(__dirname,'../frontend/src/modules/moons/analytics');
 for(const name of fs.readdirSync(original)){
  if(!fs.statSync(path.join(original,name)).isFile())continue;
  let expected=fs.readFileSync(path.join(original,name),'utf8');
  if(/\.(jsx|js)$/.test(name))expected=expected.replaceAll("'../../","'../../../").replaceAll('"../../','"../../../');
  assert.equal(fs.readFileSync(path.join(copy,name),'utf8'),expected,name+' must stay identical except external imports');
 }
 const {REGISTRY}=require('../src/modules/moons/moons.registry');
 assert.deepEqual(Object.values(REGISTRY).filter(moon=>moon.launchReady).map(moon=>moon.key),['analytics']);
 assert.equal(REGISTRY.analytics.route,'/app/moons/analytics');
 assert.ok(fs.readFileSync(path.join(original,'AnalyticsPage.jsx'),'utf8').includes('/api/analytics/dashboard-data?'));
});

test('Moons directory HTTP requires authentication, flag and preserves safe failure responses',async()=>{
 const express=require('express'),{createDirectoryRouter}=require('../src/modules/moons/moons.directory');
 const app=express();let actor=null,enabled=false,fail=false;
 app.use((req,res,next)=>{req.session=actor?{user:actor}:{};req.permissions=['analytics.view'];next();});
 app.use('/api/moons/directory',createDirectoryRouter({isEnabled:()=>enabled,service:{list:async()=>{if(fail)throw new Error('password=secret');return [];}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port+'/api/moons/directory';
 try{
  assert.equal((await fetch(url)).status,401);actor={id:2,shop_id:1,role:'admin'};
  assert.equal((await fetch(url)).status,503);enabled=true;
  let response=await fetch(url);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).subscriptions_enabled,false);
  fail=true;response=await fetch(url);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/password|secret/);
 }finally{await new Promise(resolve=>server.close(resolve));await require('../db/knex').destroy();}
});
