const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),http=require('http'),knex=require('knex');
const {Server}=require('socket.io'),{io:connect}=require('socket.io-client');
const{createMonitor,safePath,queryLabel}=require('../src/modules/request-monitor/request-monitor.service');
const{createMonitorRouter,initializeMonitorSocket}=require('../src/modules/request-monitor/request-monitor.routes');
test('bounded counters, failures, time windows and redaction',async()=>{
 let now=0;const m=createMonitor({now:()=>now,limit:3});for(let i=0;i<10;i++)m.record('backend','GET /api/sales',1,i===0);
 const c=m.snapshot().cards.backend;assert.equal(c.total,10);assert.equal(c.recent.length,3);assert.equal(c.failed,1);now=61000;assert.equal(m.snapshot().cards.backend.lastMinute,0);
 assert.equal(safePath('/api/customers/private-email?token=secret'),'/api/customers/:value');
 assert.ok(!queryLabel("select 'from secret_password' from sales where password='secret'",'pg').includes('secret'));
 await assert.rejects(m.observe('external','Web Push',async()=>{throw Error('SECRET')}),/SECRET/);assert.ok(!JSON.stringify(m.snapshot()).includes('SECRET'));
 const client=m.instrumentS3({send:async()=>({ok:true})});assert.deepEqual(await client.send({constructor:{name:'GetObjectCommand'},Key:'secret-key'}),{ok:true});assert.ok(!JSON.stringify(m.snapshot()).includes('secret-key'));
});
test('real SQLite queries are recorded once and preserve failures',async()=>{
 const m=createMonitor(),db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});m.instrumentKnex(db);
 try{await db.raw('select 1');await assert.rejects(db.raw('select * from missing_table'));assert.equal(m.snapshot().cards.database.total,2);assert.equal(m.snapshot().cards.database.failed,1);}finally{await db.destroy();}
});
test('native pg instrumentation preserves callback and promise behavior without duplicate events',async()=>{
 const m=createMonitor();const client={query(...args){const cb=args.at(-1);if(typeof cb==='function'){cb(null,{rows:[]});return undefined;}return args[0]==='FAIL'?Promise.reject(Error('private')):Promise.resolve({rows:[1]});}};m.instrumentPgClient(client);m.instrumentPgClient(client);
 assert.deepEqual(await client.query('select 1'),{rows:[1]});await new Promise((resolve,reject)=>client.query('select 2',(e,r)=>{try{assert.deepEqual(r,{rows:[]});resolve();}catch(error){reject(error);}}));await assert.rejects(client.query('FAIL'));assert.equal(m.snapshot().cards.database.total,3);assert.equal(m.snapshot().cards.database.failed,1);
});
test('HTTP and websocket root boundaries, live events and request correlation',async t=>{
 const m=createMonitor(),app=express();app.use(m.middleware);app.use((req,res,next)=>{req.session=req.headers['x-role']?{user:{role:req.headers['x-role']}}:{};next();});app.use('/monitor',createMonitorRouter({monitor:m}));app.get('/api/sales/:id',async(req,res)=>{await m.observe('external','Test call',async()=>{});res.json({ok:true});});
 const server=http.createServer(app),io=new Server(server);io.engine.use((req,res,next)=>{req.session={user:{role:req.headers['x-role']}};next();});initializeMonitorSocket(io,{monitor:m,intervalMs:20});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>io.close(r)));const base='http://127.0.0.1:'+server.address().port;
 for(const role of ['','admin'])assert.equal((await fetch(base+'/monitor',{headers:{'x-role':role}})).status,403);assert.equal((await fetch(base+'/monitor',{headers:{'x-role':'superadmin'}})).status,200);
 await fetch(base+'/api/sales/SECRET?token=PASSWORD');const snapshot=m.snapshot();const e=snapshot.cards.external.recent[0],h=snapshot.cards.backend.recent.find(row=>row.label==='GET /api/sales/:value');assert.equal(e.trace,h.trace);assert.ok(!JSON.stringify(snapshot).includes('SECRET'));assert.ok(!JSON.stringify(snapshot).includes('PASSWORD'));
 for(const role of ['admin','superadmin']){const socket=connect(base+'/request-monitor',{transports:['websocket'],extraHeaders:{'x-role':role},reconnection:false,timeout:1000});try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),2000);socket.on('connect_error',()=>{clearTimeout(timer);role==='admin'?resolve():reject(Error('root denied'));});socket.on('monitor:snapshot',data=>{clearTimeout(timer);try{assert.equal(role,'superadmin');assert.ok(data.cards.database);resolve();}catch(e){reject(e);}});});}finally{socket.disconnect();}}
});

test('concurrent requests keep distinct trace codes',async t=>{
 const m=createMonitor(),app=express();app.use(m.middleware);app.get('/api/sales/:id',async(req,res)=>{await m.observe('external','Concurrent call',async()=>new Promise(r=>setTimeout(r,req.params.id==='1'?20:1)));res.end();});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;await Promise.all([fetch(base+'/api/sales/1'),fetch(base+'/api/sales/2')]);const data=m.snapshot();assert.equal(new Set(data.cards.external.recent.map(x=>x.trace)).size,2);for(const event of data.cards.external.recent)assert.ok(data.cards.backend.recent.some(x=>x.trace===event.trace));
});

test('24-hour database window expires old calls, stays bounded and reports partial coverage',()=>{
 let time=0;const m=createMonitor({now:()=>time});m.record('database','SELECT',1);m.record('backend','GET',1);
 assert.equal(m.snapshot().cards.database.last24Hours.count,1);assert.equal(m.snapshot().cards.database.last24Hours.complete,false);
 time=86399000;m.record('database','SELECT',1,true);assert.equal(m.snapshot().cards.database.last24Hours.count,2);
 time=86400000;assert.equal(m.snapshot().cards.database.last24Hours.count,1);assert.equal(m.snapshot().cards.database.last24Hours.complete,true);
 time=86401000;m.record('database','SELECT',1);assert.equal(m.snapshot().cards.database.last24Hours.count,2);
 time=172802000;assert.equal(m.snapshot().cards.database.last24Hours.count,0);
 assert.equal(createMonitor({now:()=>time}).snapshot().cards.database.last24Hours.complete,false);
});
