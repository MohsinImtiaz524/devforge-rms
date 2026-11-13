const express = require("express");
const db = require("../db/knex");
const { requireAuth } = require('../middleware/auth');
const salesService = require("../services/SalesService");
const { renderSaleReceiptPage, renderTipReceiptPage } = require("../services/ReceiptPrintService");
const shiftService = require('../services/ShiftService');
const { prepareShopImages } = require('../services/ReceiptImageService');
const { renderShiftReceiptPage } = require('../services/ShiftReceiptService');

const router = express.Router();
const { enforceReceiptPrintAccess } = require('../middleware/receipt-print-access');
const FORMATS = new Set(["kitchen", "customer", "unpaid"]);

function getRequestBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function getPrintShopId(req) {
  const queryShopId = req.query.shop_id ? Number(req.query.shop_id) : null;
  if (req.session?.user?.shop_id) return req.session.user.shop_id;
  if (req.session?.user?.role === "superadmin" && queryShopId) return queryShopId;
  return queryShopId;
}

function stationForCategory(categoryName, stationMap) {
  if (!categoryName) return "NONE";
  return stationMap[categoryName] || "NONE";
}

function parsePrintJobContent(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

async function filterKitchenItemsByStation(details, shopId, requestedStationParam) {
  if (!requestedStationParam) return details;
  const requestedStation = Array.isArray(requestedStationParam)
    ? requestedStationParam[0]
    : String(requestedStationParam);

  const { printers, resolvePrinterRoute } = await salesService.getPrinterRouting(db, shopId);
  if (!printers.length) return { ...details, items: [] };

  const [categoryRouteMap, kitchenRoute] = await Promise.all([
    salesService.getCategoryPrintRouteMap(db, shopId, resolvePrinterRoute),
    salesService.resolveKitchenRoute(db, details.sale, shopId, resolvePrinterRoute)
  ]);

  const routeLabels = new Set();
  const items = details.items.filter((item) => {
      const itemRoutes = salesService.getItemPrintRoutes(item, categoryRouteMap, kitchenRoute);
      return itemRoutes.some(itemRoute => {
        const matches = itemRoute.station !== "NONE"
          && (itemRoute.key === requestedStation || itemRoute.station === requestedStation);
        if (matches && itemRoute.label) routeLabels.add(itemRoute.label);
        return matches;
      });
    });
  return {
    ...details,
    items,
    kitchen_route_label: [...routeLabels].join(' + '),
  };
}

router.get("/jobs/:id", async (req, res) => {
  const shopId = getPrintShopId(req);
  if (!shopId) {
    return res.status(401).send("Unauthorized print request");
  }

  const job = await db("print_queue")
    .where({ id: req.params.id, shop_id: shopId })
    .first();
  if (!job) return res.status(404).send("Print job not found");

  const content = parsePrintJobContent(job.content_json);
  if (!content?.sale_id) return res.status(400).send("Invalid print job content");

  const format = ["kitchen", "customer", "unpaid"].includes(content.format)
    ? content.format
    : "kitchen";

  if (!enforceReceiptPrintAccess(req, res, format)) return;
  const details = await salesService.getBill(content.sale_id, shopId, { paymentQuotes: format === "unpaid" });
  if (!details) return res.status(404).send("Sale not found");

  if (format === "kitchen" && Array.isArray(content.items)) {
    details.items = content.items;
    details.kitchen_route_label = content.route_label || content.printer_label || content.station_name;
    details.is_update = !!content.is_update;
  }

  if (format !== 'kitchen') details.shop = await prepareShopImages(db, details.shop);
  const html = renderSaleReceiptPage(details, {
    format,
    baseUrl: getRequestBaseUrl(req),
    autoPrint: req.query.autoprint !== "0",
    timeZone: req.query.timezone,
  });

  res.type("html").send(html);
});

router.get("/sales/:id", async (req, res) => {
  const format = String(req.query.format || "customer").toLowerCase();
  if (!FORMATS.has(format)) {
    return res.status(400).send("Unsupported print format");
  }

  const shopId = getPrintShopId(req);
  if (!shopId) {
    return res.status(401).send("Unauthorized print request");
  }

  if (!enforceReceiptPrintAccess(req, res, format)) return;
  let details = await salesService.getBill(req.params.id, shopId, { paymentQuotes: format === "unpaid" });
  if (!details) return res.status(404).send("Sale not found");

  if (format === "kitchen") {
    details = await filterKitchenItemsByStation(details, shopId, req.query.station);
  }

  if (format !== 'kitchen') details.shop = await prepareShopImages(db, details.shop);
  const html = renderSaleReceiptPage(details, {
    format,
    baseUrl: getRequestBaseUrl(req),
    autoPrint: req.query.autoprint !== "0",
    timeZone: req.query.timezone,
  });

  res.type("html").send(html);
});

router.get('/tips/:saleId', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const row = await db('sale_tips as tip')
    .join('sales as s', function () { this.on('s.id', 'tip.sale_id').andOn('s.shop_id', 'tip.shop_id'); })
    .leftJoin('users as u', 'u.id', 'tip.collected_by')
    .leftJoin('tables as t', 't.id', 's.table_id')
    .where({ 'tip.sale_id': req.params.saleId, 'tip.shop_id': shopId })
    .select('tip.amount_cents', 'tip.payment_method', 'tip.collected_at',
      's.id as sale_id', 's.order_number', 's.order_type', 's.customer_name',
      'u.name as collector_name', 'u.username as collector_username', 't.table_number')
    .first();
  if (!row) return res.status(404).send('Recorded tip not found');
  const shop = await db('shops').where({ id: shopId }).first();
  res.type('html').send(renderTipReceiptPage({
    tip: row,
    sale: { id: row.sale_id, order_number: row.order_number, order_type: row.order_type, customer_name: row.customer_name },
    collector: { name: row.collector_name, username: row.collector_username },
    table: { table_number: row.table_number },
    shop
  }, { autoPrint: req.query.autoprint !== '0', timeZone: req.query.timezone }));
});

router.get('/shifts/:id', async (req, res) => {
  const shopId = getPrintShopId(req);
  if (!shopId) return res.status(401).send('Unauthorized print request');
  const details = await shiftService.getShiftDetails(shopId, req.params.id);
  if (details.shift.status !== 'closed') return res.status(400).send('Shift is not closed');
  details.summary.expected_balance = Number(details.shift.expected_balance || 0);
  details.summary.pending_verification_total = Number(details.summary.pending_cash_drops || 0) + Number(details.summary.pending_cash_handovers || 0);
  details.shop = await db('shops').where({ id: shopId }).first();
  res.type('html').send(renderShiftReceiptPage(details, { autoPrint: req.query.autoprint !== '0' }));
});

module.exports = router;
