(() => {
  const container = document.getElementById('checks');
  const button = document.getElementById('refresh');
  const updated = document.getElementById('updated');
  let socket;
  function card(name, status, detail, fields = {}) {
    const article = document.createElement('article'); article.className = 'card';
    const heading = document.createElement('h2'); heading.textContent = name;
    const badge = document.createElement('span'); badge.className = `badge ${status}`; badge.textContent = status;
    heading.append(badge); article.append(heading);
    const text = document.createElement('p'); text.textContent = detail; article.append(text);
    const list = document.createElement('dl');
    for (const [label, value] of Object.entries(fields)) {
      const row = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd');
      term.textContent = label; description.textContent = value ?? 'Not observed'; row.append(term, description); list.append(row);
    }
    article.append(list); container.append(article);
  }
  const time = value => value ? new Date(value).toLocaleString() : 'Not observed';
  async function websocketCheck() {
    socket?.disconnect();
    if (typeof window.io !== 'function') return card('Browser WebSocket', 'error', 'Socket.IO client could not load.');
    await new Promise(resolve => {
      let finished = false;
      const done = (status, detail) => { if (finished) return; finished = true; clearTimeout(timer); socket.disconnect(); card('Browser WebSocket', status, detail); resolve(); };
      const started = performance.now();
      const timer = setTimeout(() => done('error', 'WebSocket connection timed out.'), 6000);
      socket = window.io('/integration-health', { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 5000 });
      socket.on('connect', () => socket.timeout(3000).emit('health:ping', (error, result) => done(error || !result?.ok ? 'error' : 'ok', error || !result?.ok ? 'Connected, but the application acknowledgement failed.' : `Authenticated round trip succeeded in ${Math.round(performance.now() - started)} ms. This does not test tenant order delivery.`)));
      socket.on('connect_error', () => done('error', 'Connection rejected or unavailable. Check your root session and proxy WebSocket support.'));
    });
  }
  async function refresh() {
    if (button.disabled) return;
    button.disabled = true; updated.textContent = 'Checking integrations…'; container.replaceChildren();
    try {
      const response = await fetch('/api/admin/integration-health', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Sign in as root/superadmin to view integration health.' : 'Health checks are unavailable. Try again or inspect server logs.');
      const result = await response.json();
      for (const check of result.checks) {
        if (check.id !== 'runtime') { card(check.name, check.status, check.detail, { 'Check duration': `${check.durationMs} ms`, ...(check.data || {}) }); continue; }
        if (!check.data) { card(check.name, check.status, check.detail); continue; }
        const d = check.data, w = d.fileWorker;
        card('Backend / Render', 'ok', check.detail, { Host: d.host, 'Process uptime': `${d.uptimeSeconds} seconds`, 'Process memory': `${d.memoryRssMb} MB` });
        card('File worker', !w.enabled ? 'disabled' : !w.started ? 'error' : w.lastErrorAt && (!w.lastCompletedAt || w.lastErrorAt > w.lastCompletedAt) ? 'warning' : 'ok', 'Local worker telemetry; a successful cycle is not an end-to-end upload test.', { Mode: w.mode, Started: w.started ? 'Yes' : 'No', Running: w.running ? 'Yes' : 'No', 'Last completed cycle': time(w.lastCompletedAt), 'Last operation error': time(w.lastErrorAt), 'Next job wakeup': time(w.nextJobAt), 'Last cleanup': time(w.lastCleanupAt) });
        card('Realtime / printing', !d.webSockets.initialized || d.printing.listener === 'disconnected' ? 'warning' : 'ok', 'Server-side connection state only; no receipt is printed by this check.', { 'Socket server': d.webSockets.initialized ? 'Initialized' : 'Not initialized', 'Connected transports': d.webSockets.connectedTransports, 'PostgreSQL print listener': d.printing.listener, 'Last print notification': time(d.printing.lastNotificationAt) });
        card('Push / provider accounts', 'not-tested', `${d.pushNotifications.detail} ${d.providerAccounts}`);
      }
      updated.textContent = `Checked ${time(result.checkedAt)}${result.cached ? ' · cached snapshot' : ''} · this backend instance`;
      await websocketCheck();
    } catch (error) { updated.textContent = error.name === 'TimeoutError' ? 'Checks timed out. Try again.' : error.message; }
    finally { button.disabled = false; }
  }
  button.addEventListener('click', refresh);
  window.addEventListener('pagehide', () => socket?.disconnect());
  void refresh();
})();
