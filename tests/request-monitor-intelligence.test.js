const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),http=require('http'),knex=require('knex');
const{Server}=require('socket.io'),{io:connect}=require('socket.io-client');const{createMonitor}=require('../src/modules/request-monitor/request-monitor.service');const{createIntelligence}=require('../src/modules/request-monitor/request-monitor.intelligence');
test('bounded seven-day summaries retain totals after detailed events overflow',()=>{
 let time=0;const i=createIntelligence({now:()=>time,maxEvents:2});for(let n=0;n<5;n++)i.add('database',{label:'SQL',durationMs:300,table:'sales',fingerprint:'same',trace:'abc',tenant:1});
 let d=i.snapshot('7d');assert.equal(d.totals.database,5);assert.equal(d.tables[0].count,2);assert.equal(d.complete,false);assert.equal(d.totals.slow,5);time=61000;assert.equal(i.snapshot('1m').traces.length,0);assert.equal(i.snapshot('1h').totals.database,5);
 time=604861000;i.add('backend',{label:'GET',durationMs:1});assert.equal(i.snapshot('7d').totals.database,0);assert.equal(i.snapshot('7d').complete,true);
});
test('tenant query attribution uses authenticated context and preserves method errors and this',async t=>{
 const m=createMonitor(),db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});m.instrumentKnex(db);t.after(()=>db.destroy());const service=m.instrumentMethods({value:7,async read(){assert.equal(this.value,7);await db.raw('SELECT 1');}},'TestService',['read']);
 const app=express();app.use(m.middleware);app.use((req,res,next)=>{req.session={user:{shop_id:2}};next();});app.get('/api/sales',async(req,res)=>{await service.read();res.json([]);});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));await fetch('http://127.0.0.1:'+server.address().port+'/api/sales?shop_id=999');const d=m.snapshot().intelligence;assert.ok(d.tenants.some(r=>r.name==='Shop 2'&&r.db===1));assert.ok(!d.tenants.some(r=>r.name==='Shop 999'));assert.equal(d.functions[0].name,'TestService.read');
});
test('SQL fingerprint groups parameter values without retaining SQL or secrets',async()=>{
 const m=createMonitor(),db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});m.instrumentKnex(db);try{for(let n=0;n<6;n++)await db.raw('select ? as value',['secret-'+n]);const d=m.snapshot().intelligence;assert.equal(d.repeated[0].count,6);assert.ok(!JSON.stringify(d).includes('secret-'));assert.ok(d.insights.some(i=>i.title==='Repeated query fingerprint'));}finally{await db.destroy();}
});
test('WebSocket handler SQL inherits trusted shop and event context; monitor is excluded',async t=>{
 const m=createMonitor(),db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});m.instrumentKnex(db);const server=http.createServer(),io=new Server(server);m.instrumentIo(io);const ns=io.of('/escpos-print-agent');ns.on('connection',socket=>{socket.data.escpos={shopId:3};socket.on('print:claim',async ack=>{await db.raw('select 1');ack({ok:true});});});await new Promise(r=>server.listen(0,'127.0.0.1',r));const socket=connect('http://127.0.0.1:'+server.address().port+'/escpos-print-agent',{transports:['websocket'],reconnection:false});t.after(async()=>{socket.disconnect();await new Promise(r=>io.close(r));await db.destroy();});await new Promise(r=>socket.once('connect',r));await socket.timeout(2000).emitWithAck('print:claim');const d=m.snapshot();assert.equal(d.runtime.agents.length,1);assert.ok(d.intelligence.traces.some(e=>e.kind==='database'&&e.tenant===3&&e.source.includes('print:claim')));assert.equal(d.intelligence.totals.websocket,1);
});
test('empty print claim counts only observed responses and associated queries',async t=>{
 const m=createMonitor(),app=express();app.use(m.middleware);app.get('/api/print-jobs/poll',(req,res)=>{m.record('database','SQL',1);res.json([]);});const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));await fetch('http://127.0.0.1:'+s.address().port+'/api/print-jobs/poll');assert.equal(m.snapshot().intelligence.print.emptyClaims,1);assert.equal(m.snapshot().intelligence.print.dbCallsForEmptyClaims,1);
});

test('named function wrappers preserve sync returns, thrown errors and rejected promises',async()=>{
 const m=createMonitor(),error=new Error('original');const service=m.instrumentMethods({value:9,read(){return this.value;},fail(){throw error;},async reject(){throw error;}},'Fixture',['read','fail','reject']);assert.equal(service.read(),9);assert.throws(()=>service.fail(),e=>e===error);await assert.rejects(service.reject(),e=>e===error);
});
test('detail overflow is explicitly disclosed and history selection cannot change totals since startup',()=>{
 let time=1000;const i=createIntelligence({now:()=>time,maxEvents:2});i.add('database',{label:'a',durationMs:1});time=2000;i.add('database',{label:'b',durationMs:2});time=3000;i.add('database',{label:'c',durationMs:3});const d=i.snapshot('1h');assert.equal(d.detailsCoverage.truncated,true);assert.equal(d.totals.database,3);assert.equal(d.traces.length,2);
});
test('database spikes retain safe minute fingerprints, origins, tenants and per-request query counts',()=>{
 let time=Date.parse('2026-11-05T10:21:34Z');const i=createIntelligence({now:()=>time,spikeQueryThreshold:3,spikeWallMsThreshold:99999,spikeSlowThreshold:99});
 for(let n=0;n<3;n++)i.add('database',{label:'Knex | SELECT | sessions',durationMs:12,table:'sessions',fingerprint:'abc123',trace:'trace-safe',tenant:7,source:'GET /api/auth/me'});
 const spike=i.snapshot('1m').spikes[0];assert.equal(spike.at,'2026-11-05T10:21:00.000Z');assert.equal(spike.fingerprints[0].fingerprint,'abc123');assert.equal(spike.origins[0].name,'GET /api/auth/me');assert.equal(spike.requests[0].queries,3);assert.equal(spike.requests[0].sessionQueries,3);assert.deepEqual(spike.tenants[0],{name:'Shop 7',count:3});assert.equal(spike.timing.postgresExecutionMs,null);assert.match(spike.timing.note,/not separable/);assert.ok(!JSON.stringify(spike).includes('cookie'));
});
