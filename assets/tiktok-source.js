export const PIXEL_ID = 'DA5U5MRC77U8NT7JF3A0';
const PRODUCT_ID = 'jbkikbdjti';
const PRODUCT_NAME = 'Kit Dobrável Duo 3 em 1';
let active = false, loaded = false;
let paymentInfoSent = false;
const pendingPurchases = new Map();
const sent = new Set();
const keyFor = (id, event) => `mareazul.tiktok.${PIXEL_ID}.${event === 'Purchase' ? 'purchase' : 'paid'}.${id}`;
function alreadySent(id, event) {
  if (sent.has(keyFor(id, event))) return true;
  try { return localStorage.getItem(keyFor(id, event)) === 'sent'; } catch { return false; }
}
function product(value = 119.90) {
  return { currency: 'BRL', value, content_type: 'product',
    contents: [{ content_id: PRODUCT_ID, content_name: PRODUCT_NAME, quantity: 1, price: value }] };
}
function flushPurchases() {
  if (!loaded) return;
  for (const [key, { id, amount, event }] of pendingPurchases) {
    if (!alreadySent(id, event)) {
      window.ttq.track(event, product(amount / 100), { event_id: `mareazul_${event === 'Purchase' ? 'purchase' : 'paid'}_${id}` });
      sent.add(key);
      try { localStorage.setItem(key, 'sent'); } catch { /* Browser storage can be unavailable. */ }
    }
    pendingPurchases.delete(key);
  }
}
export function initTikTok() {
  // Preview deployments and the separate low-value test checkout must not pollute the ads pixel.
  if (active || location.hostname !== 'mare-azul.pages.dev') return;
  if (!['/', '/index.html', '/checkout/', '/pagamento/', '/obrigado/'].includes(location.pathname)) return;
  active = true;
  try {
    window.TiktokAnalyticsObject = 'ttq';
    const ttq = window.ttq = window.ttq || [];
    ttq.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];
    ttq.setAndDefer = (target, method) => { target[method] = function () { target.push([method, ...arguments]); }; };
    for (const method of ttq.methods) ttq.setAndDefer(ttq, method);
    ttq.instance = id => {
      const instance = ttq._i[id] || [];
      for (const method of ttq.methods) ttq.setAndDefer(instance, method);
      return instance;
    };
    ttq._i = ttq._i || {};
    ttq._i[PIXEL_ID] = [];
    ttq._i[PIXEL_ID]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._t = ttq._t || {}; ttq._t[PIXEL_ID] = Date.now();
    ttq._o = ttq._o || {}; ttq._o[PIXEL_ID] = {};
    const script = document.createElement('script');
    script.async = true;
    script.src = `${ttq._i[PIXEL_ID]._u}?sdkid=${PIXEL_ID}&lib=ttq`;
    script.onload = () => { loaded = true; try { flushPurchases(); } catch { /* Tracking never blocks checkout. */ } };
    document.head.appendChild(script);
    ttq.page();
    if (['/', '/index.html'].includes(location.pathname)) ttq.track('ViewContent', product());
    if (location.pathname === '/checkout/') ttq.track('InitiateCheckout', product());
  } catch { active = false; }
}
export function trackPaidPurchase(order) {
  // Call only after the authenticated order API confirms payment, never from URL parameters.
  if (order?.status !== 'paid') return;
  trackOrderEvent(order, 'PedidoPago');
}
export function trackGeneratedPix(order) {
  // Merchant-defined Purchase conversion: a provider-issued Pix, not settled revenue.
  if (order?.status !== 'pending' || typeof order.pixCode !== 'string' ||
      !order.pixCode.trim() || order.pixCode.includes('DEMONSTRACAO') ||
      (Number(order.expiresAt) > 0 && Date.now() >= Number(order.expiresAt))) return;
  trackOrderEvent(order, 'Purchase');
}
function trackOrderEvent(order, event) {
  if (!active || !/^[a-f0-9-]{36}$/i.test(order.id || '') ||
      !Number.isSafeInteger(order.amount) || order.amount <= 0 || alreadySent(order.id, event)) return;
  pendingPurchases.set(keyFor(order.id, event), { id: order.id, amount: order.amount, event });
  try { flushPurchases(); } catch { /* Payment confirmation remains independent of analytics. */ }
}
export function trackAddressStarted() {
  if (!active || location.pathname !== '/checkout/' || paymentInfoSent) return;
  try {
    window.ttq.track('AddPaymentInfo', product());
    paymentInfoSent = true;
  } catch { /* Analytics must never interfere with address entry. */ }
}
