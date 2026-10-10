import { configured, provider, reportFailure, normalize } from '../_lib/orders.js';
import { ORDER_AMOUNT } from '../_lib/ironpay.js';

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
      // Only fixed schema flags leave the server: no identifiers, payment codes or customer data.
      const row = await env.ORDERS_DB.prepare("SELECT provider_hash FROM orders WHERE state = 'uncertain' AND provider_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1").first();
      if (row) {
        const data = await provider(env, '/transactions/' + encodeURIComponent(row.provider_hash));
        const state = data.payment_status ?? data.status;
        result.mapping = {
          hashMatches: data.hash === row.provider_hash,
          pixMethod: data.payment_method === 'pix',
          amountType: typeof data.amount,
          amountMatches: data.amount === ORDER_AMOUNT,
          numericAmountMatches: Number(data.amount) === ORDER_AMOUNT,
          totalPresent: data.amount_total != null,
          totalMatches: data.amount_total == null || data.amount_total === ORDER_AMOUNT,
          knownStatus: ['waiting_payment','pending','paid','canceled','refunded'].includes(state),
          statusValue: typeof state === 'string' && /^[a-zA-Z_ -]{1,40}$/.test(state) ? state : typeof state,
          pixObject: typeof data.pix === 'object' && data.pix !== null,
          nestedCode: typeof data.pix?.pix_qr_code === 'string',
          topLevelCode: typeof data.pix_qr_code === 'string'
        };
        try { normalize(data, row.provider_hash); result.mapping.valid = true; }
        catch (error) { result.mapping.failure = reportFailure(error, 'lookup').code; }
      }
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
