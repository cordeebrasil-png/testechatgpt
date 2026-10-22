import { PLANS, quoteShipping } from '../shared/shipping.js';

const PIXEL = 'DBCS5ORC77U29DFSUC6G';
const path = location.pathname;
const isAllowedHost = location.hostname === 'mare-azul.pages.dev' ||
  location.hostname === 'modallejeans.urlx.online' ||
  location.hostname === 'www.modallejeans.urlx.online';
const allowed = isAllowedHost && ['/', '/index.html', '/checkout/', '/obrigado/', '/calcas/', '/calcas/index.html', '/calcas/checkout/', '/calcas/pagamento/', '/calcas/obrigado/'].includes(path);
const pending = new Map();
const sent = new Set();
let ready = false;
const selectedPlan = () => {
  const key = new URLSearchParams(location.search).get('plano');
  return Object.hasOwn(PLANS, key) ? key : 'prata';
};
function product(plan, amount) {
  const p = PLANS[plan] || PLANS.prata;
  return { currency: 'BRL', value: amount / 100, content_type: 'product',
    contents: [{ content_id: p.product_hash, content_name: p.name, quantity: 1, price: p.price / 100 }] };
}
function currentProduct() {
  const pricing = quoteShipping(document.querySelector('[name="shipping"]:checked')?.value || 'free',
    document.querySelector('[name="upgrade"]:checked')?.value || 'none', selectedPlan());
  return product(selectedPlan(), pricing.total);
}
function flush() {
  if (!ready) return;
  for (const [key, event] of pending) {
    let exists = sent.has(key);
    try { exists ||= localStorage.getItem(key) === 'sent'; } catch {}
    if (!exists) {
      window.ttq.track(event.name, event.payload, { event_id: event.id });
      sent.add(key);
      try { localStorage.setItem(key, 'sent'); } catch {}
    }
    pending.delete(key);
  }
}
function orderEvent(name, order) {
  if (!allowed || !/^[a-f0-9-]{36}$/i.test(order?.id || '') || !Number.isSafeInteger(order.amount) || order.amount <= 0) return;
  if (name === 'Purchase' && (order.status !== 'pending' || !order.pixCode?.trim() || order.pixCode.includes('DEMONSTRACAO') || (order.expiresAt && Number(order.expiresAt) <= Date.now()))) return;
  if (name === 'PedidoPago' && (order.status !== 'paid' || order.verificationDelayed)) return;
  
  let payload;
  const plan = order.pricing?.plan?.id;
  if (plan && Object.hasOwn(PLANS, plan)) {
    payload = product(plan, order.amount);
  } else {
    payload = {
      currency: 'BRL',
      value: order.amount / 100,
      content_type: 'product',
      contents: [{
        content_id: 'calcas-modalle',
        content_name: 'Kit 2 Calças Jeans Modalle',
        quantity: 1,
        price: order.amount / 100
      }]
    };
  }
  
  const id = `boxes_${name}_${order.id}`;
  pending.set(`${PIXEL}.${id}`, { name, id, payload });
  flush();
}
async function verifyPaid() {
  let session;
  try {
    session = JSON.parse(sessionStorage.getItem('cordee.calcas.ironpayOrder') || sessionStorage.getItem('mareazul.ironpayOrder') || 'null');
  } catch { return; }
  if (!/^[a-f0-9-]{36}$/i.test(session?.id || '') || !/^[a-f0-9]{64}$/.test(session?.accessToken || '')) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch('/api/orders/' + encodeURIComponent(session.id), {
        headers: { Authorization: 'Bearer ' + session.accessToken }, cache: 'no-store', signal: AbortSignal.timeout(10000)
      });
      if (response.status === 401 || response.status === 404) return;
      if (response.ok) {
        const order = await response.json();
        if (order.id !== session.id) return;
        if (order.status === 'paid' && !order.verificationDelayed) {
          orderEvent('PedidoPago', order);
          return;
        }
        if (['canceled', 'refunded', 'rejected'].includes(order.status)) return;
      }
    } catch {}
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
if (allowed) {
  window.TiktokAnalyticsObject = 'ttq';
  const ttq = window.ttq = window.ttq || [];
  ttq.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];
  ttq.setAndDefer = (target, method) => { target[method] = function () { target.push([method, ...arguments]); }; };
  for (const method of ttq.methods) ttq.setAndDefer(ttq, method);
  ttq.instance = id => { const instance = ttq._i[id] || []; for (const method of ttq.methods) ttq.setAndDefer(instance, method); return instance; };
  ttq._i = ttq._i || {}; ttq._i[PIXEL] = []; ttq._i[PIXEL]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
  ttq._t = ttq._t || {}; ttq._t[PIXEL] = Date.now(); ttq._o = ttq._o || {}; ttq._o[PIXEL] = {};
  const script = document.createElement('script'); script.async = true;
  script.src = `${ttq._i[PIXEL]._u}?sdkid=${PIXEL}&lib=ttq`;
  script.onload = () => { ready = true; flush(); };
  document.head.appendChild(script);
  ttq.page();
  
  if (['/', '/index.html'].includes(path)) {
    ttq.track('ViewContent', { content_type: 'product', currency: 'BRL', contents: Object.values(PLANS).map(p => ({ content_id: p.product_hash, content_name: p.name, quantity: 1, price: p.price / 100 })) });
  }
  if (['/calcas/', '/calcas/index.html'].includes(path)) {
    ttq.track('ViewContent', { content_type: 'product', currency: 'BRL', value: 94.90, contents: [{ content_id: 'calcas-modalle', content_name: 'Kit 2 Calças Jeans Modalle', quantity: 1, price: 94.90 }] });
  }
  if (path === '/checkout/') {
    ttq.track('InitiateCheckout', product(selectedPlan(), PLANS[selectedPlan()].price));
    let addressSent = false;
    document.addEventListener('input', event => {
      if (!event.isTrusted || event.target.id !== 'cep' || addressSent || event.target.getClientRects().length === 0 || event.target.value.replace(/\D/g, '').length !== 8) return;
      addressSent = true;
      ttq.track('AddPaymentInfo', currentProduct());
    });
    window.addEventListener('boxes:pix-ready', event => { try { orderEvent('Purchase', event.detail); } catch {} });
  }
  if (path === '/calcas/checkout/') {
    ttq.track('InitiateCheckout', { currency: 'BRL', value: 94.90, content_type: 'product', contents: [{ content_id: 'calcas-modalle', content_name: 'Kit 2 Calças Jeans Modalle', quantity: 1, price: 94.90 }] });
    let addressSent = false;
    document.addEventListener('input', event => {
      if (!event.isTrusted || (event.target.id !== 'cep' && event.target.id !== 'street') || addressSent) return;
      if (event.target.id === 'cep' && event.target.value.replace(/\D/g, '').length !== 8) return;
      if (event.target.id === 'street' && !event.target.value.trim()) return;
      addressSent = true;
      ttq.track('AddPaymentInfo', { currency: 'BRL', value: 94.90, content_type: 'product', contents: [{ content_id: 'calcas-modalle', content_name: 'Kit 2 Calças Jeans Modalle', quantity: 1, price: 94.90 }] });
    });
    window.addEventListener('boxes:pix-ready', event => { try { orderEvent('Purchase', event.detail); } catch {} });
  }
  if (['/obrigado/', '/calcas/obrigado/'].includes(path)) void verifyPaid();
}
