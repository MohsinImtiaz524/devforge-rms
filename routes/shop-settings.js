const express = require("express");
const { getSqlite, getPostgres, usePostgres } = require("../db/runtime");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const {createVerifiedImageUpload,normalizedDataImage}=require('../utils/verified-image-upload');
const path = require("path");
const fs = require("fs");
const { toDatabaseBoolean } = require("../utils/form-values");
const router = express.Router();

const upload=createVerifiedImageUpload({directory:path.join(__dirname,'..','public','uploads','receipt-assets'),prefix:'shop',maxBytes:5*1024*1024,allowGif:true});

const filesRuntime=require('../src/modules/files/files.runtime');
const logoService=require('../src/modules/shops/shops.logo').createLogoService({db:require('../db/knex'),files:filesRuntime.service});
const {sendError}=require('../utils/error-response');
function logoError(res,error){
  if(!error.status&&!error.issues){error=new Error('Shop logo is temporarily unavailable. Please retry.');error.status=503;}
  return sendError(res,error);
}
router.use('/logo',(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
const logoGate=(req,res,next)=>filesRuntime.enabled()?next():res.status(404).json({error:'Logo uploads are not enabled.'});
router.get('/logo',requireAuth,requireAdmin,logoGate,async(req,res)=>{res.set('Cache-Control','private, no-store');try{res.json(await logoService.get(req.session.user));}catch(e){logoError(res,e);}});
router.put('/logo',requireAuth,requireAdmin,logoGate,async(req,res)=>{try{res.json(await logoService.save(req.session.user,req.body));}catch(e){logoError(res,e);}});
function guardLegacyLogo(req,res,next){
  if(req.body.logo_data!==undefined||req.file)return res.status(409).json({error:'Manage your shop logo in Account Profile.'});
  next();
}
// GET /api/shop-settings
router.get("/", requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) return res.status(403).json({ error: "No shop assigned" });

    const isPostgres = usePostgres();
    const query = `SELECT id, name, currency, google_maps_url, logo_path, logo_data, logo_print_width_mm, receipt_header_text, receipt_extended_name, receipt_phone, receipt_address,
                receipt_images_json, receipt_policies, use_logo_on_receipt, use_text_on_receipt, receipt_font_family,
                header_font_size, header_font_weight, header_spacing,
                extended_name_font_size, extended_name_font_weight, extended_name_spacing,
                contact_font_size, contact_align, contact_padding,
                footer_font_size, footer_font_style, footer_margin,
                divider_style, divider_width, section_gap, auto_calculate_damage_to_loss,
                customer_bill_printer, unpaid_bill_printer, realtime_printing_enabled
         FROM shops WHERE id = ${isPostgres ? '$1' : '?'}`;

    let shop;
    if (isPostgres) shop = (await getPostgres().query(query, [shopId])).rows[0];
    else shop = getSqlite().prepare(query).get(shopId);

    if (!shop) return res.status(404).json({ error: "Shop not found" });

    const parseJson = (val) => {
        if (typeof val === 'string') { try { return JSON.parse(val); } catch(e) { return []; } }
        return val || [];
    };
    shop.receipt_images = parseJson(shop.receipt_images_json);
    delete shop.receipt_images_json;

    shop.use_logo_on_receipt = !!shop.use_logo_on_receipt;
    shop.use_text_on_receipt = !!shop.use_text_on_receipt;
    if (shop.logo_data) shop.logo_url = shop.logo_data;
    else if (shop.logo_path) shop.logo_url = `/uploads/receipt-assets/${path.basename(shop.logo_path)}`;

    shop.files_enabled=filesRuntime.enabled();
    res.set('Cache-Control','private, no-store');
    res.json(shop);
  } catch (e) {
    console.error("Fetch settings error:", e);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// POST /api/shop-settings
router.post("/", requireAuth, requireAdmin, require("multer")({limits:{fields:100,fieldSize:1048576,parts:101}}).none(), guardLegacyLogo, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (!shopId) return res.status(403).json({ error: "No shop assigned" });

    const profile = require('../src/modules/shops/shops.profile').validateProfile(req.body);
    if (profile.error) return res.status(400).json({error:profile.error});
    Object.assign(req.body, profile.values);
    if(req.body.logo_print_width_mm!==undefined){
      const width=Number(req.body.logo_print_width_mm);
      if(!Number.isFinite(width)||width<10||width>70)return res.status(400).json({error:'Logo width must be between 10 and 70 mm.'});
      req.body.logo_print_width_mm=width;
    }
    const fields = [
      "name", "google_maps_url", "receipt_header_text", "receipt_extended_name", "receipt_phone", "receipt_address", "receipt_policies",
      "use_logo_on_receipt", "use_text_on_receipt", "receipt_font_family", "header_font_size", "header_font_weight",
      "header_spacing", "extended_name_font_size", "extended_name_font_weight", "extended_name_spacing",
      "contact_font_size", "contact_align", "contact_padding", "footer_font_size", "footer_font_style",
      "footer_margin", "divider_style", "divider_width", "section_gap", "auto_calculate_damage_to_loss",
      "customer_bill_printer", "unpaid_bill_printer", "realtime_printing_enabled", "logo_print_width_mm"
    ];

    const updates = [];
    const values = [];
    if (req.body.currency !== undefined) {
      const currency = String(req.body.currency).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency) || !Intl.supportedValuesOf('currency').includes(currency)) {
        return res.status(400).json({ error: "Select a valid currency" });
      }
      updates.push(`currency = ${isPostgres ? '$' + (values.push(currency)) : '?'}`);
      if (!isPostgres) values.push(currency);
    }

    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            let val = req.body[f];
            if (["use_logo_on_receipt", "use_text_on_receipt", "auto_calculate_damage_to_loss", "realtime_printing_enabled"].includes(f)) {
                val = toDatabaseBoolean(val);
            }
            updates.push(`${f} = ${isPostgres ? '$' + (values.push(val)) : '?'}`);
            if (!isPostgres) values.push(val);
        }
    });

    if (updates.length > 0) {
        const query = `UPDATE shops SET ${updates.join(", ")} WHERE id = ${isPostgres ? '$' + (values.push(shopId)) : '?'}`;
        if (!isPostgres) values.push(shopId);
        if (isPostgres) await getPostgres().query(query, values);
        else getSqlite().prepare(query).run(...values);
    }

    if (req.body.realtime_printing_enabled !== undefined && !(req.body.realtime_printing_enabled === "true" || req.body.realtime_printing_enabled === true || req.body.realtime_printing_enabled === 1 || req.body.realtime_printing_enabled === "1")) {
      require('../services/RealtimePrintService').disconnectShop(shopId);
      if (isPostgres) await getPostgres().query("UPDATE print_queue SET status = 'pending', attempts = 0, available_at = NOW(), claimed_at = NULL, failed_at = NULL, updated_at = NOW() WHERE shop_id = $1 AND status IN ('retry_wait', 'failed')", [shopId]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Update settings error:", e);
    res.status(e.status||500).json({error:e.status?e.message:"Failed to update settings"});
  }
});

