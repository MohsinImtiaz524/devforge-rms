const { performance } = require('node:perf_hooks');
const WINDOWS = { live: 60, '1m': 60, '1h': 3600, '24h': 86400, '7d': 604800 };
function createIntelligence({ now = Date.now, maxEvents = 3000, spikeQueryThreshold = 50, spikeWallMsThreshold = 5000, spikeSlowThreshold = 3 } = {}) {
  const started = now(), minutes = new Map(), recent = [];
  let dropped = 0, cpu = process.cpuUsage(), cpuAt = performance.now(), cpuPercent = null;
  function add(kind, event) {
    const at = now(), minute = Math.floor(at / 60000);
    let bucket = minutes.get(minute);
    if (!bucket) { bucket = { at: minute * 60000, backend: 0, database: 0, cloudflare: 0, external: 0, websocket: 0, errors: 0, dbMs: 0, slow: 0, maxWaitingConnections: 0, fingerprints: new Map(), origins: new Map(), tenants: new Map(), requests: new Map() }; minutes.set(minute, bucket); }
    bucket[kind] = (bucket[kind] || 0) + 1; bucket.errors += event.failed ? 1 : 0;
    if (kind === 'database') {
      bucket.dbMs += event.durationMs || 0; bucket.slow += event.durationMs >= 250 ? 1 : 0;
      const rawFingerprint = event.fingerprint || event.label || 'Unknown', fingerprint = bucket.fingerprints.has(rawFingerprint) || bucket.fingerprints.size < 100 ? rawFingerprint : 'Other fingerprints';
      const fp = bucket.fingerprints.get(fingerprint) || { fingerprint, label: fingerprint === rawFingerprint ? event.label : 'Additional bounded fingerprints', table: fingerprint === rawFingerprint ? event.table || 'Unknown' : 'Other', count: 0, wallMs: 0 };
      fp.count++; fp.wallMs += event.durationMs || 0; bucket.fingerprints.set(fingerprint, fp);
      const rawOrigin = event.source || 'Background / internal', origin = bucket.origins.has(rawOrigin) || bucket.origins.size < 100 ? rawOrigin : 'Other bounded origins';
      const originRow = bucket.origins.get(origin) || { name: origin, count: 0, kind: origin === rawOrigin && /^(GET|POST|PUT|PATCH|DELETE) /.test(origin) ? 'http' : origin === rawOrigin && origin.startsWith('Socket.IO') ? 'websocket' : 'job' };
      originRow.count++; bucket.origins.set(origin, originRow);
      const rawTenant = event.tenant ? `Shop ${event.tenant}` : 'Platform / unattributed', tenant = bucket.tenants.has(rawTenant) || bucket.tenants.size < 100 ? rawTenant : 'Other bounded tenants'; bucket.tenants.set(tenant, (bucket.tenants.get(tenant) || 0) + 1);
      bucket.maxWaitingConnections = Math.max(bucket.maxWaitingConnections, Number(event.poolWaiting) || 0);
      if (event.trace && (bucket.requests.has(event.trace) || bucket.requests.size < 500)) {
        const request = bucket.requests.get(event.trace) || { trace: event.trace, source: origin, tenant, queries: 0, wallMs: 0, sessionQueries: 0, permissionQueries: 0 };
        if (event.tenant) request.tenant = tenant;
        request.queries++; request.wallMs += event.durationMs || 0;
        if (event.table === 'sessions') request.sessionQueries++;
        if (['user_roles', 'roles', 'role_permissions', 'permissions', 'user_permissions'].includes(event.table)) request.permissionQueries++;
        bucket.requests.set(event.trace, request);
      }
    }
    while (minutes.size > 10081) minutes.delete(minutes.keys().next().value);
    recent.push({ ...event, kind, timestamp: at });
    if (recent.length > maxEvents) { recent.shift(); dropped++; }
  }
  function group(events, key) {
    const map = new Map();
    for (const event of events) {
      const name = key(event) || 'Unknown'; let row = map.get(name);
      if (!row) { row = { name, count: 0, db: 0, http: 0, errors: 0, ms: 0, dbMs: 0, slow: 0 }; map.set(name, row); }
      row.count++; row.db += event.kind === 'database' ? 1 : 0; row.http += event.kind === 'backend' ? 1 : 0;
      if(event.kind==='database') row.dbMs += event.durationMs || 0;
      row.errors += event.failed ? 1 : 0; row.ms += event.durationMs || 0; row.slow += event.kind === 'database' && event.durationMs >= 250 ? 1 : 0;
    }
    return [...map.values()].sort((a,b)=>b.count-a.count).slice(0,30);
  }
  function snapshot(window = 'live') {
    const seconds = WINDOWS[window] || 60, at = now(), cutoff = at - seconds * 1000;
    const buckets = [...minutes.values()].filter(b=>b.at >= Math.floor(cutoff / 60000)*60000 && b.at<=at);
    const totals = { backend: 0, database: 0, cloudflare: 0, external: 0, websocket: 0, errors: 0, dbMs: 0, slow: 0 };
    for (const b of buckets) for (const key of Object.keys(totals)) totals[key] += b[key] || 0;
    const events = recent.filter(e=>e.timestamp>cutoff), db = events.filter(e=>e.kind==='database');
    const traces = group(events.filter(e=>e.trace),e=>e.trace);
    const repeats = group(db,e=>e.fingerprint || e.label).filter(r=>r.count>=5);
    const emptyClaims = events.filter(e=>e.kind==='backend' && e.emptyClaim===true);
    const emptyTraces=new Set(emptyClaims.map(e=>e.trace).filter(Boolean));
    const polling = group(events.filter(e=>e.kind==='backend' && /print-jobs\/(poll|claim)|realtime-print-jobs\/claim/.test(e.label)),e=>e.source);
    const insights = [];
    const duplicates=group(events.filter(e=>e.kind==='backend'),e=>e.label+' @ '+Math.floor(e.timestamp/1000)).filter(r=>r.count>=4);
    if(duplicates.length)insights.push({title:'Concurrent endpoint requests',detail:duplicates.length+' endpoint/second groups had at least 4 requests. May be legitimate clients, retries or duplicate fetching; request values are not compared.',level:'Review'});
    for (const row of repeats.slice(0,4)) insights.push({ title: 'Repeated query fingerprint', detail: row.name+' ran '+row.count+' times in retained details. Repetition alone does not prove waste.', level: 'Review' });
    for (const row of traces.filter(r=>r.db>=20).slice(0,3)) insights.push({title:'High query fan-out',detail:'Request '+row.name+' produced '+row.db+' retained SQL calls. Possible N+1 or legitimate multi-step work.',level:'Review'});
    if (polling.length) insights.push({title:'Print claim/poll traffic observed',detail:polling.reduce((n,r)=>n+r.count,0)+' retained HTTP calls. Claims may be event-driven; empty responses are not inferred.',level:'Measured'});
    if (db.some(e=>e.durationMs>=250)) insights.push({title:'Slow SQL observed',detail:'Application-observed SQL duration exceeded 250 ms. Includes network/driver time; not PostgreSQL CPU time.',level:'Measured'});
    const elapsed = performance.now()-cpuAt;
    if (elapsed>=1000) { const next = process.cpuUsage(); cpuPercent=Math.round(((next.user-cpu.user)+(next.system-cpu.system))/1000/elapsed*1000)/10;cpu=next;cpuAt=performance.now(); }
    const spikes = buckets.filter((bucket) => bucket.database >= spikeQueryThreshold || bucket.dbMs >= spikeWallMsThreshold || bucket.slow >= spikeSlowThreshold).map((bucket) => ({
      at: new Date(bucket.at).toISOString(), queries: bucket.database, sqlWallMs: Math.round(bucket.dbMs * 10) / 10, slowQueries: bucket.slow,
      thresholds: { queries: spikeQueryThreshold, sqlWallMs: spikeWallMsThreshold, slowQueries: spikeSlowThreshold },
      fingerprints: [...bucket.fingerprints.values()].sort((a,b)=>b.count-a.count || b.wallMs-a.wallMs).slice(0,5),
      origins: [...bucket.origins.values()].sort((a,b)=>b.count-a.count).slice(0,8),
      jobs: [...bucket.origins.values()].filter(row=>row.kind==='job').sort((a,b)=>b.count-a.count).slice(0,5),
      tenants: [...bucket.tenants].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,8),
      requests: [...bucket.requests.values()].sort((a,b)=>b.queries-a.queries || b.wallMs-a.wallMs).slice(0,10),
      timing: { applicationSqlWallMs: Math.round(bucket.dbMs * 10) / 10, postgresExecutionMs: null, networkMs: null, connectionWaitMs: null, maxWaitingConnections: bucket.maxWaitingConnections,
        note: 'SQL wall time is measured around the driver call. PostgreSQL execution, network, and connection-wait duration are not separable; maximum observed local pool queue depth is measured.' },
    })).sort((a,b)=>b.at.localeCompare(a.at));
    const series = buckets.filter((_b,i)=>i % Math.max(1,Math.ceil(buckets.length/120))===0).map(({ at, backend, database, cloudflare, external, websocket, errors, dbMs, slow }) => ({ at, backend, database, cloudflare, external, websocket, errors, dbMs, slow }));
    return { window, totals, spikes, spikeDefinition:{queryThreshold:spikeQueryThreshold,wallMsThreshold:spikeWallMsThreshold,slowThreshold:spikeSlowThreshold}, series, complete: at-started>=seconds*1000, observedSince:new Date(Math.max(started,cutoff)).toISOString(),
      resolution:'One-minute buckets; boundary minutes can include up to 60 seconds outside the filter.',
      detailsCoverage:{retained:events.length,limit:maxEvents,truncated:dropped>0 && recent[0]?.timestamp>cutoff,since:events[0]?.at||null},
      print:{emptyClaims:emptyClaims.length,claimCalls:polling.reduce((n,r)=>n+r.count,0),dbCallsForEmptyClaims:db.filter(e=>emptyTraces.has(e.trace)).length,attribution:'Retained request details only. Empty does not mean the reliability check was unnecessary.'},
      tables:group(db,e=>e.table),modules:group(db,e=>e.module),functions:group(db,e=>e.function),tenants:group(events,e=>e.tenant ? 'Shop '+e.tenant : 'Unattributed / platform'),
      repeated:repeats,slowQueries:db.filter(e=>e.durationMs>=250).sort((a,b)=>b.durationMs-a.durationMs).slice(0,12),traces:events.slice(-80).reverse(),polling,insights,
      infrastructure:{processCpuPercent:cpuPercent,cpuDefinition:'Process CPU over the last observed interval; 100% equals one CPU core.',rssMb:Math.round(process.memoryUsage().rss/1048576),heapMb:Math.round(process.memoryUsage().heapUsed/1048576),uptimeSeconds:Math.round(process.uptime())} };
  }
  return { add, snapshot };
}
module.exports = { createIntelligence, WINDOWS };
