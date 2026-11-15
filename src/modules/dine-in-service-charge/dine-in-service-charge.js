const MAX_PERCENTAGE = 100;

function validatePercentage(value) {
  const percentage = Number(value || 0);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > MAX_PERCENTAGE || Math.abs(percentage * 100 - Math.round(percentage * 100)) > .00001) {
    throw Object.assign(new Error('Dine-in service charge must be a percentage from 0 to 100 with at most two decimals.'), { status: 400 });
  }
  return Math.round(percentage * 100) / 100;
}

function calculateDineInServiceCharge(discountedSubtotal, percentage, orderType) {
  if (orderType !== 'dine_in') return 0;
  const base = Math.max(0, Number(discountedSubtotal || 0));
  return Math.round(base * validatePercentage(percentage)) / 100;
}

function addServiceCharges(productTotal, ...charges) {
  return (Math.round(Number(productTotal || 0) * 100) + charges.reduce((sum, charge) => sum + Math.round(Number(charge || 0) * 100), 0)) / 100;
}

module.exports = { MAX_PERCENTAGE, validatePercentage, calculateDineInServiceCharge, addServiceCharges };
