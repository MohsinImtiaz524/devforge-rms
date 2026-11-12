const MAX_CHARGE = 99999999.99;
function validateDeliveryCharge(value, orderType = 'delivery') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_CHARGE || Math.abs(value * 100 - Math.round(value * 100)) > .00001) {
    throw Object.assign(new Error('Delivery service charge must be a nonnegative amount with at most two decimals.'), { status: 400 });
  }
  if (orderType !== 'delivery' && value > 0) throw Object.assign(new Error('Service charges are available only for delivery orders.'), { status: 400 });
  return Math.round(value * 100) / 100;
}
function resolveDeliveryCharge(input, orderType, stored = 0) {
  return validateDeliveryCharge(input === undefined ? Number(stored || 0) : input, orderType);
}
function addDeliveryCharge(productTotal, charge) {
  return (Math.round(Number(productTotal) * 100) + Math.round(validateDeliveryCharge(Number(charge || 0)) * 100)) / 100;
}
module.exports = { MAX_CHARGE, validateDeliveryCharge, resolveDeliveryCharge, addDeliveryCharge };
