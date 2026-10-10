import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/payment-health.js';

test('health checks database and provider product without creating charges or exposing secrets', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(options?.method || 'GET', 'GET');
    assert.equal(new URL(url).pathname, '/api/public/v1/products/product123');
    return Response.json({ success: true, data: { hash: 'product123', privateData: 'must-not-appear' } });
  });
  const env = {
    IRONPAY_API_TOKEN: 'secret', IRONPAY_PRODUCT_HASH: 'product123', IRONPAY_OFFER_HASH: 'offer123',
    ORDERS_DB: { prepare(sql) { assert.match(sql, /^SELECT /); return { all: async () => ({ results: [] }), first: async () => null }; } }
  };
  const response = await onRequestGet({ request: new Request('https://example.com/api/payment-health'), env });
  assert.deepEqual(await response.json(), { ready: true, checks: { database: true, providerAuthentication: true, product: true } });
  assert.equal(calls, 1);
});

test('missing configuration makes no provider request', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  const response = await onRequestGet({ request: new Request('https://example.com/api/payment-health'), env: {} });
  assert.deepEqual(await response.json(), { ready: false, code: 'PAYMENT_CONFIGURATION_MISSING' });
});
