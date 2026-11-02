const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const assets=path.resolve(__dirname,'../frontend/dist/assets');
const hero=fs.existsSync(assets)?fs.readdirSync(assets).find(name=>/^moons-dashboard-hero-[\w-]+\.png$/.test(name)):null;
test('production serves content-hashed Moon hero immutably and keeps HTML revalidatable',{skip:!hero},async()=>{
 const {app}=require('../server'),db=require('../db/knex');
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const image=await fetch(base+'/app/assets/'+hero,{method:'HEAD'});
  assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/public, max-age=31536000, immutable/);assert.match(image.headers.get('content-type'),/image\/png/);
  const html=await fetch(base+'/app/moons',{method:'HEAD'});assert.equal(html.status,200);assert.doesNotMatch(html.headers.get('cache-control')||'',/immutable/);
 }finally{await new Promise(resolve=>server.close(resolve));await db.destroy();}
});
