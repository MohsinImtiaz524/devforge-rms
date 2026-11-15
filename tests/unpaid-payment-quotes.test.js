const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {unpaidPaymentQuotes}=require('../utils/unpaid-payment-quotes');
const {renderSaleReceiptPage}=require('../services/ReceiptPrintService');
const {prepareData}=require('../src/modules/escpos-print/escpos-print.data');
test('unpaid reference prices preserve sale, include discount/delivery and use linked cash/card taxes',()=>{
  const sale=Object.freeze({id:2570,total:1140,discount:100,tax_percentage:10,delivery_service_charge:150,amount_received:100,payment_method:'cash',order_status:'pending'});
  const items=[{product_name:'Meal',quantity:1,price_at_sale:1000}];
  const taxes=[{linked_payment_method:'cash',percentage:16},{linked_payment_method:'card',percentage:5}];
  const quotes=unpaidPaymentQuotes(sale,items,taxes);
  assert.deepEqual(quotes,[{method:'cash',tax_percentage:16,total:1194,due:1094},{method:'card',tax_percentage:5,total:1095,due:995}]);
  const details={sale,items,payment_quotes:quotes,shop:{},seller:{name:'Waiter'}};
  const html=renderSaleReceiptPage(details,{format:'unpaid'});
  assert.match(html,/Pay by cash \(16% tax\): Rs\. 1194.00/);assert.match(html,/Pay by card \(5% tax\): Rs\. 1095.00/);
  assert.match(html,/Pending - method to be confirmed/);assert.doesNotMatch(html,/GRAND TOTAL/);
  const thermal=prepareData(details);assert.equal(thermal.cashTotal,'1194.00');assert.equal(thermal.cardTotal,'1095.00');
  assert.equal(sale.total,1140);assert.equal(sale.amount_received,100);assert.equal(sale.order_status,'pending');
});
test('missing method preset uses saved tax; fractions round to two decimals',()=>{
  const quotes=unpaidPaymentQuotes({tax_percentage:10,discount:2.5},[{quantity:1,price_at_sale:100}],[{linked_payment_method:'card',percentage:0}]);
  assert.equal(quotes[0].total,107.25);assert.equal(quotes[1].total,97.5);
});
test('dine-in quotes include the snapshotted service percentage on discounted subtotal',()=>{
  const sale={order_type:'dine_in',tax_percentage:10,discount:100,dine_in_service_charge_percentage:5,amount_received:0};
  const quotes=unpaidPaymentQuotes(sale,[{quantity:1,price_at_sale:1000}],[]);
  assert.equal(quotes[0].total,1035);assert.equal(quotes[1].total,1035);
});
test('legacy unpaid buttons queue printing directly without billing API or popup',async()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../public/js/app.js'),'utf8');
  for(const name of ['showPrintOptionsModal','printUnpaidBillInquiry']){
    const start=source.indexOf('async function '+name+'('),end=source.indexOf('\n}',start)+2;
    const prints=[],context={printUnpaidBill:async id=>prints.push(id)};vm.createContext(context);vm.runInContext(source.slice(start,end),context);await context[name](2570);assert.deepEqual(prints,[2570]);
  }
});

test('cashier method selection previews linked tax and full payment without saving',()=>{
  const path=require('node:path');
  const react=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosPaymentModal.jsx'),'utf8');
  const code=react.slice(react.indexOf('  function paymentMethod('),react.indexOf('  function discountPreset('));
  let form={payment_method:'cash',amount_received:'1140',tax_percentage:'10',discount_percentage:'10',tip_amount:'0'};
  const context={taxes:[{linked_payment_method:'card',percentage:5}],subtotal:1000,discount:100,currentTax:10,serviceCharge:150,received:1140,finalTotal:1140,tip:0,setForm:fn=>{form=fn(form)}};
  vm.createContext(context);vm.runInContext(code,context);context.paymentMethod('card');
  assert.equal(form.payment_method,'card');assert.equal(form.tax_percentage,'5');assert.equal(form.amount_received,'1095.00');
  context.received=100;form.amount_received='100';context.paymentMethod('card');assert.equal(form.amount_received,'1095.00');
  const legacy=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const start=legacy.indexOf('function applyCompleteOrderLinkedTax('),end=legacy.indexOf('function setCompleteOrderFullPayment(',start);
  const fields={'op-method':{value:'card'},'op-received':{value:'1140'},'op-tip':{value:'0'},'op-tax':{value:'10',dataset:{defaultTax:'10'}},'op-discount':{value:'100',dataset:{deliveryCharge:'150'}},'op-tax-preset':{options:[{value:'5',dataset:{method:'card'}}]}};
  const legacyContext={document:{getElementById:id=>fields[id]},updateCompleteOrderSummary:()=>{}};vm.createContext(legacyContext);vm.runInContext(legacy.slice(start,end),legacyContext);legacyContext.applyCompleteOrderLinkedTax(1000);
  assert.equal(fields['op-tax'].value,'5');assert.equal(fields['op-received'].value,'1095.00');
});
