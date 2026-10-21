const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const id='12345678-1234-4123-8123-123456789abc';
const order={id,status:'pending',amount:6960,pricing:{plan:{id:'bronze'}},pixCode:'000201-TEST-ONLY',expiresAt:Date.now()+600000};
test('published funnel pixel events, values, CEP trigger and paid verification',async()=>{
const b=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox']});
try{
const p=await b.newPage();let apiState='pending',lookups=0;const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/*',async r=>{
const u=new URL(r.request().url());
if(u.hostname==='analytics.tiktok.com')return r.fulfill({contentType:'text/javascript',body:'window.__events=Array.from(window.ttq); window.ttq.track=(...args)=>window.__events.push(["track",...args]);'});
if(u.hostname!=='mare-azul.pages.dev'&&u.hostname!=='preview.mare-azul.pages.dev')return r.abort();
if(r.request().method()!=='GET')throw Error('Unexpected payment creation');
if(u.pathname.startsWith('/api/orders/')){lookups++;return r.fulfill({contentType:'application/json',body:JSON.stringify({...order,status:apiState})});}
if(u.pathname.startsWith('/api/'))return r.fulfill({status:404,body:'{}'});
const f=path.join(root,u.pathname+(u.pathname.endsWith('/')?'index.html':''));
if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
return r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'application/octet-stream'});
});
const events=()=>p.evaluate(()=>window.__events?.filter(x=>x[0]==='track')||[]);
const goto=async url=>{await p.goto(url);await p.waitForTimeout(60);};
await goto('https://mare-azul.pages.dev/?utm_source=test');
assert.deepEqual((await events()).map(x=>x[1]),['ViewContent']);
assert.equal((await events())[0][2].contents.length,3);
await goto('https://mare-azul.pages.dev/checkout/?plano=bronze');
assert.deepEqual((await events()).map(x=>x[1]),['InitiateCheckout']);
assert.equal((await events())[0][2].value,49.7);
for(const[k,v]of Object.entries({name:'Pessoa Teste',email:'teste@example.invalid',phone:'11999999999',cpf:'52998224725'}))await p.locator('#'+k).fill(v);
await p.locator('#body-dados .btn-continuar').click();
await p.locator('#street').fill('Rua teste');
await p.locator('#cep').fill('0100100');assert.equal((await events()).length,1);
await p.locator('#cep').fill('01001000');await p.locator('#cep').fill('02002000');
assert.deepEqual((await events()).map(x=>x[1]),['InitiateCheckout','AddPaymentInfo']);
await p.evaluate(o=>{window.dispatchEvent(new CustomEvent('boxes:pix-ready',{detail:{...o,status:'uncertain'}}));window.dispatchEvent(new CustomEvent('boxes:pix-ready',{detail:o}));window.dispatchEvent(new CustomEvent('boxes:pix-ready',{detail:o}));},order);
let ev=await events();assert.equal(ev.filter(x=>x[1]==='Purchase').length,1);assert.equal(ev.find(x=>x[1]==='Purchase')[2].value,69.6);
await p.evaluate(({id})=>sessionStorage.setItem('mareazul.ironpayOrder',JSON.stringify({id,accessToken:'a'.repeat(64)})),order);
await goto('https://mare-azul.pages.dev/obrigado/?paid=true');assert.equal((await events()).length,0);assert.equal(lookups,1);
apiState='paid';await p.reload();await p.waitForTimeout(100);
ev=await events();assert.deepEqual(ev.map(x=>x[1]),['PedidoPago']);assert.equal(ev[0][2].value,69.6);
await p.reload();await p.waitForTimeout(100);assert.equal((await events()).length,0);
await p.evaluate(()=>sessionStorage.clear());const before=lookups;
await p.reload();await p.waitForTimeout(100);assert.equal(lookups,before);assert.equal((await events()).length,0);
await goto('https://mare-azul.pages.dev/index.html');assert.equal((await events()).length,0);
await goto('https://preview.mare-azul.pages.dev/checkout/?plano=ouro');assert.equal((await events()).length,0);
for(const[plan,amount]of [['prata',79.9],['ouro',99.9]]){await goto('https://mare-azul.pages.dev/checkout/?plano='+plan);assert.equal((await events())[0][2].value,amount);}
assert.deepEqual(errors,[]);
}finally{await b.close();}
});
