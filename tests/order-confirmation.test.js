const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('legacy confirmation expires after three seconds without clearing newer notices or drafts',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../public/js/app.js'),'utf8');
 const code=source.slice(source.indexOf('function showPOSOrderConfirmation('),source.indexOf('function toggleTheme()'));
 const nodes=new Map(),timers=[];
 const context={document:{getElementById:id=>nodes.get(id),createElement:()=>({setAttribute(){},remove(){if(nodes.get(this.id)===this)nodes.delete(this.id)}}),body:{appendChild:node=>nodes.set(node.id,node)}},escapeOrderValue:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),shopCurrencyCode:()=> 'PKR',setTimeout:(fn,delay)=>timers.push({fn,delay})};
 vm.createContext(context);vm.runInContext(code,context);
 context.showPOSOrderConfirmation({number:'<2570>',total:100});assert.equal(timers[0].delay,3000);assert.match(nodes.get('pos-order-confirmation').innerHTML,/&lt;2570&gt;/);
 context.showPOSOrderConfirmation({number:2571,total:200});timers[0].fn();assert.match(nodes.get('pos-order-confirmation').innerHTML,/2571/);timers[1].fn();assert.equal(nodes.size,0);
});
