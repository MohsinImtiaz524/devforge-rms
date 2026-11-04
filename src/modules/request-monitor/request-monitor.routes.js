const express = require('express');
const path = require('node:path');
const { requireSuperAdmin } = require('../../../middleware/auth');
function createMonitorRouter({ monitor = require('./request-monitor.service').monitor } = {}) {
  const router = express.Router();
  router.use(requireSuperAdmin);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store, private'); next(); });
  router.get('/view', (req, res) => res.sendFile(path.resolve(__dirname, '../../../public/request-monitor.html')));
  router.get('/', (req, res) => res.json(monitor.snapshot()));
  return router;
}
function initializeMonitorSocket(io, { monitor = require('./request-monitor.service').monitor, intervalMs = 1000 } = {}) {
  const namespace = io.of('/request-monitor');
  namespace.use((socket, next) => {
    const session = socket.request.session;
    if (session?.user?.role !== 'superadmin' || session.user.must_change_password) return next(new Error('Forbidden'));
    const expiry = session.cookie?.expires ? new Date(session.cookie.expires).getTime() : Date.now() + 15 * 60 * 1000;
    if (expiry <= Date.now()) return next(new Error('Session expired'));
    socket.data.monitorExpiry = Math.min(expiry, Date.now() + 15 * 60 * 1000);
    next();
  });
  let timer;
  function emit() {
    for (const socket of namespace.sockets.values()) {
      if (Date.now() >= socket.data.monitorExpiry) { socket.disconnect(true); continue; }
      // Volatile delivery bounds backpressure; the next snapshot restores current state.
      socket.volatile.emit('monitor:snapshot', monitor.snapshot());
    }
  }
  namespace.on('connection', socket => {
    socket.emit('monitor:snapshot', monitor.snapshot());
    if (!timer) { timer = setInterval(emit, intervalMs); timer.unref?.(); }
    socket.on('disconnect', () => { if (!namespace.sockets.size && timer) { clearInterval(timer); timer = null; } });
  });
  io.httpServer?.once('close', () => { if (timer) clearInterval(timer); });
  return namespace;
}
module.exports = { createMonitorRouter, initializeMonitorSocket };
