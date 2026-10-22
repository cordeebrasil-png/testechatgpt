const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),path=require('path');const{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
test('Cordee landing, original checkout, Pix copy, authenticated thank-you and isolated session',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(7000);const errors=[],posts=[];let paid=false,configured=true;
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copies.push(text)}})});
 const json=(r,x)=>r.fulfill({contentType:'application/json',body:JSON.stringify(x)});
 const order=id=>({id,status:paid?'paid':'pending',amount:9491,createdAt:Date.now(),expiresAt:Date.now()+3600000,pixCode:'000201-TEST-FIXTURE-ONLY-NOT-PAYABLE',receipt:paid?{name:'Pessoa Teste',email:'teste@example.invalid',street:'Rua Teste',number:'1',city:'São Paulo',state:'SP',cep:'01001000',selection:{colors:['Azul claro','Preta'],size:'GG (46-48)'},pricing:{total:9491}}:undefined});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='calcas.test')return r.abort();
 if(u.pathname==='/api/calcas-config')return json(r,{configured,amount:9491});
 if(u.pathname.startsWith('/api/cep/'))return json(r,{logradouro:'Rua Teste',bairro:'Centro',localidade:'São Paulo',uf:'SP'});
 if(u.pathname==='/api/orders'){const data=r.request().postDataJSON();posts.push(data);return json(r,order(data.id));}
 if(u.pathname.startsWith('/api/orders/'))return json(r,order(u.pathname.split('/').pop()));
 if(r.request().method()!=='GET')return r.abort();const f=path.join(root,u.pathname+(u.pathname.endsWith('/')?'index.html':''));if(!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});});
 await page.goto('https://calcas.test/calcas/?utm_source=fixture');
 await page.locator('[data-pant="1"] .color-option').last().click();await page.locator('.size-btn').filter({hasText:'GG'}).first().click();
 await page.locator('#mobileCtaBtn').click();await page.waitForURL('**/calcas/checkout/**');assert.match(page.url(),/utm_source=fixture/);assert.match(await page.locator('#calcasSelection').innerText(),/Azul claro \+ Preta.*GG/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('/workspace/calcas-review',{recursive:true});await page.screenshot({path:'/workspace/calcas-review/checkout-mobile.png',fullPage:true});
 for(const[k,v]of Object.entries({name:'Pessoa Teste',email:'teste@example.invalid',phone:'11999999999',cep:'01001000',cpf:'52998224725'}))await page.locator('#'+k).fill(v);
 await page.waitForFunction(()=>document.getElementById('street').value==='Rua Teste');await page.locator('#number').fill('1');
 await page.locator('#finish').click();await page.waitForURL('**/calcas/pagamento/');await page.waitForFunction(()=>document.getElementById('pixCode').value.startsWith('000201'));
 assert.equal(posts.length,1);assert.equal(posts[0].store,'calcas');assert.deepEqual(posts[0].selection,{colors:['Azul claro','Preta'],size:'GG (46-48)'});
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('mareazul.ironpayOrder')),null);
 await page.locator('#copyPixIcon').click();assert.equal(await page.evaluate(()=>copies.length),1);assert.equal(await page.locator('#copyToast').innerText(),'Código PIX copiado');
 await page.waitForTimeout(1700);await page.screenshot({path:'/workspace/calcas-review/pix-mobile.png',fullPage:true});
 await page.goto('https://calcas.test/calcas/obrigado/');await page.waitForURL('**/calcas/pagamento/');
 paid=true;await page.reload();await page.waitForURL('**/calcas/obrigado/**');await page.waitForFunction(()=>document.body.dataset.paymentState==='paid');
 assert.match(await page.locator('#orderColor').innerText(),/Azul claro.*GG/);assert.match(await page.locator('.row.total strong').innerText(),/94,91/);await page.screenshot({path:'/workspace/calcas-review/obrigado-mobile.png',fullPage:true});
 configured=false;await page.goto('https://calcas.test/calcas/checkout/');await page.waitForFunction(()=>document.getElementById('finish').textContent==='Em breve');assert.equal(await page.locator('#finish').isDisabled(),true);
 assert.deepEqual(errors,[]);
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'/workspace/calcas-review/checkout-desktop.png',fullPage:true});
 }finally{await browser.close();}
});
