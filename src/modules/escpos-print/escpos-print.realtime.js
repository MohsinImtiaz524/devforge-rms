const db = require('../../../db/knex');
const { verifyToken } = require('./escpos-print.service');

function initialize(io, notifications) {
  const namespace = io.of('/escpos-print-agent');
  const room = (shopId, printer) => `shop:${shopId}:printer:${Buffer.from(printer).toString('base64url')}`;
  async function identityFor(token) {
    const identity = verifyToken(token);
    if (!identity || !await db('shops').where({ id: identity.shopId }).first('id')) return null;
    return { ...identity, printers: await db('printers').where({ shop_id: identity.shopId }).pluck('system_name') };
  }
  namespace.use(async (socket, next) => {
    try {
      const identity = await identityFor(socket.handshake.auth?.token);
      if (!identity) return next(new Error('Unauthorized ESC/POS agent'));
      socket.data.escpos = identity; next();
    } catch (error) { next(error); }
  });
  namespace.on('connection', socket => {
    // Serialized by the agent's printer lane; claim remains atomic across agents.
    socket.on('print:claim', async (request, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      try {
        const identity = socket.data.escpos;
        if (!verifyToken(socket.handshake.auth?.token)) throw new Error('Agent credential expired');
        const station = String(request?.station_name || '');
        const registered = await db('printers').where({ shop_id: identity.shopId, system_name: station }).first('id');
        if (!registered) throw new Error('Printer is not registered for this shop');
        const job = await require('./escpos-print.queue').claim(identity.shopId, [station], station);
        acknowledge({ ok: true, data: job });
      } catch (error) { acknowledge({ ok: false, error: error.message, retryable: !/credential|registered/i.test(error.message) }); }
    });
    socket.on('print:confirm', async (request, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      try {
        const identity = socket.data.escpos;
        if (!verifyToken(socket.handshake.auth?.token)) throw new Error('Agent credential expired');
        const id = Number(request?.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid job id');
        const scope = () => db('print_queue').where({ id, shop_id: identity.shopId }).whereIn('station_name', identity.printers);
        const changed = await scope().where({ status: 'printing' }).update({ status: 'printed', printed_at: db.fn.now(), updated_at: db.fn.now(), last_error: null });
        if (!changed && !await scope().where({ status: 'printed' }).first('id')) throw new Error('Claimed job not found');
        acknowledge({ ok: true, data: { ok: true } });
      } catch (error) { acknowledge({ ok: false, error: error.message, retryable: !/credential|Invalid|not found/.test(error.message) }); }
    });
    const join = async () => {
      const identity = await identityFor(socket.handshake.auth?.token);
      if (!identity) return socket.disconnect(true);
      for (const oldRoom of socket.rooms) if (oldRoom !== socket.id) await socket.leave(oldRoom);
      socket.data.escpos = identity;
      await socket.join(`shop:${identity.shopId}`);
      for (const printer of identity.printers) await socket.join(room(identity.shopId, printer));
      socket.emit('print:ready', { printers: identity.printers, delivery: 'websocket-v1' });
    };
    socket.on('print:sync', () => join().catch(() => socket.disconnect(true)));
    join().catch(() => socket.disconnect(true));
  });
  const available = payload => namespace.to(room(Number(payload.shop_id), String(payload.station_name)))
    .emit('print:available', { stationName: payload.station_name });
  notifications.on('available', available);
  const configuration = payload => namespace.to(`shop:${Number(payload.shop_id)}`).emit('print:config-changed');
  notifications.on('configuration', configuration);
  const reconnected = () => {
    for (const socket of namespace.sockets.values()) socket.emit('print:ready', { printers: socket.data.escpos.printers, delivery: 'websocket-v1' });
  };
  notifications.on('reconnected', reconnected);
  io.httpServer?.once('close', () => { notifications.off('available', available); notifications.off('reconnected', reconnected); notifications.off('configuration', configuration); });
  return namespace;
}
module.exports = { initialize };
