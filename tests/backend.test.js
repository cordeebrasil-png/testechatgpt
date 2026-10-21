import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { buildPixRequest } from '../functions/_lib/ironpay.js';
import { normalize, publicOrder, findOrder } from '../functions/_lib/orders.js';
import { onRequestPost } from '../functions/api/orders/index.js';
import { onRequestGet } from '../functions/api/orders/[id].js';

const SQL = await initSqlJs();
const migration = await readFile(new URL('../migrations/0001_orders.sql', import.meta.url), 'utf8');
const id = 'e264fc25-4a15-4f6e-9c78-8b8adf1a0101';
const accessToken = 'a'.repeat(64);
const secret = 'TEST_SECRET_MUST_NOT_LEAK';
const origin = 'https://checkout.example';
const input = {
  id, accessToken, color: 'Verde', amount: 1, offer_hash: 'client-price-tampering',
  customer: {
    name: 'Teste Automatizado', email: 'teste@example.invalid', phone_number: '(11) 99999-9999',
    document: '529.982.247-25', street_name: 'Rua de Teste', number: '1', complement: '',
    neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zip_code: '01001-000'
  }
};
const transaction = {
  hash: 'fixture123', payment_method: 'pix', payment_status: 'pending', amount: 11990,
  amount_total: 11990, pix: { pix_qr_code: 'DOCUMENTED_PIX_RESPONSE_FIXTURE' }
};

function database(t) {
  const db = new SQL.Database();
  db.run(migration);
  t.after(() => db.close());
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          const statement = db.prepare(sql);
          try { statement.bind(values); return statement.step() ? statement.getAsObject() : null; }
          finally { statement.free(); }
        },
        async run() { db.run(sql, values); return { meta: { changes: db.getRowsModified() } }; }
      };
    }
  };
}
function environment(t) {
  return { ORDERS_DB: database(t), IRONPAY_API_TOKEN: secret, IRONPAY_OFFER_HASH: 'offer123', IRONPAY_PRODUCT_HASH: 'product123' };
}
function request(payload = input) {
  return new Request(origin + '/api/orders', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}
function lookup(env, token = accessToken) {
  return onRequestGet({ request: new Request(origin + '/api/orders/' + id, { headers: { Authorization: 'Bearer ' + token } }), env, params: { id } });
}
function silenceLogs(t) { return t.mock.method(console, 'error', () => {}); }

test('server fixes amount/product and normalizes customer data; invalid CPF rejected', () => {
  const payload = buildPixRequest(input, { IRONPAY_OFFER_HASH: 'offer123', IRONPAY_PRODUCT_HASH: 'product123' });
  assert.equal(payload.amount, 11990);
  assert.equal(payload.offer_hash, 'offer123');
  assert.equal(payload.cart[0].product_hash, 'product123');
  assert.equal(payload.cart[0].price, 11990);
  assert.equal(payload.cart[0].tangible, true);
  assert.equal(payload.installments, 1);
  assert.equal(payload.customer.phone_number, '11999999999');
  assert.equal(payload.customer.document, '52998224725');
  assert.throws(() => buildPixRequest({ ...input, customer: { ...input.customer, document: '11111111111' } }, { IRONPAY_OFFER_HASH: 'offer123', IRONPAY_PRODUCT_HASH: 'product123' }), error => Boolean(error.fields?.document));
});

test('documented create and lookup mappings retain authoritative paid status without a Pix field', () => {
  const created = normalize(transaction);
  assert.equal(created.code, transaction.pix.pix_qr_code);
  const paid = normalize({ hash: 'fixture123', payment_method: 'pix', amount: 11990, status: 'paid', expires_at: '2026-10-11T00:00:00Z' }, 'fixture123');
  assert.equal(paid.state, 'paid');
  assert.equal(paid.code, null);
  assert.equal(paid.expiresAt, Date.parse('2026-10-11T00:00:00Z'));
  assert.throws(() => normalize({ ...transaction, amount: 1 }), /PROVIDER_AMOUNT_MISMATCH/);
  assert.throws(() => normalize(transaction, 'anotherhash'), /PROVIDER_ID_MISMATCH/);
  assert.throws(() => normalize({ ...transaction, payment_status: 'invented' }), /PROVIDER_STATUS_INVALID/);
  const pending = publicOrder({ id, state: 'pending', pix_code: null });
  assert.equal(pending.paymentReady, false);
  assert.equal(pending.code, 'PIX_CODE_PENDING');
  const receipt = publicOrder({ id, state: 'paid', pix_code: null, receipt_json: '{}' });
  assert.equal(receipt.paymentReady, true);
  assert.equal(receipt.status, 'paid');
  assert.equal(receipt.code, undefined);
});

test('create persists one charge, sends required fields, and retry is idempotent', async t => {
  const env = environment(t);
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/public/v1/transactions');
    const payload = JSON.parse(options.body);
    assert.equal(payload.amount, 11990);
    assert.equal(payload.payment_method, 'pix');
    assert.equal(payload.installments, 1);
    assert.equal(new URL(payload.postback_url).pathname, '/api/ironpay-webhook');
    assert.equal(new URL(payload.postback_url).searchParams.get('key').length, 64);
    return Response.json({ success: true, data: transaction }, { status: 201 });
  });
  const created = await onRequestPost({ request: request(), env });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.pixCode, transaction.pix.pix_qr_code);
  assert.equal(body.paymentReady, true);
  assert.equal(JSON.stringify(body).includes(secret), false);
  const row = await findOrder(env, id);
  assert.notEqual(row.access_hash, accessToken);
  assert.equal(row.provider_hash, transaction.hash);
  const retry = await onRequestPost({ request: request(), env });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).pixCode, transaction.pix.pix_qr_code);
  assert.equal(upstream.mock.callCount(), 1);
  const changed = await onRequestPost({ request: request({ ...input, color: 'Azul' }), env });
  assert.equal(changed.status, 409);
  assert.equal(upstream.mock.callCount(), 1);
});

