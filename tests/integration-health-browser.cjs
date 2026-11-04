const express = require('express'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('../frontend/node_modules/@playwright/test');
const { OrderRealtimeService } = require('../services/OrderRealtimeService');
const { createHealthRouter } = require('../src/modules/integration-health/integration-health.routes');
(async () => {
  const app = express(); let calls = 0, browser;
  app.use((req,res,next)=>{req.session={user:{role:'superadmin'}};next();});
  app.use(express.static('public'));
  app.use('/api/admin/integration-health',createHealthRouter({service:{snapshot:async()=>{
    calls++;
    return {checkedAt:new Date().toISOString(),checks:[
      {id:'database',name:'Database',status:'ok',detail:'Database responded',durationMs:1},
      {id:'storage',name:'Cloudflare R2',status:'warning',detail:'Bucket probe denied',durationMs:1},
      {id:'runtime',data:{host:'Local',uptimeSeconds:50,memoryRssMb:70,fileWorker:{enabled:true,started:true,running:false,mode:'event-driven'},webSockets:{initialized:true,connectedTransports:0},printing:{listener:'not applicable'},pushNotifications:{detail:'No test sent.'},providerAccounts:'Account status not checked.'}},
    ]};
  }}}));
  const server=http.createServer(app), realtime=new OrderRealtimeService();
  realtime.initialize(server,(req,res,next)=>{req.session={user:{role:'superadmin'}};next();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/api/admin/integration-health/view`);
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
    assert.equal(await page.locator('.card').count(),7);
    assert.match(await page.locator('#checks').innerText(),/Authenticated round trip succeeded/);
    assert.equal(calls,1);
    await page.getByRole('button',{name:'Run checks'}).click();
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
    assert.equal(calls,2);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).colorScheme),'dark');
    assert.deepEqual(errors,[]);
    console.log('PASS: seven health cards, manual refresh, authenticated browser WebSocket, mobile width, dark theme, no browser errors.');
  } finally {await browser?.close();await realtime.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
