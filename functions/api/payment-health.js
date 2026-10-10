import { configured, provider, reportFailure } from '../_lib/orders.js';

// Read-only deployment check. Never creates a transaction or exposes account/customer data.
export async function onRequestGet({ request, env, waitUntil }) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL('/api/payment-health', request.url).href);
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;
  let result;
  if (!configured(env)) result = { ready: false, code: 'PAYMENT_CONFIGURATION_MISSING' };
  else {
    try {
      await env.ORDERS_DB.prepare('SELECT id FROM orders LIMIT 0').all();
      const product = await provider(env, '/products/' + encodeURIComponent(env.IRONPAY_PRODUCT_HASH));
      result = product?.hash === env.IRONPAY_PRODUCT_HASH
        ? { ready: true, checks: { database: true, providerAuthentication: true, product: true } }
        : { ready: false, code: 'PRODUCT_RESPONSE_MISMATCH' };
    } catch (error) {
      result = { ready: false, ...reportFailure(error, 'lookup') };
    }
  }
  const response = Response.json(result, { headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' } });
  if (cache) {
    const saving = cache.put(cacheKey, response.clone());
    if (waitUntil) waitUntil(saving); else await saving;
  }
  return response;
}
