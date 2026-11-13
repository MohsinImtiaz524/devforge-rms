const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { canPrintReceipt } = require('../middleware/receipt-print-access');

test('waiters and order takers can only print unpaid receipts', () => {
  for (const role of ['waiter', 'order_taker', 'WAITER']) {
    assert.equal(canPrintReceipt({role}, 'unpaid'), true);
    for (const format of ['customer', 'kitchen', undefined, 'invalid']) assert.equal(canPrintReceipt({role}, format), false);
  }
  for (const role of ['cashier', 'pos_user', 'receptionist', 'admin', 'manager', 'superadmin']) {
    for (const format of ['unpaid', 'customer', 'kitchen']) assert.equal(canPrintReceipt({role}, format), true);
  }
});

test('queue and direct print routes reject waiter customer/kitchen requests before rendering or queuing', async t => {
  let queued = 0, rendered = 0;
  let jobFormat = 'customer';
  const stub = (name, value) => { require.cache[require.resolve(name)] = { id: require.resolve(name), filename: require.resolve(name), loaded: true, exports: value }; };
  stub('../db/knex', () => ({where(){return this}, async first(){return {shop_id:2,content_json:JSON.stringify({sale_id:2570,format:jobFormat})}}}));
  stub('../services/SalesService', {async queueReceiptPrint(){queued++;return {queued:1}},async getBill(){rendered++;return null}});
  stub('../services/ReceiptPrintService', {});
  stub('../services/ShiftService', {});
  stub('../services/ReceiptImageService', {});
  stub('../services/ShiftReceiptService', {});
  const app = express();app.use(express.json());
  app.use((req,res,next)=>{const role=req.headers['x-test-role'];if(role)req.session={user:{id:9,shop_id:2,role}};next()});
  app.use('/api/print-jobs',require('../routes/print-jobs'));
  app.use('/print',require('../routes/print'));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));
  const base='http://127.0.0.1:'+server.address().port;
  for (const role of ['waiter','order_taker']) {
    for (const format of ['customer','kitchen']) {
      let response=await fetch(base+'/api/print-jobs/queue',{method:'POST',headers:{'content-type':'application/json','x-test-role':role},body:JSON.stringify({sale_id:2570,format,shop_id:99})});
      assert.equal(response.status,403);
      response=await fetch(base+'/print/sales/2570?shop_id=99&format='+format,{headers:{'x-test-role':role}});assert.equal(response.status,403);
      jobFormat=format;
      response=await fetch(base+'/print/jobs/1?shop_id=99',{headers:{'x-test-role':role}});assert.equal(response.status,403);
    }
  }
  assert.equal(queued,0);assert.equal(rendered,0);
  for(const role of ['waiter','order_taker','pos_user','admin']) {
    const response=await fetch(base+'/api/print-jobs/queue',{method:'POST',headers:{'content-type':'application/json','x-test-role':role},body:JSON.stringify({sale_id:2570,format:'unpaid'})});assert.equal(response.status,200);
  }
  for(const format of ['customer','kitchen']) {
    const response=await fetch(base+'/api/print-jobs/queue',{method:'POST',headers:{'content-type':'application/json','x-test-role':'pos_user'},body:JSON.stringify({sale_id:2570,format})});assert.equal(response.status,200);
  }
  const response=await fetch(base+'/api/print-jobs/queue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sale_id:2570,format:'unpaid'})});assert.equal(response.status,401);
});
