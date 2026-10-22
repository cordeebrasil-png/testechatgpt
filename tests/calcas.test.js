import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPixRequest} from '../functions/_lib/ironpay.js';
import {receipt,publicOrder,normalize} from '../functions/_lib/orders.js';
const customer={name:'Pessoa Teste',email:'teste@example.invalid',phone_number:'11999999999',document:'52998224725',street_name:'Rua Teste',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',zip_code:'01001000'};
const input={store:'calcas',customer,selection:{colors:['Azul claro','Preta'],size:'GG (46-48)'},amount:1,plan:'ouro',shipping:'express',upgrade:'dobro'};
const env={CALCAS_AMOUNT_CENTS:'9491',CALCAS_PRODUCT_HASH:'pants-product-fixture',CALCAS_OFFER_HASH:'pants-offer-fixture'};
test('pants require their own product, offer and amount; cannot charge the boxes or old product',()=>{
 const configured=buildPixRequest(input,{});assert.equal(configured.amount,9491);assert.equal(configured.cart[0].product_hash,'iexqbvgequ');assert.equal(configured.offer_hash,'1gcfvqrjeb');
 assert.throws(()=>buildPixRequest(input,{...env,CALCAS_PRODUCT_HASH:''}),/CALCAS_PRODUCT_CONFIGURATION_MISSING/);
 const payload=buildPixRequest(input,env);assert.equal(payload.amount,9491);assert.equal(payload.cart[0].product_hash,env.CALCAS_PRODUCT_HASH);assert.equal(payload.offer_hash,env.CALCAS_OFFER_HASH);assert.match(payload.cart[0].title,/Azul claro \+ Preta.*GG/);
 const saved=receipt(input,payload);assert.deepEqual(saved.selection,input.selection);assert.equal(saved.store,'calcas');
 const order=publicOrder({state:'paid',receipt_json:JSON.stringify(saved)});assert.equal(order.amount,9491);assert.equal(order.pricing.plan.id,'calcas');
 assert.equal(normalize({hash:'fixture',payment_method:'pix',amount:9491,status:'paid'},'fixture',order.amount).state,'paid');
});
test('invalid pant variants rejected; boxes pricing still unchanged',()=>{
 assert.throws(()=>buildPixRequest({...input,selection:{colors:['invalid','Preta'],size:'P'}},env),/INVALID_VARIANT/);
 for(const[plan,amount]of [['bronze',4970],['prata',7990],['ouro',9990]])assert.equal(buildPixRequest({customer,plan},{}).amount,amount);
});
