const test=require('node:test');
const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {buildExpensePdf,categorySummary,reportPeriod}=require('../src/modules/expenses/expenses.pdf');

function render(rows){return new Promise((resolve,reject)=>{const output=new PassThrough(),chunks=[];output.on('data',chunk=>chunks.push(chunk));output.on('error',reject);output.on('finish',()=>resolve(Buffer.concat(chunks)));buildExpensePdf({output,rows,month:'2026-10',user:{shop_id:'shop-42',shop_name:'Orbit Garden',shop_currency:'PKR'},generatedAt:new Date('2026-10-20T10:30:00Z')})})}

test('expense PDF is a bounded, paginated A4 report',async()=>{const categories=['Food','Utilities','Maintenance','Packaging','Transport','Cleaning','Office'];const rows=Array.from({length:46},(_,i)=>({date:`2026-10-${String(i%28+1).padStart(2,'0')}`,title:`Expense ${i+1}`,category_name:categories[i%categories.length],vendor:'Vendor',reference_number:`INV-${i+1}`,amount:100+i}));const pdf=await render(rows);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');const source=pdf.toString('latin1');const pages=(source.match(/\/Type \/Page\b/g)||[]).length;assert.ok(pages>=2,'large reports should span pages');assert.ok(pages<=5,`unexpected blank-page growth: ${pages} pages`)})

test('expense PDF helpers use calendar periods and group minor categories',()=>{assert.equal(reportPeriod('2026-02').label,'February 1-28, 2026');const rows=Array.from({length:7},(_,i)=>({category_name:`Category ${i}`,amount:i+1}));const summary=categorySummary(rows);assert.equal(summary.length,6);assert.equal(summary.at(-1)[0],'Other');assert.equal(summary.reduce((sum,item)=>sum+item[1],0),28)})