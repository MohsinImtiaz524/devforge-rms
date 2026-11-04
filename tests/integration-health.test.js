const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { io: connect } = require('socket.io-client');
const { createHealthService } = require('../src/modules/integration-health/integration-health.service');
const { createHealthRouter } = require('../src/modules/integration-health/integration-health.routes');
const { OrderRealtimeService } = require('../services/OrderRealtimeService');
test('health snapshots coalesce requests, expire, and sanitize integration failures', async () => {
  let calls = 0, clock = 0, release;
  const service = createHealthService({ now: () => clock, database: async () => { calls++; await new Promise(r=>{release=r}); return {status:'ok'}; }, storage: async () => { throw new Error('secret-password'); }, runtime: async () => ({status:'ok'}) });
  const first = service.snapshot(), second = service.snapshot(); release();
  const [a,b] = await Promise.all([first,second]); assert.deepEqual(a,b); assert.equal(calls,1);
  assert.equal(a.checks[1].status,'error'); assert.ok(!JSON.stringify(a).includes('secret-password'));
  assert.equal((await service.snapshot()).cached,true); clock=11000;
  const next=service.snapshot();release();await next;assert.equal(calls,2);
});
test('health endpoints deny unauthenticated and tenant users before invoking probes', async t => {
  let calls=0;
  const app=express();app.use((req,res,next)=>{const role=req.get('x-role');req.session=role?{user:{role,shop_id:1}}:{};next();});
  app.use('/health',createHealthRouter({service:{snapshot:async()=>{calls++;return {checks:[]};}}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}/health`;
  for(const path of ['', '/view'])for(const role of ['', 'admin', 'manager']){const response=await fetch(base+path,{headers:role?{'x-role':role}:{}});assert.equal(response.status,403);}
  assert.equal(calls,0);
  const result=await fetch(base,{headers:{'x-role':'superadmin'}});assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);assert.equal(calls,1);
  const page=await fetch(base+'/view',{headers:{'x-role':'superadmin'}});assert.equal(page.status,200);assert.match(await page.text(),/Integration Health/);
});
test('root websocket probe round trips while tenants cannot enter diagnostics namespace', async t => {
  const server=http.createServer();const realtime=new OrderRealtimeService();
  realtime.initialize(server,(req,res,next)=>{req.session={user:{role:req.headers['x-role']||'admin'}};next();});
  server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>realtime.close());
  const base=`http://127.0.0.1:${server.address().port}/integration-health`;
  for(const role of ['admin','superadmin']){
    const socket=connect(base,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{'x-role':role},timeout:2000});
    try{await new Promise((resolve,reject)=>{socket.once('connect',()=>role==='superadmin'?resolve():reject(Error('tenant accepted')));socket.once('connect_error',()=>role==='admin'?resolve():reject(Error('root rejected')));});
      if(role==='superadmin')assert.deepEqual(await socket.timeout(2000).emitWithAck('health:ping'),{ok:true});
    }finally{socket.disconnect();}
  }
});
