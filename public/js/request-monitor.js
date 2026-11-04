(() => {
  const cards = document.getElementById('cards'), status = document.getElementById('connection'), toggle = document.getElementById('toggle');
  const names = { backend: 'Backend HTTP', database: 'Database queries', cloudflare: 'Cloudflare R2', external: 'External services' };
  let socket, paused = false;
  function el(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
  function render(data) {
    document.getElementById('instance').textContent = `Instance ${data.instance} | started ${new Date(data.startedAt).toLocaleString()} | updated ${new Date(data.checkedAt).toLocaleTimeString()}`;
    const fragment = document.createDocumentFragment();
    for (const [kind, name] of Object.entries(names)) {
      const card = el('article', undefined, 'card'), item = data.cards[kind]; card.dataset.kind = kind;
      card.append(el('h2', name)); const metrics = el('div', undefined, 'metrics');
      for (const [value, label] of [[item.total, 'Since startup'], [item.lastMinute, 'Last 60 sec'], [item.failed, 'Errors'], [item.averageMs + ' ms', 'Average']]) {
        const metric = el('div'); metric.append(el('strong', String(value)), el('small', label)); metrics.append(metric);
      }
      card.append(metrics);
      if (kind === 'database' && item.last24Hours) {
        const day = item.last24Hours;
        card.append(el('p', day.count.toLocaleString() + ' database calls | Last 24 hours' + (day.complete ? '' : ' (partial window)'), 'day-count'));
        card.append(el('p', 'Observed since ' + new Date(day.since).toLocaleString() + '. This instance only; resets on restart. One-second resolution.', 'day-note'));
      }
      const activity = el('div', undefined, 'activity'); activity.tabIndex = 0; activity.setAttribute('aria-label', name + ' recent events');
      if (!item.recent.length) activity.append(el('p', 'No operations observed yet.', 'empty'));
      for (const event of item.recent) {
        const row = el('div', undefined, 'event' + (event.failed ? ' fail' : ''));
        row.append(el('strong', event.label), el('span', `${new Date(event.at).toLocaleTimeString()} | ${event.durationMs} ms | ${event.status || (event.failed ? 'Failed' : 'OK')}`), el('span', `${event.source}${event.trace ? ' | Request ' + event.trace : ''}`)); activity.append(row);
      }
      card.append(activity); fragment.append(card);
    }
    cards.replaceChildren(fragment);
  }
  function connect() {
    if (!window.io) { status.textContent = 'Socket client failed to load. Reload the page.'; return; }
    socket?.disconnect(); status.textContent = 'Connecting...';
    socket = window.io('/request-monitor', { transports: ['websocket'], forceNew: true, reconnection: true, reconnectionAttempts: 5, timeout: 5000 });
    socket.on('connect', () => { status.textContent = 'Live | updates every second'; });
    socket.on('monitor:snapshot', render);
    socket.on('connect_error', () => { status.textContent = 'Connection unavailable or root access denied. Check your login.'; });
    socket.on('disconnect', reason => { status.textContent = paused ? 'Paused' : 'Disconnected'; if (reason === 'io server disconnect') { paused = true; toggle.textContent = 'Reconnect live'; } });
  }
  toggle.addEventListener('click', () => { paused = !paused; toggle.textContent = paused ? 'Resume live' : 'Pause live'; if (paused) socket?.disconnect(); else connect(); });
  window.addEventListener('pagehide', () => socket?.disconnect());
  document.addEventListener('visibilitychange', () => { if (document.hidden) socket?.disconnect(); else if (!paused) connect(); });
  connect();
})();