// POST /api/shop-settings/images
router.post("/images", requireAuth, requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) return res.status(403).json({ error: "No shop assigned" });
    
    // Support both file upload and direct logo_data (compressed Base64)
    const logoData = req.body.logo_data?await normalizedDataImage(req.body.logo_data):'';
    if (!req.file && !logoData) return res.status(400).json({ error: "Missing image data" });

    const isPostgres = usePostgres();
    const description=String(req.body.description||'').slice(0,300);
    let shop;
    if (isPostgres) shop = (await getPostgres().query("SELECT receipt_images_json FROM shops WHERE id = $1", [shopId])).rows[0];
    else shop = getSqlite().prepare("SELECT receipt_images_json FROM shops WHERE id = ?").get(shopId);

    let images = [];
    if (shop?.receipt_images_json) {
        try { images = typeof shop.receipt_images_json === 'string' ? JSON.parse(shop.receipt_images_json) : shop.receipt_images_json; } catch(e) { images = []; }
    }

    const imgPath = logoData ? logoData : `/uploads/receipt-assets/${req.file.filename}`;
    const newImg = { id: Date.now().toString(), path: imgPath, description: description || "", created_at: new Date().toISOString() };
    images.push(newImg);

    if (isPostgres) await getPostgres().query("UPDATE shops SET receipt_images_json = $1 WHERE id = $2", [JSON.stringify(images), shopId]);
    else getSqlite().prepare("UPDATE shops SET receipt_images_json = ? WHERE id = ?").run(JSON.stringify(images), shopId);

    res.json({ ok: true, image: newImg });
  } catch (e) {
    console.error("Image upload error:", e);
    res.status(e.status||500).json({error:e.status?e.message:"Failed to upload image"});
  }
});

// Legacy DELETE contract uses the same transactional removal as the profile.
router.delete('/logo',requireAuth,requireAdmin,logoGate,async(req,res)=>{try{await logoService.save(req.session.user,{file_id:null});res.json({ok:true});}catch(e){logoError(res,e);}});

