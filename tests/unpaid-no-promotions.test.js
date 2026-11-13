const test=require('node:test'),assert=require('node:assert/strict');
const {renderSaleReceiptPage}=require('../services/ReceiptPrintService');
const templates=require('../src/modules/escpos-print/receipt-templates.json');
const details={sale:{id:1,total:100},items:[{quantity:1,price_at_sale:100,product_name:'Meal'}],shop:{name:'Shop',google_maps_url:'https://maps.example.test/shop',receipt_images:[{path:'/uploads/promo-banner.png',description:'Visit our promotion'}],receipt_policies:'Keep your receipt'}};
test('unpaid browser bills omit map QR and promotional images while paid bills retain them',()=>{
 const unpaid=renderSaleReceiptPage(details,{format:'unpaid'});
 assert.doesNotMatch(unpaid,/https:\/\/maps.example.test|promo-banner|Visit our promotion/);
 assert.match(unpaid,/Keep your receipt/);assert.match(unpaid,/Pay by cash/);assert.match(unpaid,/Pay by card/);
 const paid=renderSaleReceiptPage(details,{format:'customer'});assert.match(paid,/data-shop-maps="https:\/\/maps.example.test/);assert.match(paid,/Visit our promotion/);
});
test('unpaid thermal layout has no QR or promotional content; paid layout retains both',()=>{
 const unpaid=JSON.stringify(templates.formats.unpaid);assert.doesNotMatch(unpaid,/google_maps_url|data.promotions|"type":"qr"/);
 const paid=JSON.stringify(templates.formats.customer);assert.match(paid,/google_maps_url/);assert.match(paid,/data.promotions/);
});