test('missing config or invalid customer never creates a charge', async t => {
  const env = environment(t);
  const upstream = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network call'); });
  const missing = await onRequestPost({ request: request(), env: { ...env, IRONPAY_API_TOKEN: '' } });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'PAYMENT_CONFIGURATION_MISSING');
  const invalid = await onRequestPost({ request: request({ ...input, customer: { ...input.customer, document: 'invalid' } }), env });
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).code, 'INVALID_CUSTOMER');
  assert.equal(upstream.mock.callCount(), 0);
});

test('timeout creates an uncertain attempt that cannot issue a duplicate charge on retry', async t => {
  const env = environment(t);
  const logs = silenceLogs(t);
  const upstream = t.mock.method(globalThis, 'fetch', async () => { throw new Error(secret); });
  const response = await onRequestPost({ request: request(), env });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.status, 'uncertain');
  assert.equal(body.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(body.retrySafe, false);
  assert.equal(body.pixCode, null);
  assert.equal(body.paymentReady, false);
  const retry = await onRequestPost({ request: request(), env });
  assert.equal((await retry.json()).status, 'uncertain');
  const get = await lookup(env);
  assert.equal((await get.json()).code, 'PAYMENT_CREATION_UNCERTAIN');
  assert.equal(upstream.mock.callCount(), 1);
  assert.equal(JSON.stringify(logs.mock.calls).includes(secret), false);
});

test('upstream auth failures expose only safe codes and HTTP status', async t => {
  const env = environment(t);
  const logs = silenceLogs(t);
  t.mock.method(globalThis, 'fetch', async () => new Response(secret + ': raw upstream customer details', { status: 401 }));
  const response = await onRequestPost({ request: request(), env });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, 'PROVIDER_AUTH_FAILED');
  assert.equal(body.providerStatus, 401);
  assert.equal(body.retrySafe, true);
  assert.equal(JSON.stringify(body).includes(secret), false);
  assert.equal(JSON.stringify(logs.mock.calls).includes(secret), false);
  assert.equal((await findOrder(env, id)).state, 'rejected');
});

test('lookup requires matching access token and paid lookup retains previously generated code', async t => {
  const env = environment(t);
  const upstream = t.mock.method(globalThis, 'fetch', async () => Response.json(transaction));
  await onRequestPost({ request: request(), env });
  const denied = await lookup(env, 'b'.repeat(64));
  assert.equal(denied.status, 404);
  assert.equal(upstream.mock.callCount(), 1);
  await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = 0 WHERE id = ?').bind(id).run();
  upstream.mock.mockImplementation(async () => Response.json({ success: true, data: { hash: transaction.hash, payment_method: 'pix', amount: 11990, status: 'paid' } }));
  const response = await lookup(env);
  const body = await response.json();
  assert.equal(body.status, 'paid');
  assert.equal(body.pixCode, transaction.pix.pix_qr_code);
  assert.equal(body.receipt.name, input.customer.name);
});

