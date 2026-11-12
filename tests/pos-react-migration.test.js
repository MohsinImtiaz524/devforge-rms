const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('POS Terminal opens React while vanilla implementation remains available',()=>{const app=fs.readFileSync(path.join(__dirname,'../frontend/src/App.jsx'),'utf8'),page=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosPage.jsx'),'utf8'),lobby=fs.readFileSync(path.join(__dirname,'../services/LobbyService.js'),'utf8'),vanilla=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');assert.match(app,/\/app\/pos/);assert.match(page,/client_request_id/);assert.match(page,/orders\.create/);assert.match(page,/\/api\/sales/);assert.match(lobby,/module\.id === 'pos' \? '\/app\/pos'/);assert.match(vanilla,/async function renderPOS\(\)/);assert.match(vanilla,/async function checkout\(status = 'completed', openPaymentAfterSave = false\)/)});
test('React POS follows the vanilla restaurant action and table-assignment rules',()=>{
  const page=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosPage.jsx'),'utf8');
  const tables=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosTableSelection.jsx'),'utf8');
  assert.match(page,/submit\(retail\s*\?\s*'payment_pending'\s*:\s*'pending'\)/);
  assert.doesNotMatch(page,/submit\(retail\s*\?\s*'payment_pending'\s*:\s*'completed'\)/);
  assert.match(page,/Number\(selectedTable\.assigned_waiter_id\)/);
  assert.match(page,/print_jobs_queued/);
  assert.match(page,/setStage\('orders'\)/);
  assert.match(tables,/groupByWaiter/);
  assert.match(tables,/Waiter #/);
  assert.match(tables,/view\s*===\s*'cards'\s*&&\s*!groupByWaiter/);
});

test('legacy POS navigation checks access before redirecting and preserves an active edit',()=>{
 const vm=require('node:vm');const source=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
 const start=source.indexOf('function navigate(page, options = {}) {'),end=source.indexOf('  if (page !== "pos") stopPOSOrdersPolling();',start);
 for(const allowed of [false,true])for(const editing of [null,42]){
  const redirects=[],saved=[];
  const context={currentUser:{role:'cashier'},AVAILABLE_PANELS:[{id:'pos'}],isPanelAllowedForCurrentUser:()=>allowed,PLATFORM_OWNER_PANELS:[],_editingOrderId:editing,toast(){},localStorage:{setItem:(...args)=>saved.push(args)},window:{location:{assign:url=>redirects.push(url)}}};
  vm.runInNewContext(source.slice(start,end)+'}',context);
  context.navigate('pos');assert.deepEqual(redirects,allowed&&!editing?['/app/pos']:[]);assert.equal(saved.length,allowed&&!editing?1:0);
 }
});
