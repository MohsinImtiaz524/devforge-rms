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
    const join = async () => {
      const identity = await identityFor(socket.handshake.auth?.token);
      if (!identity) return socket.disconnect(true);
      for (const oldRoom of socket.rooms) if (oldRoom !== socket.id) await socket.leave(oldRoom);
      socket.data.escpos = identity;
      await socket.join(`shop:${identity.shopId}`);
      for (const printer of identity.printers) await socket.join(room(identity.shopId, printer));
      socket.emit('print:ready', { printers: identity.printers });
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
    for (const socket of namespace.sockets.values()) socket.emit('print:ready', { printers: socket.data.escpos.printers });
  };
  notifications.on('reconnected', reconnected);
  io.httpServer?.once('close', () => { notifications.off('available', available); notifications.off('reconnected', reconnected); notifications.off('configuration', configuration); });
  return namespace;
}
module.exports = { initialize };