test('refresh failure reports verificationDelayed with a safe cause', async t => {
  const env = environment(t);
  silenceLogs(t);
  const upstream = t.mock.method(globalThis, 'fetch', async () => Response.json(transaction));
  await onRequestPost({ request: request(), env });
  await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = 0 WHERE id = ?').bind(id).run();
  upstream.mock.mockImplementation(async () => { throw new Error(secret); });
  const body = await (await lookup(env)).json();
  assert.equal(body.verificationDelayed, true);
  assert.equal(body.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(body.pixCode, transaction.pix.pix_qr_code);
  assert.equal(body.retrySafe, false);
});

test('live IronPay waiting_payment status creates a payable pending Pix', async t => {
  const env = environment(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...transaction, payment_status: 'waiting_payment' }));
  const response = await onRequestPost({ request: request(), env });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, 'pending');
  assert.equal(body.paymentReady, true);
  assert.equal(body.pixCode, transaction.pix.pix_qr_code);
});

test('existing uncertain order recovers the same waiting_payment charge without another provider POST', async t => {
  const env = environment(t);
  const upstream = t.mock.method(globalThis, 'fetch', async () => Response.json(transaction));
  await onRequestPost({ request: request(), env });
  await env.ORDERS_DB.prepare("UPDATE orders SET state = 'uncertain', pix_code = NULL, last_checked = 0 WHERE id = ?").bind(id).run();
  upstream.mock.mockImplementation(async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(new URL(url).pathname, '/api/public/v1/transactions/' + transaction.hash);
    return Response.json({ success: true, data: { ...transaction, payment_status: 'waiting_payment' } });
  });
  const retry = await onRequestPost({ request: request(), env });
  assert.equal((await retry.json()).status, 'uncertain');
  const body = await (await lookup(env)).json();
  assert.equal(body.status, 'pending');
  assert.equal(body.pixCode, transaction.pix.pix_qr_code);
  assert.equal(body.paymentReady, true);
  assert.equal(upstream.mock.callCount(), 2);
  assert.equal((await findOrder(env, id)).provider_hash, transaction.hash);
});

test('missing schema is distinguishable without leaking raw database errors', async t => {
  const env = environment(t);
  const logs = silenceLogs(t);
  env.ORDERS_DB = { prepare() { throw new Error('D1_ERROR: no such table: orders; ' + secret); } };
  for (const response of [await onRequestPost({ request: request(), env }), await lookup(env)]) {
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'DATABASE_SCHEMA_MISSING');
    assert.equal(JSON.stringify(body).includes(secret), false);
    assert.equal(body.retrySafe, false);
  }
  assert.equal(JSON.stringify(logs.mock.calls).includes(secret), false);
});

for(const [shipping,fee,total] of [['free',0,11990],['pickup',0,11990],['jadlog',990,12980],['express',1990,13980]]) {
 test(`shipping ${shipping}: server total survives create, retry and paid reconciliation`, async t=>{
  const env=environment(t);
  const payloadInput={...input,shipping,amount:1,shipping_amount:1,price:1};
  const upstream=t.mock.method(globalThis,'fetch',async(url,options)=>{
   const sent=JSON.parse(options.body);
   assert.equal(sent.amount,total);assert.equal(sent.cart[0].price,total);
   assert.equal(sent.cart.length,1);assert.equal(sent.cart[0].product_hash,'product123');
   assert.equal('shipping_amount' in sent,false);assert.equal('upsell' in sent,false);
   return Response.json({...transaction,amount:total,amount_total:total});
  });
  const created=await onRequestPost({request:request(payloadInput),env});assert.equal(created.status,201);
  const body=await created.json();assert.equal(body.amount,total);assert.equal(body.pricing.shipping.amount,fee);
  const row=await findOrder(env,id);assert.equal(JSON.parse(row.receipt_json).pricing.total,total);
  const retry=await onRequestPost({request:request(payloadInput),env});assert.equal(retry.status,200);assert.equal(upstream.mock.callCount(),1);
  const changed=await onRequestPost({request:request({...payloadInput,shipping:shipping==='free'?'express':'free'}),env});
  assert.equal(changed.status,409);assert.equal(upstream.mock.callCount(),1);
  await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = 0 WHERE id = ?').bind(id).run();
  upstream.mock.mockImplementation(async()=>Response.json({...transaction,status:'paid',payment_status:'paid',amount:total,amount_total:total}));
  const paid=await (await lookup(env)).json();assert.equal(paid.status,'paid');assert.equal(paid.amount,total);assert.equal(paid.receipt.pricing.shipping.id,shipping);
 });
}

