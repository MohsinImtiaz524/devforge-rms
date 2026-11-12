const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const vanilla=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8'),react=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosPage.jsx'),'utf8');
const vanillaCode=vanilla.slice(vanilla.indexOf('async function printReceipt('),vanilla.indexOf('\nfunction printCustomerBill(',vanilla.indexOf('async function printReceipt(')));
const reactCode=react.slice(react.indexOf('  async function printReceipt('),react.indexOf('  function openReceiptWindow(',react.indexOf('  async function printReceipt(')));
async function run(kind,format,result){
 const events=[],record=(message,type)=>events.push(['notice',message.replace(/\.$/,''),type||'success']);
 const common={console:{error(){}},RECEIPT_FORMATS:{CUSTOMER:'customer'},managedShopId:null,currentUser:{shop_id:1},user:{shop_id:1},printingRef:{current:false},setPrinting(){},notify:record,toast:record,
  api:async(url,options,body)=>{events.push(['queue',url,JSON.parse(JSON.stringify(body||options.body))]);if(result==='error')throw new Error('Printer offline');return {queued:result}},
  openReceiptWindow:(id,type)=>events.push(['browser',id,type]),getReceiptPrintUrl:(id,type)=>JSON.stringify([id,type]),printSaleReceiptUrl:url=>events.push(['browser',...JSON.parse(url)])};
 vm.createContext(common);vm.runInContext(kind==='vanilla'?vanillaCode:reactCode,common);
 await common.printReceipt(42,format,...(kind==='vanilla'&&format==='kitchen'?[{browserFallback:false,missingPrinterMessage:'No kitchen printer is assigned for this order'}]:[]));return events;
}
for(const format of ['kitchen','customer','unpaid'])for(const outcome of [2,0,'error'])test('React matches vanilla '+format+' printing for '+outcome,async()=>assert.deepEqual(await run('react',format,outcome),await run('vanilla',format,outcome)));