// DELETE /api/shop-settings/images/:id
router.delete("/images/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const imageId = req.params.id;
    const isPostgres = usePostgres();

    let shop;
    if (isPostgres) shop = (await getPostgres().query("SELECT receipt_images_json FROM shops WHERE id = $1", [shopId])).rows[0];
    else shop = getSqlite().prepare("SELECT receipt_images_json FROM shops WHERE id = ?").get(shopId);

    let images = [];
    if (shop?.receipt_images_json) {
        try { images = typeof shop.receipt_images_json === 'string' ? JSON.parse(shop.receipt_images_json) : shop.receipt_images_json; } catch(e) { images = []; }
    }
    const img = images.find(i => i.id === imageId);
    if (!img) return res.status(404).json({ error: "Not found" });

    if (img.path && !img.path.startsWith("data:")) {
      const fullPath = path.join(__dirname, "..", "public", img.path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    images = images.filter(i => i.id !== imageId);

    if (isPostgres) await getPostgres().query("UPDATE shops SET receipt_images_json = $1 WHERE id = $2", [JSON.stringify(images), shopId]);
    else getSqlite().prepare("UPDATE shops SET receipt_images_json = ? WHERE id = ?").run(JSON.stringify(images), shopId);

    res.json({ ok: true });
  } catch (e) {
    console.error("Image delete error:", e);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// --- Discounts & Taxes Prefab Logic ---

// GET /api/shop-settings/discounts
router.get("/discounts", requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    const query = `SELECT * FROM discounts WHERE shop_id = ${isPostgres ? '$1' : '?'}`;
    let rows;
    if (isPostgres) rows = (await getPostgres().query(query, [shopId])).rows;
    else rows = getSqlite().prepare(query).all(shopId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch discounts" });
  }
});

// POST /api/shop-settings/discounts
router.post("/discounts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const { name, type, value } = req.body;
    if (!name || !value) return res.status(400).json({ error: "Missing name or value" });

    const isPostgres = usePostgres();
    if (isPostgres) {
      await getPostgres().query(
        "INSERT INTO discounts (shop_id, name, type, value) VALUES ($1, $2, $3, $4)",
        [shopId, name, type || 'percentage', value]
      );
    } else {
      getSqlite().prepare(
        "INSERT INTO discounts (shop_id, name, type, value) VALUES (?, ?, ?, ?)"
      ).run(shopId, name, type || 'percentage', value);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to save discount" });
  }
});

// DELETE /api/shop-settings/discounts/:id
router.delete("/discounts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (isPostgres) await getPostgres().query("DELETE FROM discounts WHERE id = $1 AND shop_id = $2", [req.params.id, shopId]);
    else getSqlite().prepare("DELETE FROM discounts WHERE id = ? AND shop_id = ?").run(req.params.id, shopId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete discount" });
  }
});

// GET /api/shop-settings/taxes
router.get("/taxes", requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    const query = `SELECT * FROM taxes WHERE shop_id = ${isPostgres ? '$1' : '?'}`;
    let rows;
    if (isPostgres) rows = (await getPostgres().query(query, [shopId])).rows;
    else rows = getSqlite().prepare(query).all(shopId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch taxes" });
  }
});

// POST /api/shop-settings/taxes
router.post("/taxes", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const { name, percentage, linked_payment_method } = req.body;
    if (!name || percentage === undefined) return res.status(400).json({ error: "Missing name or percentage" });

    const isPostgres = usePostgres();
    if (isPostgres) {
      await getPostgres().query(
        "INSERT INTO taxes (shop_id, name, percentage, linked_payment_method) VALUES ($1, $2, $3, $4)",
        [shopId, name, percentage, linked_payment_method || null]
      );
    } else {
      getSqlite().prepare(
        "INSERT INTO taxes (shop_id, name, percentage, linked_payment_method) VALUES (?, ?, ?, ?)"
      ).run(shopId, name, percentage, linked_payment_method || null);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to save tax" });
  }
});

// DELETE /api/shop-settings/taxes/:id
router.delete("/taxes/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (isPostgres) await getPostgres().query("DELETE FROM taxes WHERE id = $1 AND shop_id = $2", [req.params.id, shopId]);
    else getSqlite().prepare("DELETE FROM taxes WHERE id = ? AND shop_id = ?").run(req.params.id, shopId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete tax" });
  }
});

module.exports = router;
