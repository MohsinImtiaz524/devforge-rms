const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const { Server } = require('socket.io');
const { chromium } = require('../frontend/node_modules/@playwright/test');
const { createMonitor } = require('../src/modules/request-monitor/request-monitor.service');
const { createMonitorRouter, initializeMonitorSocket } = require('../src/modules/request-monitor/request-monitor.routes');
(async () => {
  let clock = Date.now() - 5 * 60000;
  const m = createMonitor({ now: () => clock }), app = express();
  // UI fixtures only; no production database, account, or print agent is contacted.
  for (let minute = 0; minute < 6; minute++) {
    clock += 60000;
    for (let n = 0; n < 30 + minute * 5; n++) {
      const source = { label: n % 2 ? 'GET /api/sales' : 'GET /api/kds', function: n % 2 ? 'SalesService.getSales' : 'InfrastructureService.listActiveKitchenOrders', trace: 'fixture-' + minute + '-' + (n % 8), tenant: n % 3 + 1 };
      m.record('database', 'Knex | SELECT | ' + (n % 3 ? 'sales' : 'print_queue'), n % 11 === 0 ? 290 + n : 8 + n, false, { table: n % 3 ? 'sales' : 'print_queue', fingerprint: 'fixture-sql-' + n % 3 }, source);
      if (n % 4 === 0) m.record('backend', source.label, 12 + n, false, { status: 200 }, source);
    }
  }
  const original = m.snapshot;
  m.snapshot = window => {
    const data = original(window);
    data.runtime = { pools: [{ name: 'Knex', used: 2, free: 3, waiting: 0, max: 10 }, { name: 'pg', used: 1, free: 0, waiting: 0, max: 5 }], activeSockets: 3, agents: [{ namespace: '/realtime-print-agent', tenant: 1 }] };
    return data;
  };
  app.use(m.middleware);
  app.use((req, res, next) => { req.session = { user: { role: 'superadmin' } }; next(); });
  app.use('/api/admin/request-monitor', createMonitorRouter({ monitor: m }));
  app.use(express.static('public'));
  const server = http.createServer(app), io = new Server(server);
  io.engine.use((req, res, next) => { req.session = { user: { role: 'superadmin' } }; next(); });
  initializeMonitorSocket(io, { monitor: m, intervalMs: 1000 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } }), errors = [];
    const iconRequests=[];page.on('request',request=>{if(request.url().includes('/icons/monitor-icons.svg'))iconRequests.push(request.url());});
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('http://127.0.0.1:' + server.address().port + '/api/admin/request-monitor/view');
    await page.waitForSelector('.kpi');
    assert.equal(await page.locator('.kpi').count(), 6);
    assert.equal(await page.locator('.card').count(), 4);
    assert.ok(await page.locator('.sidebar .icon').count() >= 9);
    assert.equal(await page.locator('svg.icon').evaluateAll(nodes => nodes.every(node => node.getAttribute('viewBox') === '0 0 24 24' && node.getBoundingClientRect().width <= 20 && node.getBoundingClientRect().height <= 20)),true,'icons must have a correctly scaled bounded viewport');

    assert.equal(await page.locator('.donut-wrap svg circle').count() >= 2, true);
    assert.equal(await page.locator('.main-chart svg text').count() >= 5, true);
    await page.getByRole('button', { name: '7 days', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-window="7d"]').getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => document.querySelector('#coverage').textContent.includes('Partial history'));
    await page.locator('#database [data-detail]').click();
    assert.equal(await page.locator('#db-details').evaluate(node => node.open), true);
    await page.locator('#db-details').evaluate(node => { node.open = false; });
    await page.locator('.sidebar nav a[href="#tracing"]').click();
    assert.equal(await page.locator('#tracing').evaluate(node => node.open), true);
    await page.locator('#trace-data [data-trace]').first().click();
    assert.equal(await page.locator('#clear-trace').isVisible(), true);
    await page.locator('#clear-trace').click();
    await page.locator('#tracing').evaluate(node => { node.open = false; });
    await page.getByRole('button', { name: 'Pause live', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Paused');
    await page.getByRole('button', { name: 'Resume live', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Live');
    await page.getByRole('button', { name: 'Reconnect monitor' }).click();
    await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Live');
    await page.waitForFunction(() => document.querySelector('#coverage').textContent.includes('Partial history'));
    await page.locator('.sidebar nav a[href="#overview"]').click();
    await page.evaluate(() => scrollTo(0, 0));
    fs.mkdirSync('reports/request-monitor', { recursive: true });
    await page.screenshot({ path: 'reports/request-monitor/overview-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    assert.equal(await page.locator('svg.icon').evaluateAll(nodes => nodes.every(node => node.getAttribute('viewBox') === '0 0 24 24' && node.getBoundingClientRect().width <= 20 && node.getBoundingClientRect().height <= 20)),true,'icons must have a correctly scaled bounded viewport');
    await page.screenshot({ path: 'reports/request-monitor/overview-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).colorScheme), 'light');
    await page.screenshot({ path: 'reports/request-monitor/overview-light.png', fullPage: true });
    assert.equal(iconRequests.length,1,'icons must load once, never per snapshot');
    assert.deepEqual(errors, []);
    console.log('PASS: reference viewport, Lucide icons, six KPIs, four feeds, chart axes, donut, history, details, trace filter, pause/resume, reconnect, mobile width, light/dark themes, no browser errors.');
  } finally { await browser?.close(); await new Promise(resolve => io.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
