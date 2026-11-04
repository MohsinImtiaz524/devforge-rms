(() => {
  const $ = id => document.getElementById(id);
  const colors = ['#2765fa', '#45bdff', '#31d58d', '#ffd16c', '#a884ff', '#7285ff', '#eaa5a1'];
  let socket, paused = false, selectedWindow = 'live', selectedTrace = null, latest;
  const ns = 'http://www.w3.org/2000/svg';
  const iconNodes = new Map();
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }
  function icon(name) {
    const svg = svgEl('svg', { class: 'icon', viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true', focusable: 'false' });
    for (const child of iconNodes.get(name) || []) svg.append(child.cloneNode(true));
    return svg;
  }
  function hydrateIcons(root = document) {
    for (const node of root.querySelectorAll('[data-icon]')) {
      if (!node.querySelector(':scope > .icon')) node.prepend(icon(node.dataset.icon));
      if(node.tagName==='SUMMARY' && !node.querySelector('.summary-arrow')){const arrow=icon('arrow');arrow.classList.add('summary-arrow');node.append(arrow);}
    }
  }
  function num(value) { return Number(value || 0).toLocaleString(); }
  function ms(value) { return Number(value || 0).toFixed(1) + ' ms'; }
  function empty(host, message) { host.append(el('p', message || 'No activity observed in this window.', 'empty')); }
  function pill(text, type = 'unknown') { return el('span', text, 'status-pill ' + type); }
  function table(host, columns, rows, max = 30) {
    host.replaceChildren();
    if (!rows.length) { empty(host); return; }
    const wrap = el('div', undefined, 'table-wrap'), t = el('table'), head = el('thead'), heading = el('tr');
    for (const [title] of columns) heading.append(el('th', title));
    head.append(heading); t.append(head); const body = el('tbody');
    for (const row of rows.slice(0, max)) {
      const tr = el('tr');
      for (const [, key] of columns) {
        const td = el('td'), value = typeof key === 'function' ? key(row) : row[key];
        if (value instanceof Node) td.append(value); else td.textContent = String(value ?? 'Not attributed');
        tr.append(td);
      }
      body.append(tr);
    }
    t.append(body); wrap.append(t); host.append(wrap);
  }
  function stats(host, values) {
    const group = el('div', undefined, 'mini-stats');
    for (const [value, label, type] of values) {
      const item = el('div', undefined, 'mini-stat' + (type ? ' ' + type : ''));
      const caption=el('span', label);caption.title=label;item.append(el('strong', value), caption); group.append(item);
    }
    host.append(group);
  }
  function spark(series, key, color) {
    const svg = svgEl('svg', { class: 'spark', viewBox: '0 0 76 25', 'aria-hidden': 'true' });
    if (series.length < 2) return svg;
    const points = series.slice(-15), max = Math.max(1, ...points.map(p => p[key] || 0));
    svg.append(svgEl('polyline', { points: points.map((p, i) => (i * 76 / (points.length - 1)) + ',' + (23 - (p[key] || 0) / max * 20)).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.6 }));
    return svg;
  }
  function kpis(data) {
    const d = data.intelligence, r = data.runtime, host = $('overview'); host.replaceChildren();
    const errorsPercent = (d.totals.backend + d.totals.database + d.totals.external + d.totals.cloudflare) ? (d.totals.errors / (d.totals.backend + d.totals.database + d.totals.external + d.totals.cloudflare) * 100).toFixed(1) + '% of observed calls' : 'No observed calls';
    const configs = [
      ['file', 'HTTP Requests', num(d.totals.backend), num(data.cards.backend.lastMinute) + ' last 60s', '#49bdff', 'backend'],
      ['database', 'Database Queries', num(d.totals.database), num(data.cards.database.lastMinute) + ' last 60s', '#b78aff', 'database'],
      ['clock', 'Avg. DB Time', d.totals.database ? ms(d.totals.dbMs / d.totals.database) : '—', 'Driver + network wall time', '#49bdff', 'dbMs'],
      ['alert', 'Errors', num(d.totals.errors), errorsPercent, '#ff8e72', 'errors'],
      ['radio', 'WebSocket Connections', num(r.activeSockets), 'Current instance · reconnects N/A', '#28d4a0', 'websocket'],
      ['printer', 'Print Agents', num(r.agents.length), 'Connected · idle state not measured', '#49bdff', null],
    ];
    for (const [glyph, title, value, note, color, seriesKey] of configs) {
      const card = el('article', undefined, 'kpi'), top = el('div', undefined, 'kpi-top');
      card.style.setProperty('--accent', color); top.append(icon(glyph), el('span', title));
      const caption=el('small', note);caption.title=note;card.append(top, el('strong', value), caption);
      if (seriesKey) card.append(spark(d.series, seriesKey, color)); host.append(card);
    }
  }
  function activityChart(d) {
    const host = $('chart'); host.replaceChildren();
    if (!d.series.length) { empty(host, 'The chart will appear as activity is observed.'); return; }
    const width = 520, height = 180, left = 32, top = 9, bottom = 28, right = 8;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const rawMax = Math.max(1, ...d.series.flatMap(b => [b.backend, b.database, b.websocket]));
    const step = Math.max(1, Math.ceil(rawMax / 4)), max = step * 4;
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Observed HTTP, SQL and WebSocket calls per minute. Peak scale ' + max });
    for (let n = 0; n <= 4; n++) {
      const y = top + n * plotHeight / 4;
      svg.append(svgEl('line', { x1: left, y1: y, x2: width - right, y2: y, stroke: '#7587a3', 'stroke-opacity': .23 }));
      const label = svgEl('text', { x: left - 8, y: y + 3, fill: 'var(--muted)', 'font-size': 9, 'text-anchor': 'end' }); label.textContent = String(max - step * n); svg.append(label);
    }
    const count = d.series.length, tickIndices = [...new Set([0, Math.floor((count - 1) / 3), Math.floor((count - 1) * 2 / 3), count - 1])];
    for (const i of tickIndices) {
      const x = left + (count === 1 ? plotWidth / 2 : i * plotWidth / (count - 1));
      svg.append(svgEl('line', { x1: x, y1: top, x2: x, y2: top + plotHeight, stroke: '#7587a3', 'stroke-opacity': .15 }));
      const label = svgEl('text', { x, y: height - 8, fill: 'var(--muted)', 'font-size': 9, 'text-anchor': 'middle' });
      label.textContent = new Date(d.series[i].at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); svg.append(label);
    }
    for (const [key, color] of [['backend', '#49bdff'], ['database', '#b78aff'], ['websocket', '#28d4a0']]) {
      const points = d.series.map((b, i) => [left + (count === 1 ? plotWidth / 2 : i * plotWidth / (count - 1)), top + plotHeight - (b[key] || 0) / max * plotHeight]);
      svg.append(svgEl('polygon', { points: [[points[0][0], top + plotHeight], ...points, [points.at(-1)[0], top + plotHeight]].map(p => p.join(',')).join(' '), fill: color, 'fill-opacity': .09 }));
      svg.append(svgEl('polyline', { points: points.map(p => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
      if (count === 1) svg.append(svgEl('circle', { cx: points[0][0], cy: points[0][1], r: 3, fill: color }));
    }
    host.append(svg);
  }
  function databasePanels(d) {
    const host = $('tables'); host.replaceChildren();
    const total = d.tables.reduce((n, row) => n + row.count, 0), rows = d.tables.slice(0, 6).map(row => ({ ...row }));
    const other = total - rows.reduce((n, row) => n + row.count, 0); if (other) rows.push({ name: 'Other retained', count: other });
    const wrap = el('div', undefined, 'donut-wrap'), svg = svgEl('svg', { viewBox: '0 0 140 140', role: 'img', 'aria-label': 'Distribution of the top retained primary-table groups' });
    svg.append(svgEl('circle', { cx: 70, cy: 70, r: 54, fill: 'none', stroke: '#29334a', 'stroke-width': 20 }));
    let offset = 0; const circumference = 2 * Math.PI * 54;
    rows.forEach((row, i) => { const length = row.count / Math.max(1, total) * circumference;
      svg.append(svgEl('circle', { cx: 70, cy: 70, r: 54, fill: 'none', stroke: colors[i % colors.length], 'stroke-width': 20, 'stroke-dasharray': `${length} ${circumference - length}`, 'stroke-dashoffset': -offset })); offset += length; });
    wrap.append(svg); const center = el('div', undefined, 'donut-center'); center.append(el('strong', num(total)), el('span', 'Grouped queries')); wrap.append(center);
    const legend = el('div', undefined, 'donut-legend');
    for (let i = 0; i < rows.length; i++) { const row = rows[i], entry = el('div'), dot = el('i', undefined, 'color-dot'); dot.style.background = colors[i % colors.length]; entry.append(dot, el('span', row.name), el('strong', Math.round(row.count / total * 100) + '%')); legend.append(entry); }
    if (!rows.length) empty(legend, 'No SQL observed yet.'); host.append(wrap, legend);
    const slow = $('slow-list'); slow.replaceChildren();
    d.slowQueries.slice(0, 5).forEach((query, i) => { const row = el('div', undefined, 'slow-row'), label = el('span', query.source + ' (' + (query.table || 'SQL') + ')', 'query-label'); label.title = query.source + ' | ' + query.label;
      row.append(el('span', i + 1, 'rank'), label, el('span', ms(query.durationMs), 'latency')); slow.append(row); });
    if (!d.slowQueries.length) empty(slow, 'No retained SQL calls at or above 250 ms.');
    table($('table-details'), [['Primary table', 'name'], ['Calls', 'count'], ['Slow', 'slow'], ['Total time', r => ms(r.ms)]], d.tables);
    table($('repeat-details'), [['Fingerprint', 'name'], ['Calls', 'count'], ['Total time', r => ms(r.ms)]], d.repeated);
    table($('module-data'), [['Module', 'name'], ['Queries', 'count'], ['Total time', r => ms(r.ms)]], d.modules);
    table($('function-data'), [['Function / sampled site', 'name'], ['Queries', 'count'], ['Total time', r => ms(r.ms)]], d.functions);
  }
  function printPanels(data) {
    const d = data.intelligence, agents = data.runtime.agents, host = $('print-data'); host.replaceChildren();
    stats(host, [[num(agents.length), 'Connected agents'], [num(d.print.claimCalls), 'Retained claims', 'success'], [num(d.print.emptyClaims), 'Empty responses']]);
    const rows = agents.map((a, i) => ({ agent: (a.namespace === '/escpos-print-agent' ? 'ESC/POS' : 'Realtime') + ' ' + (i + 1), tenant: a.tenant ? 'Shop ' + a.tenant : 'Unattributed', status: 'Connected' }));
    const t = el('div'); table(t, [['Agent / store', r => r.agent + ' · ' + r.tenant], ['Status', () => pill('Connected', 'ok')]], rows, 3); host.append(t);
    host.append(el('p', 'Idle / queue depth: not measured. No diagnostic polling.', 'panel-caption'));
    const details = $('print-detail-data'); details.replaceChildren();
    stats(details, [[num(d.print.claimCalls), 'Observed claims'], [num(d.print.emptyClaims), 'Empty responses'], [num(d.print.dbCallsForEmptyClaims), 'SQL linked to empty claims']]);
    const pollingTable = el('div'); table(pollingTable, [['Endpoint / trigger', 'name'], ['Retained calls', 'count'], ['HTTP time', r => ms(r.ms)]], d.polling); details.append(pollingTable);
    details.append(el('p', 'Claims may be event-triggered. Empty responses do not prove wasted work. Legacy unauthenticated agents cannot be reliably identified; polling intervals and queue depth are not invented.', 'subtle'));
  }
  function socketPanels(data) {
    const d = data.intelligence, r = data.runtime, host = $('socket-data'); host.replaceChildren();
    stats(host, [[num(r.activeSockets), 'Active sockets'], [num(d.totals.websocket), 'Selected events'], ['N/A', 'Reconnects']]);
    const map = new Map(); for (const e of d.traces.filter(e => e.kind === 'websocket')) map.set(e.label, (map.get(e.label) || 0) + 1);
    const rows = [...map].sort((a, b) => b[1] - a[1]), max = Math.max(1, ...rows.map(r => r[1]));
    for (const [label, count] of rows.slice(0, 3)) { const item = el('div', undefined, 'bar-row'), text = el('div'); text.append(el('span', label), el('span', num(count))); const track = el('div', undefined, 'bar-track'), bar = el('i'); bar.style.width = count / max * 100 + '%'; track.append(bar); item.append(text, track); host.append(item); }
    if (!rows.length) empty(host, 'No retained application events.');
    const details = $('socket-detail-data'); details.replaceChildren();
    const t = el('div'); table(t, [['Observed event', r => r[0]], ['Retained count', r => r[1]]], rows); details.append(t);
    const triggered = d.traces.filter(e => e.kind === 'database' && e.source.startsWith('Socket.IO'));
    details.append(el('p', num(triggered.length) + ' SQL calls linked to WebSocket events in retained trace details.', 'subtle'));
    details.append(el('p', 'Reconnects cannot be reliably distinguished from new clients. Socket state excludes this monitor; monitor packets are not counted as application activity.', 'subtle'));
  }
  function tenants(d) {
    const columns = [['Tenant / Store', 'name'], ['HTTP', 'http'], ['DB queries', 'db'], ['Avg. DB', r => r.db ? ms(r.dbMs / r.db) : '—']];
    table($('tenant-data'), columns, d.tenants, 4);
    table($('tenant-detail-data'), [...columns, ['SQL time', r => ms(r.dbMs)], ['Errors', 'errors']], d.tenants);
  }
  function meter(host, glyph, label, value, percent, note) {
    const item = el('div', undefined, 'infra-item'); item.append(icon(glyph)); const body = el('div'), text = el('div', undefined, 'infra-label'); text.append(el('span', label), el('strong', value)); body.append(text);
    const track = el('div', undefined, 'bar-track'); if (percent !== null) { const bar = el('i'); bar.style.width = Math.max(0, Math.min(100, percent)) + '%'; track.append(bar); } body.append(track, el('small', note)); item.append(body); host.append(item);
  }
  function infrastructure(data) {
    const d = data.intelligence, pools = data.runtime.pools, host = $('infra-data'); host.replaceChildren(); const grid = el('div', undefined, 'infra-grid');
    const used = pools.reduce((n, p) => n + (p.used || 0), 0), free = pools.reduce((n, p) => n + (p.free || 0), 0), max = pools.reduce((n, p) => n + (p.max || 0), 0);
    meter(grid, 'cpu', 'Process CPU', d.infrastructure.processCpuPercent === null ? '—' : d.infrastructure.processCpuPercent + '%', d.infrastructure.processCpuPercent, '100% = one core; can exceed 100%');
    meter(grid, 'database', 'DB connections', num(used + free) + ' / ' + (max || '—'), max ? (used + free) / max * 100 : null, 'Local clients / configured max');
    meter(grid, 'memory', 'Memory', d.infrastructure.rssMb + ' MB', null, 'RSS · RAM quota unavailable; no invented %');
    meter(grid, 'server', 'Pool usage', max ? Math.round(used / max * 100) + '%' : '—', max ? used / max * 100 : null, num(used) + ' used · ' + num(free) + ' idle · ' + pools.reduce((n, p) => n + (p.waiting || 0), 0) + ' waiting');
    host.append(grid); for (const p of pools) host.append(el('p', `${p.name}: ${p.used} used / ${p.free} idle / ${p.waiting} waiting / ${p.max} max`, 'panel-caption'));
  }
  function insights(d) {
    const host = $('insight-data'); host.replaceChildren();
    const items = d.insights.length ? d.insights.slice(0, 4) : [{ level: 'Measured', title: 'No retained threshold crossings', detail: 'No heuristic alerts in the available details. This does not prove every workflow is healthy.' }];
    for (const insight of items) {
      const row = el('button', undefined, 'insight-row'), badge = el('span', undefined, 'severity' + (insight.level === 'Measured' ? ' measured' : '')); badge.append(icon(insight.level === 'Measured' ? 'info' : 'alert'), el('span', insight.level));
      row.type='button'; row.dataset.detail=insight.title.includes('query') || insight.title.includes('SQL') ? 'db-details' : 'tracing';
      const copy = el('div', undefined, 'insight-copy'); copy.append(el('strong', insight.title), el('p', insight.detail)); row.append(badge, copy, icon('arrow')); host.append(row);
    }
  }
  function traces(d) {
    const host = $('trace-data'); host.replaceChildren(); $('clear-trace').hidden = !selectedTrace;
    const events = d.traces.filter(e => !selectedTrace || e.trace === selectedTrace).slice(0, 35);
    if (!events.length) { empty(host, 'No matching events in retained details.'); return; }
    for (const e of events) {
      const row = el('article', undefined, 'trace-flow'), top = el('div', undefined, 'trace-top');
      const meta = el('span', new Date(e.at).toLocaleTimeString() + ' · ' + (e.tenant ? 'Shop ' + e.tenant : 'Platform / unattributed') + ' · ' + (e.durationMs === null ? 'Event' : ms(e.durationMs)));
      top.append(meta); if (e.trace) { const b = el('button', e.trace, 'trace-button'); b.dataset.trace = e.trace; top.append(b); }
      const chain = el('div', undefined, 'trace-chain');
      for (const [i, glyph, label] of [[0, e.source.startsWith('Socket.IO') ? 'radio' : 'file', e.source], [1, 'layers', e.function || 'Function not attributed'], [2, e.kind === 'database' ? 'database' : e.kind === 'cloudflare' ? 'cloud' : 'activity', e.label]]) {
        if (i) chain.append(icon('arrow')); const node = el('span', undefined, 'trace-node'); node.append(icon(glyph), el('span', label)); chain.append(node);
      }
      row.append(top, chain); host.append(row);
    }
  }
  function feeds(data) {
    const host = $('cards'); host.replaceChildren();
    const names = { backend: ['file', 'Backend HTTP'], database: ['database', 'Database Queries'], cloudflare: ['cloud', 'Cloudflare R2'], external: ['external', 'External Services'] };
    for (const [kind, [glyph, name]] of Object.entries(names)) {
      const item = data.cards[kind], card = el('article', undefined, 'card'); card.dataset.kind = kind;
      const h = el('h2'); h.append(icon(glyph), el('span', name)); card.append(h); const metrics = el('div', undefined, 'metrics');
      for (const [value, label] of [[num(item.total), 'Since startup'], [num(item.lastMinute), 'Last 60 seconds'], [num(item.failed), 'Errors'], [ms(item.averageMs), 'Average']]) { const box = el('div'); box.append(el('strong', value), el('small', label)); metrics.append(box); } card.append(metrics);
      if (kind === 'database' && item.last24Hours) { const day = item.last24Hours; card.append(el('p', num(day.count) + ' calls · last 24 hours' + (day.complete ? '' : ' (partial window)'), 'day-count'), el('p', 'Observed since ' + new Date(day.since).toLocaleString() + ' · this instance · resets on restart', 'day-note')); }
      const list = el('div', undefined, 'activity'); list.tabIndex = 0; list.setAttribute('aria-label', name + ' recent events');
      for (const e of item.recent) { const row = el('div', undefined, 'event' + (e.failed ? ' fail' : '')); row.append(el('strong', e.label), el('span', `${new Date(e.at).toLocaleTimeString()} · ${e.durationMs === null ? 'Event' : ms(e.durationMs)} · ${e.status || (e.failed ? 'Failed' : 'OK')}`), el('span', e.source + (e.trace ? ' · Request ' + e.trace : ''))); list.append(row); }
      if (!item.recent.length) empty(list); card.append(list); host.append(card);
    }
  }
  function render(data) {
    if (!data.intelligence || data.intelligence.window !== selectedWindow) return;
    latest = data;
    $('instance').textContent = 'Instance ' + data.instance;
    $('updated').textContent = 'Last updated: ' + new Date(data.checkedAt).toLocaleTimeString();
    $('coverage').textContent = `${data.intelligence.complete ? 'Selected period covered' : 'Partial history'} · ${data.intelligence.detailsCoverage.retained} retained detail events${data.intelligence.detailsCoverage.truncated ? ' — detail buffer truncated; rankings incomplete' : ''} · Minute totals; boundary minutes may include up to 60 extra seconds · This instance only`;
    $('coverage').prepend(icon('info'));
    kpis(data); activityChart(data.intelligence); databasePanels(data.intelligence); printPanels(data); socketPanels(data); tenants(data.intelligence); infrastructure(data); insights(data.intelligence);
    if (!$('trace-data').matches(':hover') && !$('trace-data').contains(document.activeElement)) traces(data.intelligence);
    feeds(data);
  }
  function connection(message) { $('connection').textContent = message; }
  function connect() {
    if (!window.io) { connection('Client unavailable'); return; }
    socket?.disconnect(); connection('Connecting');
    socket = window.io('/request-monitor', { transports: ['websocket'], forceNew: true, reconnection: true, reconnectionAttempts: 5, timeout: 5000 });
    socket.on('connect', () => { socket.emit('monitor:window', selectedWindow); connection('Live'); });
    socket.on('monitor:snapshot', render);
    socket.on('connect_error', () => connection('Access denied / unavailable'));
    socket.on('disconnect', reason => { connection(paused ? 'Paused' : 'Disconnected'); if (reason === 'io server disconnect') { paused = true; setToggle('Resume live', 'play'); } });
  }
  function setToggle(label, glyph) { const button = $('toggle'); button.setAttribute('aria-label', label); button.title = label; button.replaceChildren(icon(glyph)); }
  function openDetail(id) { const node = $(id); if (!node) return; if (node.tagName === 'DETAILS') node.open = true; const parent = node.closest('details'); if (parent) parent.open = true; node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  document.addEventListener('click', event => {
    const detail = event.target.closest('[data-detail]'), jump = event.target.closest('[data-jump]'), trace = event.target.closest('[data-trace]');
    if (detail) openDetail(detail.dataset.detail); if (jump) openDetail(jump.dataset.jump);
    if (trace) { selectedTrace = trace.dataset.trace; if (latest) traces(latest.intelligence); }
  });
  $('clear-trace').addEventListener('click', () => { selectedTrace = null; if (latest) traces(latest.intelligence); });
  $('history').addEventListener('click', event => { const button = event.target.closest('[data-window]'); if (!button) return; selectedWindow = button.dataset.window; for (const node of document.querySelectorAll('[data-window]')) node.setAttribute('aria-pressed', String(node === button)); socket?.emit('monitor:window', selectedWindow); });
  for (const link of document.querySelectorAll('.sidebar nav a')) link.addEventListener('click', event => { event.preventDefault(); for (const other of document.querySelectorAll('.sidebar nav a')) other.classList.toggle('active', other === link); openDetail(link.hash.slice(1)); });
  $('toggle').addEventListener('click', () => { paused = !paused; setToggle(paused ? 'Resume live' : 'Pause live', paused ? 'play' : 'pause'); if (paused) { socket?.disconnect(); connection('Paused'); } else connect(); });
  $('refresh').addEventListener('click', () => { paused = false; setToggle('Pause live', 'pause'); connect(); });
  $('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { $('updated').textContent = 'Fullscreen unavailable in this browser'; } });
  window.addEventListener('pagehide', () => socket?.disconnect());
  document.addEventListener('visibilitychange', () => { if (document.hidden) socket?.disconnect(); else if (!paused) connect(); });
  // Load the local Lucide sprite once. Cloning its nodes avoids resource
  // requests on every live update and keeps monitoring from observing itself.
  fetch('/icons/monitor-icons.svg', { cache: 'force-cache' }).then(response => {
    if (!response.ok) throw new Error('Icon asset unavailable');
    return response.text();
  }).then(text => {
    const document = new DOMParser().parseFromString(text, 'image/svg+xml');
    for (const symbol of document.querySelectorAll('symbol')) iconNodes.set(symbol.id, [...symbol.childNodes]);
    hydrateIcons(); connect();
  }).catch(() => { connection('Icon asset unavailable - reload'); });
})();
