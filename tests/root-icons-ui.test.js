const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('../frontend/node_modules/@playwright/test');

test('root icon upload requires an explicit save and confirms the persisted preview', async () => {
  let saved = null, completed = false, origin;
  const app = express();
  app.use(express.json());
  const metadata = {id:'test-icon',name:'foodpanda.svg',status:'ready',mime:'image/svg+xml',size:100,preview_url:'/api/files/test-icon/content'};
  app.get('/api/auth/me',(req,res)=>res.json({user:{id:1,role:'superadmin',name:'Root Admin'}}));
  app.get('/api/admin/icons',(req,res)=>res.json([{key:'foodpanda',label:'Foodpanda',file:saved?metadata:null,image_url:saved?metadata.preview_url:null}]));
  app.put('/api/admin/icons/foodpanda',(req,res)=>{saved=req.body.file_id;res.json({key:'foodpanda'})});
  app.get('/api/files/policies/platform.icon',(req,res)=>res.json({types:['image/svg+xml'],maxCount:1,maxBytes:2097152,maxTotalBytes:2097152}));
  app.post('/api/files/upload-sessions',(req,res)=>{assert.equal(req.body.contentType,'image/svg+xml');res.json({fileId:'test-icon',sessionId:'test-session',url:origin+'/storage-upload',headers:{'Content-Type':'image/svg+xml'}})});
  app.put('/storage-upload',(req,res)=>res.sendStatus(200));
  app.post('/api/files/upload-sessions/test-session/complete',(req,res)=>{completed=true;res.json({})});
  app.get('/api/files/test-icon',(req,res)=>res.json({...metadata,status:completed?'ready':'verifying'}));
  app.get('/api/files/test-icon/content',(req,res)=>res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#e21b70"/></svg>'));
  const dist = path.resolve(__dirname,'../frontend/dist');
  app.use('/app',express.static(dist));
  app.get('/app/*',(req,res)=>res.sendFile(path.join(dist,'index.html')));
  const server = app.listen(0);
  await new Promise(resolve=>server.once('listening',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(origin+'/app/admin/icons');
    const save=page.getByRole('button',{name:'Save icon',exact:true});
    await expect(save).toBeVisible();
    await expect(save).toBeDisabled();
    await page.locator('.root-icon-editor input[type=file]').setInputFiles({name:'foodpanda.svg',mimeType:'application/xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#e21b70"/></svg>')});
    await expect(save).toBeEnabled();
    await expect(page.getByText('Unsaved changes. Click Save icon to apply them across the system.')).toBeVisible();
    assert.equal(saved,null);
    await save.click();
    await expect(page.getByText('Saved icon. This image is available across the system.')).toBeVisible();
    assert.equal(saved,'test-icon');
    await expect(page.locator('.root-icon-editor>img')).toHaveAttribute('src','/api/files/test-icon/content');
    await page.screenshot({path:path.join(process.env.TEMP,'rms-root-icons-save.png'),fullPage:true});
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
