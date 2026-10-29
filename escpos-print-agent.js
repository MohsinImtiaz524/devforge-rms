/** RMS ESC/POS agent. Download from RMS, then run with Node.js 22:
 * node agent.js
 * First install: npm install socket.io-client
 * No PDF software or browser printing required. WebSockets only; no polling.
 * Controls: http://localhost:3000 (loopback only).
 */
'use strict';
const PROFILE = /* PROFILE */ {};
const renderer = /* ENCODER */ null;
const dashboard = /* DASHBOARD */ null;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

function createAgent(profile, encoder, options = {}) {
  const ui = dashboard || require('./src/modules/escpos-print/escpos-agent-ui');
  const dir = options.directory || path.join(os.homedir(), '.rms-escpos', String(profile.shopId), crypto.createHash('sha256').update(profile.serverUrl).digest('hex').slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const read = (name, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch (_) { return fallback; } };
  const save = (name, value) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file + '.tmp', JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  };
  let config = read('config.json', null);
  if (config && (config.schema !== 1 || config.shopId !== profile.shopId || !Array.isArray(config.printers) || !config.receipt || !Array.isArray(config.assets))) config = null;
  let journal = read('jobs.json', {});
  for (const job of Object.values(journal)) if (['received', 'submitting'].includes(job.state)) {
    job.state = 'review'; job.error = 'Agent stopped before submission could be confirmed. Check the receipt.';
  }
  let paper = read('paper.json', {});
  let paused = false, refreshing = null, lastError = '', lastPoll = null, socket = null;
  let errorStage = '', queue = null, queueError = '', localPrinters = [], printersCheckedAt = null, detectionError = '';
  const startedAt = new Date().toISOString();
  const clients = new Set();
  let publishing = false;
  let statusRequest = null;
  const busy = new Set();
  const requested = new Set();
  const recoveryTimers = new Map();
  const recoveryAttempts = new Map();
  let stopping = false;
  let configEpoch = 0, loadedConfigEpoch = -1, configSync = null;
  const controlToken = crypto.randomBytes(24).toString('hex');
  const fetchImpl = options.fetch || fetch;
  function state() {
    return { shopId: profile.shopId, shopName: config?.receipt?.name || profile.shopName,
      serverUrl: profile.serverUrl, connected: Boolean(socket?.connected), paused, refreshing: Boolean(refreshing),
      lastError, errorStage, lastContact: lastPoll, queue, queueError, localPrinters, printersCheckedAt, detectionError,
      config, journal, paper, busy: [...busy], controlToken, startedAt, nodeVersion: process.version, platform: process.platform };
  }
  function publish() {
    if (!clients.size || publishing) return;
    publishing = true;
    setImmediate(() => {
      publishing = false;
      try {
        const message = `data: ${JSON.stringify(ui.panels(state()))}\n\n`;
        for (const client of clients) { if (client.destroyed) clients.delete(client); else client.write(message); }
      } catch (error) { console.error('Dashboard update failed:', error.message); }
    });
  }
  async function api(endpoint, body) {
    const response = await fetchImpl(`${profile.serverUrl}/api/escpos-print${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${profile.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }).catch(error => { error.retryable = true; throw error; });
    if (!response.ok) {
      const error = new Error(`RMS ${response.status}: ${(await response.text()).slice(0, 250)}${[401, 403].includes(response.status) ? ' Download a new agent or check its shop/printer permissions.' : ''}`);
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }
    const data = await response.json();
    lastPoll = new Date().toISOString();
    return data;
  }
  async function loadQueueStatus() {
    if (statusRequest) return statusRequest;
    statusRequest = (async () => {
    try { queue = await api('/status'); queueError = ''; return true; }
    catch (error) { queueError = error.message; return false; }
    finally { publish(); }
    })();
    try { return await statusRequest; } finally { statusRequest = null; }
  }
  function clearRecovery() {
    for (const timer of recoveryTimers.values()) clearTimeout(timer);
    recoveryTimers.clear(); recoveryAttempts.clear();
  }
  function scheduleRecovery(key, error) {
    if (stopping || paused || !socket?.connected || !error.retryable || recoveryTimers.has(key)) return;
    const attempt = recoveryAttempts.get(key) || 0;
    const delays = options.recoveryDelays || [1000, 3000, 8000];
    if (attempt >= delays.length) {
      lastError = `${error.message} Automatic recovery stopped after ${delays.length} attempts. Use Refresh status or Reconnect RMS.`;
      publish(); return;
    }
    recoveryAttempts.set(key, attempt + 1);
    recoveryTimers.set(key, setTimeout(() => {
      recoveryTimers.delete(key);
      void recoverPrinters(key === '*' ? (config?.printers || []).map(p => p.system_name) : [key])
        .catch(nextError => { lastError = nextError.message; errorStage = 'RMS job recovery'; publish(); scheduleRecovery(key, nextError); });
    }, delays[attempt]));
  }
  async function recoverPrinters(printers) {
    if (stopping) return;
    if (!config || loadedConfigEpoch < configEpoch) await syncConfiguration();
    if (paused) { await loadQueueStatus(); return; }
    const outstanding = await api('/outstanding');
    for (const job of outstanding) if ((!journal[job.id] || journal[job.id].state === 'received') && !busy.has(job.station_name)) {
      journal[job.id] = { printer: job.station_name, state: 'review', stage: 'Interrupted job recovery',
        error: 'Unconfirmed claim recovered. Check the physical receipt before resolving.' };
    }
    persistJournal();
    recoveryAttempts.delete('*');
    void loadQueueStatus();
    for (const printer of printers.length ? printers : config.printers.map(p => p.system_name)) {
      if (config?.printers.some(p => p.system_name === printer)) void drain(printer);
    }
  }
  async function inspectPrinters() {
    try {
      if (options.inspectPrinters) localPrinters = await options.inspectPrinters();
      else if (process.platform === 'win32') {
        const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Printer | Select-Object Name,WorkOffline,PrinterStatus | ConvertTo-Json -Compress'], { timeout: 12000, windowsHide: true });
        const rows = JSON.parse(stdout.trim() || '[]');
        localPrinters = (Array.isArray(rows) ? rows : [rows]).map(p => ({ name: p.Name, offline: Boolean(p.WorkOffline), status: p.PrinterStatus }));
      } else {
        const { stdout } = await exec('lpstat', ['-p'], { timeout: 12000 });
        localPrinters = stdout.split('\n').map(line => /^printer (\S+) (.*)$/.exec(line)).filter(Boolean)
          .map(match => ({ name: match[1], offline: /disabled|offline/i.test(match[2]) }));
      }
      printersCheckedAt = new Date().toISOString(); detectionError = '';
    } catch (error) { detectionError = error.message; }
    finally { publish(); }
  }
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const next = await api('/config');
      if (next.schema !== 1 || next.shopId !== profile.shopId || !Array.isArray(next.printers) || !next.receipt || !Array.isArray(next.assets)) throw new Error('Invalid RMS configuration');
      if (encoder.validateTemplates) encoder.validateTemplates(next.templates);
      next.refreshedAt = new Date().toISOString();
      save('config.json', next); config = next; lastError = ''; errorStage = '';
    })();
    publish();
    try { await refreshing; } catch (error) { lastError = error.message; errorStage = 'RMS configuration / artwork'; throw error; }
    finally {
      refreshing = null; publish();
      if (!configSync) for (const printer of [...requested]) {
        requested.delete(printer); setImmediate(() => void drain(printer));
      }
    }
  }
  async function syncConfiguration() {
    if (configSync) return configSync;
    configSync = (async () => {
      do { const epoch = configEpoch; await refresh(); loadedConfigEpoch = epoch; }
      while (!stopping && loadedConfigEpoch < configEpoch);
    })();
    try { await configSync; } finally {
      configSync = null;
      for (const printer of [...requested]) { requested.delete(printer); setImmediate(() => void drain(printer)); }
    }
  }
  async function rawPrint(printer, data) {
    if (options.print) return options.print(printer, data);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-escpos-'));
    const file = path.join(temp, 'receipt.bin');
    fs.writeFileSync(file, data);
    try {
      if (process.platform === 'win32') {
        // Values are passed as base64, never interpolated as PowerShell code.
        const script = `$src=@'
using System; using System.Runtime.InteropServices;
public class RmsRawPrinter {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class Doc { public string name="RMS ESC/POS"; public string output=null; public string type="RAW"; }
 [DllImport("winspool.drv", EntryPoint="OpenPrinterW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Open(string n,out IntPtr h,IntPtr d);
 [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int Start(IntPtr h,int l,Doc d);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h,byte[] b,int n,out int written);
 [DllImport("winspool.drv")] public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv")] public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv")] public static extern bool ClosePrinter(IntPtr h);
}
'@; Add-Type -TypeDefinition $src
$printer=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(printer).toString('base64')}'))
$file=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(file).toString('base64')}'))
$bytes=[IO.File]::ReadAllBytes($file); $handle=[IntPtr]::Zero
if(-not [RmsRawPrinter]::Open($printer,[ref]$handle,[IntPtr]::Zero)){throw 'Cannot open printer'}
try { if([RmsRawPrinter]::Start($handle,1,(New-Object RmsRawPrinter+Doc)) -eq 0){throw 'Cannot start RAW spool job'}
 try { if(-not [RmsRawPrinter]::StartPagePrinter($handle)){throw 'Cannot start page'}
 try { $written=0; if(-not [RmsRawPrinter]::WritePrinter($handle,$bytes,$bytes.Length,[ref]$written) -or $written -ne $bytes.Length){throw 'Incomplete RAW write'} }
 finally { [RmsRawPrinter]::EndPagePrinter($handle)|Out-Null } }
 finally { [RmsRawPrinter]::EndDocPrinter($handle)|Out-Null } }
finally { [RmsRawPrinter]::ClosePrinter($handle)|Out-Null }`;
        await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 30000, windowsHide: true });
      } else {
        await exec('lp', ['-d', printer, '-o', 'raw', file], { timeout: 30000 });
      }
    } catch (error) {
      const detail = String(error.stderr || error.message || 'The operating system rejected the print command').trim();
      throw new Error(`Printer "${printer}": ${detail.slice(0, 1800)}`);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  function persistJournal() {
    // Keep unresolved jobs and a bounded history of acknowledged submissions.
    const done = Object.keys(journal).filter(id => journal[id].state === 'confirmed').sort((a, b) => Number(b) - Number(a));
    done.slice(500).forEach(id => delete journal[id]);
    save('jobs.json', journal);
    publish();
  }
  async function drain(printer) {
    if (stopping || paused) return;
    if (!config || refreshing || configSync) { requested.add(printer); return; }
    if (busy.has(printer)) { requested.add(printer); return; }
    if (Object.values(journal).some(j => j.printer === printer && ['submitting', 'review'].includes(j.state))) return;
    busy.add(printer);
    publish();
    let stage = 'RMS job claim';
    const timing = { started: Date.now() };
    try {
      // A successful spool submission is retried only for RMS confirmation.
      for (const [id, entry] of Object.entries(journal)) if (entry.printer === printer && entry.state === 'failed' && !entry.failureReported) {
        stage = 'RMS failure report';
        await api(`/${id}/fail`, { reason: entry.error || 'Receipt could not be formatted.' });
        entry.failureReported = true; persistJournal();
      }
      for (const [id, entry] of Object.entries(journal)) if (entry.printer === printer && entry.state === 'submitted') {
        stage = 'RMS confirmation';
        await api(`/${id}/confirm`, {}); entry.state = 'confirmed'; persistJournal();
      }
      stage = 'RMS job claim';
      const job = await api('/claim', { station_name: printer });
      timing.claimed = Date.now();
      lastPoll = new Date().toISOString();
      if (!job) { recoveryAttempts.delete(printer); return; }
      if (journal[job.id]?.state === 'confirmed') { await api(`/${job.id}/confirm`, {}); return; }
      journal[job.id] = { printer, state: 'received', at: new Date().toISOString(), format: job.document.format || (job.document.type === 'CASH_DRAWER' ? 'drawer' : 'receipt'), sale_id: job.document.sale?.id }; persistJournal();
      try {
        stage = 'Receipt formatting';
        const data = encoder.encode(job.document, config, paper[printer] === '58' ? 32 : 48);
        timing.formatted = Date.now();
        journal[job.id].state = 'submitting'; persistJournal();
        stage = 'Local printer / spooler';
        await rawPrint(printer, data);
        timing.spooled = Date.now();
        journal[job.id].timing = { claimMs: timing.claimed - timing.started, formatMs: timing.formatted - timing.claimed, spoolMs: timing.spooled - timing.formatted };
        console.log(`[Print #${job.id}] ${printer}: claim ${timing.claimed - timing.started}ms, format ${timing.formatted - timing.claimed}ms, spool ${timing.spooled - timing.formatted}ms`);
        journal[job.id].state = 'submitted'; persistJournal();
      } catch (error) {
        const entry = journal[job.id];
        entry.state = entry.state === 'received' ? 'failed' : 'review'; entry.error = error.message; entry.stage = stage;
        persistJournal();
        if (entry.state === 'failed') {
          stage = 'RMS failure report'; await api(`/${job.id}/fail`, { reason: error.message });
          entry.failureReported = true; persistJournal();
        }
        throw error;
      }
      stage = 'RMS confirmation';
      await api(`/${job.id}/confirm`, {});
      journal[job.id].state = 'confirmed'; persistJournal(); lastError = '';
      recoveryAttempts.delete(printer);
      requested.add(printer);
    } catch (error) {
      lastError = `${printer}: ${error.message}`; errorStage = stage; console.error(lastError);
      if (stage.startsWith('RMS')) scheduleRecovery(printer, error);
    }
    finally {
      busy.delete(printer); publish();
      if (requested.delete(printer)) setImmediate(() => void drain(printer));
      if (socket?.connected && clients.size) void loadQueueStatus();
    }
  }
  function page() { return ui.render(state(), controlToken); }
  const server = http.createServer(async (req, res) => {
    try {
      // Prevent DNS rebinding and cross-origin control of the local service.
      const host = String(req.headers.host || '');
      if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) { res.writeHead(403); return res.end('Invalid host'); }
      if (req.headers.origin && ![`http://localhost:${server.address().port}`, `http://127.0.0.1:${server.address().port}`].includes(req.headers.origin)) { res.writeHead(403); return res.end('Invalid origin'); }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${controlToken}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
      if (req.method === 'GET' && req.url === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        clients.add(res); res.write(`data: ${JSON.stringify(ui.panels(state()))}\n\n`);
        res.on('error', () => clients.delete(res));
        req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(page()); }
      if (req.method !== 'POST') { res.writeHead(404); return res.end('Not found'); }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413); return res.end('Request too large'); } }
      const form = new URLSearchParams(body);
      if (form.get('token') !== controlToken) { res.writeHead(403); return res.end('Invalid control token'); }
      if (req.url === '/refresh') { configEpoch++; await syncConfiguration(); socket?.emit('print:sync'); }
      else if (req.url === '/status') { if (!await loadQueueStatus()) throw new Error(queueError); clearRecovery(); socket?.emit('print:sync'); }
      else if (req.url === '/detect') { await inspectPrinters(); if (detectionError) throw new Error(detectionError); }
      else if (req.url === '/reconnect') { if (!socket) throw new Error('WebSocket has not started'); clearRecovery(); socket.disconnect(); socket.connect(); }
      else if (req.url === '/pause') { paused = !paused; clearRecovery(); if (!paused) socket?.emit('print:sync'); }
      else if (req.url === '/paper') {
        if (!config?.printers.some(p => p.system_name === form.get('printer')) || !['58', '80'].includes(form.get('width'))) throw new Error('Invalid printer or paper width');
        paper[form.get('printer')] = form.get('width'); save('paper.json', paper);
      } else if (req.url === '/resolve') {
        const id = form.get('id'), action = form.get('action');
        if (!journal[id] || !['confirm', 'fail', 'retry'].includes(action)) throw new Error('Invalid job action');
        await api(`/${id}/${action}`, { reason: 'Operator marked interrupted submission failed. Verify before retrying.' });
        journal[id].state = action === 'confirm' ? 'confirmed' : action === 'fail' ? 'failed' : 'resolved'; persistJournal();
        if (action === 'confirm' || action === 'retry') { lastError = ''; errorStage = ''; }
        socket?.emit('print:sync');
      } else { res.writeHead(404); return res.end('Not found'); }
      publish();
      if (req.headers.accept?.includes('application/json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const message = { '/refresh': 'Receipt cache refreshed from RMS.', '/status': 'Queue status updated.', '/detect': 'Local printer check complete.', '/reconnect': 'Reconnecting to RMS.', '/pause': paused ? 'Printing paused.' : 'Printing resumed.', '/paper': 'Paper width saved.', '/resolve': 'Job action saved.' }[req.url];
        return res.end(JSON.stringify({ ok: true, message }));
      }
      res.writeHead(303, { Location: '/' }); res.end();
    } catch (error) {
      lastError = error.message; errorStage = req.url === '/detect' ? 'Operating system printer check' : req.url === '/refresh' ? 'RMS configuration / artwork' : 'Agent control action'; publish();
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      if (req.headers.accept?.includes('application/json')) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: error.message })); }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`${error.message}\nReturn to http://localhost:${server.address()?.port || 3000}`);
    }
  });
  return { server, refresh, drain, page, state,
    async start(port = Number(process.env.PRINT_AGENT_PORT || 3000)) {
      const connect = options.connect || require('socket.io-client').io;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
      console.log(`RMS ESC/POS controls: http://localhost:${server.address().port}`);
      if (options.inspectPrinters || !options.print) void inspectPrinters();
      socket = connect(`${profile.serverUrl}/escpos-print-agent`, {
        auth: { token: profile.token }, transports: ['websocket'], reconnection: true
      });
      socket.on('print:ready', async event => {
        configEpoch++;
        try {
          await recoverPrinters(event?.printers || []);
        } catch (error) { lastError = error.message; errorStage = 'RMS job recovery'; console.error(lastError); publish(); scheduleRecovery('*', error); }
      });
      socket.on('print:available', async event => {
        try {
          if (!event?.stationName) return;
          if (!config || refreshing || configSync) { requested.add(event.stationName); return; }
          if (!config.printers.some(p => p.system_name === event.stationName)) return;
          if (loadedConfigEpoch < configEpoch) await recoverPrinters([event.stationName]);
          else await drain(event.stationName);
        } catch (error) { lastError = error.message; errorStage = 'RMS automatic configuration sync'; publish(); scheduleRecovery('*', error); }
      });
      socket.on('print:config-changed', () => { configEpoch++; socket.emit('print:sync'); });
      socket.on('connect', () => { clearRecovery(); lastError = ''; errorStage = ''; publish(); });
      socket.on('disconnect', reason => { clearRecovery(); if (reason === 'io server disconnect') { lastError = 'RMS closed the connection. Use Reconnect RMS; if access was revoked or the credential expired, download a new agent.'; errorStage = 'WebSocket authorization / server disconnect'; } publish(); });
      socket.on('connect_error', error => { lastError = error.message; errorStage = 'WebSocket connection to RMS'; console.error(lastError); publish(); });
    },
    async stop() { stopping = true; clearRecovery(); socket?.disconnect(); for (const client of clients) client.end(); clients.clear(); await new Promise(resolve => server.close(resolve)); }
  };
}
if (require.main === module) {
  if (!PROFILE.token || !renderer) throw new Error('Download the configured ESC/POS agent from RMS > Settings > Printers & Routing.');
  createAgent(PROFILE, renderer).start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createAgent };
