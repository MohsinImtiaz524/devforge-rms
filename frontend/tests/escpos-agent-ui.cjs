const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { chromium } = require('@playwright/test');
const { createAgent } = require('../../escpos-print-agent');
const { encode } = require('../../src/modules/escpos-print/escpos-encoder');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-agent-ui-'));
  const now = new Date().toISOString();
  const printers = [
    { id: 1, display_name: 'Main counter', system_name: 'EPSON TM-T82' },
    { id: 2, display_name: 'Hot kitchen', system_name: 'BIXOLON SRP-QE302' },
    { id: 3, display_name: 'Beverage station', system_name: 'EPSON TM-T20III' }
  ];
  let config = { schema: 1, shopId: 1, receipt: { name: 'The Copper Kitchen', receipt_phone: '+92 300 1234567', google_maps_url: 'https://example.com/map' }, printers,
    assets: [{ kind: 'logo' }, { kind: 'promotion' }], version: 'a21b96e7bd19d327e00f', refreshedAt: now };
  const jobs = [
    { id: 104, station_name: printers[0].system_name, status: 'failed', format: 'customer', sale_id: 2318, updated_at: now, last_error: 'Native ESC/POS text currently supports ASCII. Use the existing agent for other scripts.' },
    { id: 103, station_name: printers[2].system_name, status: 'printing', format: 'kitchen', sale_id: 2317, updated_at: now, last_error: null },
    { id: 102, station_name: printers[1].system_name, status: 'pending', format: 'kitchen', sale_id: 2316, updated_at: now, last_error: null },
    { id: 101, station_name: printers[0].system_name, status: 'printed', format: 'customer', sale_id: 2315, updated_at: now, last_error: null }
  ];
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(directory, 'jobs.json'), JSON.stringify({
    104: { printer: printers[0].system_name, state: 'failed', stage: 'Receipt formatting', error: jobs[0].last_error, at: now, format: 'customer', sale_id: 2318 },
    103: { printer: printers[2].system_name, state: 'review', stage: 'Local printer / spooler', error: 'Cannot open printer. The device name was not found in the Windows print spooler.', at: now, format: 'kitchen', sale_id: 2317 }
  }));
  const socket = new EventEmitter(); socket.connected = true;
  socket.disconnect = () => { socket.connected = false; socket.emit('disconnect'); return socket; };
  socket.connect = () => { socket.connected = true; socket.emit('connect'); setImmediate(() => socket.emit('print:ready', { printers: printers.map(p => p.system_name) })); return socket; };
  const emit = socket.emit.bind(socket);
  socket.emit = (event, ...args) => { if (event === 'print:sync') setImmediate(() => emit('print:ready', { printers: printers.map(p => p.system_name) })); return emit(event, ...args); };
  const requests = [];
  let rejectRefresh = false;
  const agent = createAgent({ shopId: 1, shopName: 'The Copper Kitchen', serverUrl: 'https://rms.example.test', token: 'never-display-this-credential' }, { encode }, {
    directory, print: async () => { throw new Error('UI tests must never print'); }, connect: () => { setImmediate(() => socket.connect()); return socket; },
    inspectPrinters: async () => [{ name: printers[0].system_name, offline: false }, { name: printers[1].system_name, offline: true }],
    fetch: async (url, request) => {
      const endpoint = new URL(url).pathname.replace('/api/escpos-print', ''); requests.push(endpoint);
      let data;
      if (endpoint === '/config') {
        if (rejectRefresh) return new Response(JSON.stringify({ error: 'RMS artwork service unavailable' }), { status: 503 });
        data = config;
      } else if (endpoint === '/outstanding') data = [];
      else if (endpoint === '/status') data = { checkedAt: now, counts: { printed: 128, pending: 4, printing: 1, failed: 2 }, jobs,
        printers: printers.flatMap((p, i) => ['printed', 'pending', 'failed'].map(status => ({ station_name: p.system_name, status, count: status === 'printed' ? [82, 37, 9][i] : status === 'pending' ? [1, 2, 1][i] : [1, 1, 0][i] }))) };
      else if (endpoint === '/claim') data = null;
      else data = { ok: true };
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    }
  });
  let browser;
  try {
    await agent.start(0);
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${agent.server.address().port}`);
    await page.getByRole('heading', { name: 'Print overview', exact: true }).waitFor();
    await page.getByText('Connected to RMS', { exact: true }).waitFor();
    await page.locator('.stat').filter({ hasText: 'Spool accepted' }).getByText('128', { exact: true }).waitFor();
    assert.equal(await page.locator('.printer-card').count(), 3);
    await page.getByText('RMS printer name does not match an installed printer on this computer.', { exact: true }).waitFor();
    assert.ok(!await page.content().then(html => html.includes('never-display-this-credential')));
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/escpos-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Pause printing', exact: true }).click();
    await page.getByRole('button', { name: 'Resume printing', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Resume printing', exact: true }).click();
    await page.getByRole('button', { name: 'Pause printing', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Issues', exact: true }).click();
    assert.equal(await page.locator('tr[data-job-state="printed"]').isVisible(), false);
    await page.locator('tr[data-job-id="104"] summary').click();
    assert.equal(await page.locator('tr[data-job-id="104"] details').getAttribute('open'), '');
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('Queue status updated.', { exact: true }).waitFor();
    assert.equal(await page.locator('tr[data-job-id="104"] details').getAttribute('open'), '');
    assert.equal(await page.locator('tr[data-job-state="printed"]').isVisible(), false);
    const card = page.locator('.printer-card').filter({ has: page.getByRole('heading', { name: 'Main counter', exact: true }) });
    await card.getByLabel('Paper width', { exact: true }).selectOption('58');
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Paper width saved.', { exact: true }).waitFor();
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'paper.json')))[printers[0].system_name], '58');
    rejectRefresh = true;
    await page.getByRole('button', { name: 'Refresh Cache', exact: true }).click();
    await page.locator('#toast.error').waitFor();
    assert.match(await page.locator('#toast').textContent(), /503/);
    rejectRefresh = false;
    config = { ...config, version: 'new-cache-version', receipt: { ...config.receipt, name: 'Updated Copper Kitchen' } };
    await page.getByRole('button', { name: 'Refresh Cache', exact: true }).click();
    await page.getByText('Receipt cache refreshed from RMS.', { exact: true }).waitFor();
    await page.locator('.cache-version').filter({ hasText: 'new-cache-ve' }).waitFor();
    page.on('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Retry failed job', exact: true }).click();
    assert.ok(!requests.includes('/104/retry'), 'Retry is not sent when confirmation is dismissed');
    socket.disconnect();
    await page.getByText('Connection unavailable', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reconnect RMS', exact: true }).click();
    await page.getByText('Connected to RMS', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow on mobile');
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/escpos-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Agent UI verified: live status, counters, printer issues, error details, pause/resume, filters, paper settings, cache errors/success, retry confirmation, reconnect, and mobile layout.');
  } finally { if (browser) await browser.close(); await agent.stop(); fs.rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
