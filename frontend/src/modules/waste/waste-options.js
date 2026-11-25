import {getShopCurrency} from '../../currency'
function wasteSourceLabel(sourceType) {
  const labels = {
    product: "Product stock",
    raw_ingredient: "Raw ingredient",
    recipe_product: "Recipe product",
    prepared_batch: "Prepared batch",
    order: "Sale / order",
    return: "Return damage"
  };
  return labels[sourceType] || sourceType;
}

function wasteReasonLabel(reasonCode) {
  const labels = {
    expired: "Expired",
    spoiled: "Spoiled",
    damaged: "Damaged",
    overproduction: "Overproduction",
    kitchen_mistake: "Kitchen mistake",
    cancelled_order: "Cancelled order",
    customer_return: "Customer return",
    supplier_rejection: "Supplier rejection",
    transfer_damage: "Transfer damage",
    stock_shrinkage: "Stock shrinkage",
    staff_use: "Staff use",
    other: "Other"
  };
  return labels[reasonCode] || reasonCode;
}

function buildWasteOption(value,label,attrs={}) { return {value,label,unit:attrs.unit}; }

function buildWasteSourceOptions(context, sourceType) {
  const products = Array.isArray(context.products) ? context.products : [];
  const rawStocks = Array.isArray(context.rawStocks) ? context.rawStocks : [];
  const recipes = Array.isArray(context.recipes) ? context.recipes : [];
  const recentSales = Array.isArray(context.recentSales) ? context.recentSales : [];
  const recentReturns = Array.isArray(context.recentReturns) ? context.recentReturns : [];

  if (sourceType === "raw_ingredient") {
    return rawStocks.map((item) => {
      const usageUnit = item.usage_unit || item.unit || "unit";
      const available = Number(item.current_stock || 0) * Number(item.conversion_factor || 1);
      return buildWasteOption(`raw:${item.id}`, `${item.name} (${Number(available.toFixed(3))} ${usageUnit})`, { unit: usageUnit });
    });
  }

  if (sourceType === "product") {
    return products.map((item) => buildWasteOption(`product:${item.id}`, `${item.name} (${Number(item.stock || 0)} units)`, { unit: "unit" }));
  }

  if (sourceType === "recipe_product") {
    const recipeProducts = products
      .filter((item) => Number(item.recipe_count || 0) > 0)
      .map((item) => buildWasteOption(`product:${item.id}`, `${item.name} (linked recipe product)`, { unit: "unit" }));
    const directRecipes = recipes.map((item) => buildWasteOption(`recipe:${item.id}`, `${item.name} (recipe only)`, { unit: "unit" }));
    return [...recipeProducts, ...directRecipes];
  }

  if (sourceType === "prepared_batch") {
    return recipes.map((item) => buildWasteOption(`recipe:${item.id}`, item.name, { unit: "batch" }));
  }

  if (sourceType === "order") {
    return recentSales.map((sale) => {
      const label = `Sale #${sale.order_number || sale.id} - ${sale.customer_name || "Walk-in"} - ${getShopCurrency()} ${Number(sale.total || 0).toFixed(2)}`;
      return buildWasteOption(`sale:${sale.id}`, label, { unit: "order" });
    });
  }

  if (sourceType === "return") {
    return recentReturns.map((ret) => {
      const label = `Return #${ret.id} - Sale #${ret.order_number || ret.sale_id || "-"} - ${getShopCurrency()} ${Number(ret.total_refund || 0).toFixed(2)}`;
      return buildWasteOption(`return:${ret.id}`, label, { unit: "return" });
    });
  }

  return [];
}

function selectedWastePayload(sourceType, sourceValue) {
  const [kind, idValue] = String(sourceValue || "").split(":");
  const id = parseInt(idValue, 10);
  if (!Number.isFinite(id) || id <= 0) return null;

  const payload = {};
  if (kind === "raw") payload.raw_stock_id = id;
  if (kind === "product") payload.product_id = id;
  if (kind === "recipe") payload.recipe_id = id;
  if (kind === "sale") payload.sale_id = id;
  if (kind === "return") payload.return_id = id;

  return Object.keys(payload).length ? payload : null;
}


export {wasteSourceLabel,wasteReasonLabel,buildWasteSourceOptions,selectedWastePayload}

export const sources = ['product','raw_ingredient','recipe_product','prepared_batch','order','return']
