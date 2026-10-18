export const PIXEL_ID = 'DA5U5MRC77U8NT7JF3A0';
const PRODUCT_ID = 'jbkikbdjti';
const PRODUCT_NAME = 'Kit Dobrável Duo 3 em 1';
let active = false, loaded = false;
const pendingPurchases = new Map();
const sent = new Set();
const keyFor = id => `mareazul.tiktok.${PIXEL_ID}.purchase.${id}`;
function alreadySent(id) {
  if (sent.has(id)) return true;
  try { return localStorage.getItem(keyFor(id)) === 'sent'; } catch { return false; }
}
function product(value = 119.90) {
  return { currency: 'BRL', value, content_type: 'product',
    contents: [{ content_id: PRODUCT_ID, content_name: PRODUCT_NAME, quantity: 1, price: value }] };
}
function flushPurchases() {
  if (!loaded) return;
  for (const [id, amount] of pendingPurchases) {
    if (!alreadySent(id)) {
      window.ttq.track('Purchase', product(amount / 100), { event_id: `mareazul_purchase_${id}` });
      sent.add(id);
      try { localStorage.setItem(keyFor(id), 'sent'); } catch { /* Browser storage can be unavailable. */ }
    }
    pendingPurchases.delete(id);
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
  if (!active || order?.status !== 'paid' || !/^[a-f0-9-]{36}$/i.test(order.id || '') ||
      !Number.isSafeInteger(order.amount) || order.amount <= 0 || alreadySent(order.id)) return;
  pendingPurchases.set(order.id, order.amount);
  try { flushPurchases(); } catch { /* Payment confirmation remains independent of analytics. */ }
}
