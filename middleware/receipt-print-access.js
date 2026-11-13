// Waiters may print unpaid reference bills only. Automated printer-agent jobs
// have no user session and keep their existing routing behavior.
function canPrintReceipt(user, format) {
  const role = String(user?.role || '').toLowerCase();
  return !['waiter', 'order_taker'].includes(role) || format === 'unpaid';
}
function enforceReceiptPrintAccess(req, res, format) {
  if (canPrintReceipt(req.session?.user, format)) return true;
  res.status(403).json({ error: 'Waiters can only print unpaid bills.' });
  return false;
}
module.exports = { canPrintReceipt, enforceReceiptPrintAccess };