test('invalid shipping cannot fall back to free or call the provider',async t=>{
 const env=environment(t),upstream=t.mock.method(globalThis,'fetch',()=>{throw new Error('Unexpected provider call');});
 for(const shipping of ['other','__proto__','',null,{},-1]) {
  const response=await onRequestPost({request:request({...input,shipping}),env});
  assert.equal(response.status,422);assert.ok((await response.json()).fields.shipping);
 }
 assert.equal(upstream.mock.callCount(),0);
});

test('provider returning the base amount for paid shipping never releases a Pix',async t=>{
 const env=environment(t);silenceLogs(t);
 t.mock.method(globalThis,'fetch',async()=>Response.json(transaction));
 const response=await onRequestPost({request:request({...input,shipping:'express'}),env});
 const body=await response.json();assert.equal(response.status,202);assert.equal(body.status,'uncertain');
 assert.equal(body.code,'PROVIDER_AMOUNT_MISMATCH');assert.equal(body.amount,13980);assert.equal(body.pixCode,null);
});

test('legacy stored receipt without pricing retains the old amount',async t=>{
 const env=environment(t);
 const upstream=t.mock.method(globalThis,'fetch',async()=>Response.json(transaction));
 await onRequestPost({request:request(),env});
 const row=await findOrder(env,id),receipt=JSON.parse(row.receipt_json);delete receipt.pricing;
 await env.ORDERS_DB.prepare('UPDATE orders SET receipt_json = ?, last_checked = 0 WHERE id = ?').bind(JSON.stringify(receipt),id).run();
 upstream.mock.mockImplementation(async()=>Response.json({...transaction,payment_status:'paid'}));
 const paid=await (await lookup(env)).json();assert.equal(paid.status,'paid');assert.equal(paid.amount,11990);
});

test('wrong paid amount cannot confirm a shipping order; the same order can recover',async t=>{
 const env=environment(t);silenceLogs(t);
 const upstream=t.mock.method(globalThis,'fetch',async()=>Response.json({...transaction,amount:12980,amount_total:12980}));
 await onRequestPost({request:request({...input,shipping:'jadlog'}),env});
 await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = 0 WHERE id = ?').bind(id).run();
 upstream.mock.mockImplementation(async()=>Response.json({...transaction,payment_status:'paid'}));
 const bad=await (await lookup(env)).json();assert.equal(bad.status,'pending');assert.equal(bad.code,'PROVIDER_AMOUNT_MISMATCH');assert.equal(bad.amount,12980);
 await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = 0 WHERE id = ?').bind(id).run();
 upstream.mock.mockImplementation(async()=>Response.json({...transaction,payment_status:'paid',amount:12980,amount_total:12980}));
 const good=await (await lookup(env)).json();assert.equal(good.status,'paid');assert.equal(good.amount,12980);
});

test('signed webhook confirms shipping total from IronPay, not notification fields',async t=>{
 const {onRequestPost:webhook}=await import('../functions/api/ironpay-webhook.js');
 const {signature}=await import('../functions/_lib/orders.js');
 const env=environment(t),total=13980;
 const upstream=t.mock.method(globalThis,'fetch',async()=>Response.json({...transaction,amount:total,amount_total:total}));
 await onRequestPost({request:request({...input,shipping:'express'}),env});
 await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = 0 WHERE id = ?').bind(id).run();
 const key=await signature('webhook:'+id,secret);
 const notify=()=>new Request(`${origin}/api/ironpay-webhook?id=${id}&key=${key}`,{method:'POST',body:JSON.stringify({status:'paid',amount:1})});
 upstream.mock.mockImplementation(async()=>Response.json({...transaction,amount:total,amount_total:total}));
 assert.equal((await webhook({request:notify(),env})).status,200);assert.equal((await findOrder(env,id)).state,'pending');
 await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = 0 WHERE id = ?').bind(id).run();
 upstream.mock.mockImplementation(async()=>Response.json({...transaction,amount:total,amount_total:total,payment_status:'paid'}));
 assert.equal((await webhook({request:notify(),env})).status,200);
 const order=publicOrder(await findOrder(env,id));assert.equal(order.status,'paid');assert.equal(order.amount,total);assert.equal(order.pricing.shipping.id,'express');
});
