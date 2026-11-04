const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');
const { createHash, randomUUID } = require('node:crypto');
const KINDS = ['backend', 'database', 'cloudflare', 'external'];
const SEGMENTS = new Set(('api admin integration-health request-monitor view auth me login logout change-password sales orders kds status bill tips complete return delivery print-jobs realtime-print-jobs escpos-print poll claim confirm fail queue queue-shift download status printers shop-settings notifications unread-count read read-all push public-key subscribe unsubscribe test files upload-sessions policies content attachments cancel products product-categories raw-stock recipes shops users staff attendance leave payroll documents staff-activity roles tables floors shifts history active summary analytics dashboard-data monthly monthly-tips reports expenses recurring categories inventory-archives brands customers activity-logs subscriptions lobby moons website directory preview render-preview draft publish unpublish menu-import assets internal jobs expenses-recurring').split(' '));
function safePath(value) {
  const pathname = String(value || '/').split('?')[0].split('#')[0];
  return ('/' + pathname.split('/').filter(Boolean).slice(0, 9).map(part => SEGMENTS.has(part) ? part : ':value').join('/')).slice(0, 180);
}
function queryLabel(sql, driver) {
  const text = String(sql || '').replace(/'(?:''|[^'])*'/g, '?').replace(/(\$[a-z_]*\$)[\s\S]*?\1/gi, '?').replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*/, '');
  const operation = /^(select|insert|update|delete|with|begin|commit|rollback|savepoint|release|alter|create|drop|listen|notify|set|show)\b/i.exec(text)?.[1]?.toUpperCase() || 'QUERY';
  const cleaned = text.replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ').replace(/--[^\n]*/g, ' ');
  const table = /\b(?:from|into|update|table)\s+"?([a-z_][a-z_0-9]{0,62})"?/i.exec(cleaned)?.[1];
  return `${driver} | ${operation}${table ? ' | ' + table : ''}`;
}
function createMonitor({ now = Date.now, clock = () => performance.now(), limit = 100 } = {}) {
  const context = new AsyncLocalStorage();
  const intelligence = require('./request-monitor.intelligence').createIntelligence({ now });
  const pools = new Map();
  let socketServer;
  function tenantId(source) {
    const value = Number(source?.tenant || source?.request?.session?.user?.shop_id || source?.request?.realtimePrintAgent?.shopId);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  function runContext(label, work, tenant) {
    const parent = context.getStore();
    return context.run({ ...parent, label, function: label, tenant: tenant || tenantId(parent), trace: parent?.trace || randomUUID().slice(0,12) }, work);
  }
  function instrumentMethods(service, name, methods) {
    for(const method of methods) {
      const original=service[method];if(typeof original!=='function')continue;
      service[method]=function(...args) {
        const parent=context.getStore();
        const tenant=name==='ExpiryNotificationService' && method!=='syncSubscribedUsers' ? Number(args[0]?.shop_id)||tenantId(parent) : tenantId(parent);
        return context.run({...parent,tenant,label:parent?.label||name+'.'+method,function:name+'.'+method},()=>original.apply(this,args));
      };
    }
    return service;
  }
  let querySequence=0;
  function metadata(sql) {
    const label=queryLabel(sql,'SQL'), table=label.split(' | ')[2] || 'Unknown';
    const normalized=String(sql||'').replace(/'(?:''|[^'])*'/g,'?').replace(/\b\d+(?:\.\d+)?\b/g,'?').replace(/\s+/g,' ').trim();
    let caller=null;
    // Stack capture is sampled to avoid walking every query's stack.
    if (++querySequence % 20 === 0) {
      const line=(new Error().stack||'').split('\n').find(line=>/services[\\/]|src[\\/]modules[\\/]|routes[\\/]/.test(line) && !line.includes('request-monitor'));
      if(line) { const match=/at ([A-Za-z0-9_.$<>]+)/.exec(line); if(match) caller=match[1]+' (sampled)'; }
    }
    return { table, fingerprint:createHash('sha256').update(normalized).digest('hex').slice(0,12), caller };
  }
  const instance = randomUUID().slice(0, 8), startedAt = new Date(now()).toISOString();
  let sequence = 0;
  // Fixed-size, one-second buckets: no SQL, files, or unbounded event history.
  const dayCounts = new Float64Array(86401);
  const daySeconds = new Float64Array(86401).fill(-1);
  const collectionStarted = now();
  function dayTotal() {
    const current = Math.floor(now() / 1000); let count = 0;
    for (let i = 0; i < dayCounts.length; i++) if (daySeconds[i] > current - 86400 && daySeconds[i] <= current) count += dayCounts[i];
    return { count, complete: now() - collectionStarted >= 86400000, since: new Date(Math.max(collectionStarted, now() - 86400000)).toISOString(), resolutionSeconds: 1 };
  }
  const state = Object.fromEntries(KINDS.map(kind => [kind, { total: 0, failed: 0, durationMs: 0, timed: 0, recent: [], seconds: new Map() }]));
  function record(kind, label, durationMs, failed = false, extra = {}, source = context.getStore()) {
    if (!state[kind]) return;
    const at = now(), item = state[kind], second = Math.floor(at / 1000);
    if (kind === 'database') {
      const index = second % dayCounts.length;
      if (daySeconds[index] !== second) { daySeconds[index] = second; dayCounts[index] = 0; }
      dayCounts[index]++;
    }
    item.total++; item.failed += failed ? 1 : 0; item.durationMs += Math.max(0, Number(durationMs) || 0); if (durationMs !== null) item.timed++;
    item.seconds.set(second, (item.seconds.get(second) || 0) + 1);
    for (const key of item.seconds.keys()) if (key <= second - 60) item.seconds.delete(key);
    const event = { id: ++sequence, at: new Date(at).toISOString(), label: String(label).slice(0, 180), durationMs: durationMs === null ? null : Math.round(Math.max(0, Number(durationMs) || 0) * 10) / 10,
      failed: Boolean(failed), source: source?.label || 'Background / internal', trace: source?.trace || null };
    event.tenant = tenantId(source);
    event.module = source?.module || source?.request?.originalUrl?.split('?')[0]?.split('/')[2] || 'Background / internal';
    if (!SEGMENTS.has(event.module) && event.module !== 'websocket') event.module = 'Other / internal';
    event.function = source?.function || extra.caller || 'Not attributed';
    if (source?.emptyClaim !== undefined) event.emptyClaim = source.emptyClaim;
    if(extra.table) event.table=extra.table;
    if(extra.fingerprint) event.fingerprint=extra.fingerprint;
    intelligence.add(kind,event);
    if (Number.isInteger(extra.status)) event.status = extra.status;
    item.recent.push(event); if (item.recent.length > limit) item.recent.shift();
  }
  function middleware(req, res, next) {
    const source = { trace: randomUUID().slice(0, 12), label: `${req.method} ${safePath(req.originalUrl || req.url)}`, request: req };
    if (/\/(?:print-jobs\/poll|realtime-print-jobs\/claim)$/.test(String(req.path))) {
      const json=res.json;
      res.json=function(body) { source.emptyClaim=Array.isArray(body) && body.length===0; return json.call(this,body); };
    }
    const begin = clock(); let done = false;
    function finish(aborted) {
      if (done) return; done = true;
      record('backend', source.label, clock() - begin, aborted || res.statusCode >= 400, { status: aborted ? 499 : res.statusCode }, source);
    }
    res.once('finish', () => finish(false)); res.once('close', () => finish(!res.writableFinished));
    context.run(source, next);
  }
  async function observe(kind, label, work) {
    const begin = clock(), source = context.getStore();
    try { const result = await work(); record(kind, label, clock() - begin, false, {}, source); return result; }
    catch (error) { record(kind, label, clock() - begin, true, {}, source); throw error; }
  }
  function snapshot(window = 'live') {
    const second = Math.floor(now() / 1000);
    return { intelligence: intelligence.snapshot(window), runtime: runtimeSnapshot(), instance, startedAt, checkedAt: new Date(now()).toISOString(), cards: Object.fromEntries(KINDS.map(kind => {
      const item = state[kind]; let lastMinute = 0;
      for (const [key, count] of item.seconds) if (key > second - 60) lastMinute += count;
      return [kind, { ...(kind === 'database' ? { last24Hours: dayTotal() } : {}), total: item.total, failed: item.failed, lastMinute, averageMs: item.timed ? Math.round(item.durationMs / item.timed * 10) / 10 : 0, recent: item.recent.slice(-12).reverse() }];
    })) };
  }
  function instrumentKnex(db) {
    pools.set('Knex', () => ({ used:db.client.pool?.numUsed?.() ?? null, free:db.client.pool?.numFree?.() ?? null, waiting:db.client.pool?.numPendingAcquires?.() ?? null, max:db.client.pool?.max ?? null }));
    const pending = new Map();
    db.on('query', query => {
      if (pending.size >= 2000) pending.delete(pending.keys().next().value);
      pending.set(query.__knexQueryUid, { begin: clock(), source: context.getStore(), label: queryLabel(query.sql, 'Knex'), meta: metadata(query.sql) });
    });
    function finish(query, failed) {
      const item = pending.get(query?.__knexQueryUid); if (!item) return;
      pending.delete(query.__knexQueryUid); record('database', item.label, clock() - item.begin, failed, item.meta, item.source);
    }
    db.on('query-response', (_response, query) => finish(query, false));
    db.on('query-error', (_error, query) => finish(query, true));
  }
  const clients = new WeakSet();
  function instrumentPgClient(client) {
    if (clients.has(client)) return; clients.add(client);
    const original = client.query;
    client.query = function (...args) {
      const begin = clock(), source = context.getStore(), label = queryLabel(typeof args[0] === 'string' ? args[0] : args[0]?.text, 'pg');
      const meta=metadata(typeof args[0] === 'string' ? args[0] : args[0]?.text);
      let done = false;
      const finish = failed => { if (!done) { done = true; record('database', label, clock() - begin, failed, meta, source); } };
      const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      if (callback) args.push(function (error, result) { finish(Boolean(error)); return callback.call(this, error, result); });
      try {
        const result = original.apply(this, args);
        if (!callback && result?.then) return result.then(value => { finish(false); return value; }, error => { finish(true); throw error; });
        return result;
      } catch (error) { finish(true); throw error; }
    };
  }
  function runtimeSnapshot() {
    const sockets=socketServer ? [...socketServer._nsps.values()].filter(ns=>ns.name!=='/request-monitor').flatMap(ns=>[...ns.sockets.values()].map(socket=>({namespace:ns.name,tenant:Number(socket.data.printAgent?.shopId||socket.data.escpos?.shopId||socket.data.user?.shopId)||null}))) : [];
    return { pools:[...pools].map(([name,read])=>({name,...read()})), activeSockets:sockets.length,
      agents:sockets.filter(s=>['/escpos-print-agent','/realtime-print-agent'].includes(s.namespace)),
      connectionScope:'This process only. pg counts include its reserved listener; Knex is separate.' };
  }
  function instrumentPgPool(pool) { pools.set('pg',()=>({used:pool.totalCount-pool.idleCount,free:pool.idleCount,waiting:pool.waitingCount,max:pool.options.max})); }
  function instrumentIo(io) {
    socketServer=io;
    const seen=new WeakSet();
    const namespaces=new Set(['/','/integration-health','/realtime-print-agent','/escpos-print-agent']);
    const eventNames=new Set(['order:changed','realtime:ready','health:ping','print:claim','print:confirm','print:sync','print:ready','print:available','print:config-changed','print:heartbeat']);
    function attach(ns) {
      if(seen.has(ns)||!namespaces.has(ns.name))return;seen.add(ns);
      ns.on('connection',socket=>{
        const identity=()=>Number(socket.data.printAgent?.shopId||socket.data.escpos?.shopId||socket.data.user?.shopId)||null;
        record('external','WebSocket connected',null,false,{}, {label:'Socket.IO '+ns.name,tenant:identity()});
        socket.use((packet,next)=>{
          const event=eventNames.has(packet[0])?packet[0]:'other event';
          const source={label:'Socket.IO '+ns.name+' '+event,module:'websocket',function:event,tenant:identity(),trace:randomUUID().slice(0,12)};
          context.run(source,()=>{intelligence.add('websocket',{at:new Date(now()).toISOString(),label:'Incoming '+event,source:source.label,trace:source.trace,tenant:source.tenant,module:'websocket',function:event,durationMs:null,failed:false});next();});
        });
        socket.onAnyOutgoing(name=>intelligence.add('websocket',{at:new Date(now()).toISOString(),label:'Outgoing '+(eventNames.has(name)?name:'other event'),source:'Socket.IO '+ns.name,trace:context.getStore()?.trace||null,tenant:identity(),module:'websocket',durationMs:null,failed:false}));
        socket.on('disconnect',()=>record('external','WebSocket disconnected',null,false,{}, {label:'Socket.IO '+ns.name,tenant:identity()}));
      });
    }
    for(const ns of io._nsps.values())attach(ns);io.on('new_namespace',attach);
  }
  function instrumentS3(client) {
    const send = client.send.bind(client);
    client.send = (command, ...args) => observe('cloudflare', 'R2 | ' + (command?.constructor?.name || 'operation'), () => send(command, ...args));
    return client;
  }
  return { middleware, observe, record, snapshot, instrumentKnex, instrumentPgClient, instrumentPgPool, instrumentS3, instrumentIo, runContext, instrumentMethods };
}
const monitor = createMonitor();
module.exports = { monitor, createMonitor, safePath, queryLabel, KINDS };
