const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const ID = '11111111-1111-4111-8111-111111111111';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] }); });
after(async () => browser.close());
async function setup(t, { status = 'paid', blocked = false, hostname = 'mare-azul.pages.dev' } = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const sdkRequests = [];
  await context.addInitScript(({ id }) => {
    sessionStorage.setItem('mareazul.ironpayOrder', JSON.stringify({ id, accessToken: 'a'.repeat(64) }));
  }, { id: ID });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'analytics.tiktok.com') {
      sdkRequests.push(url.href);
      if (blocked) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: `window.pixelEvents=Array.from(window.ttq);window.ttq.track=(...args)=>window.pixelEvents.push(['track',...args]);` });
    }
    if (url.hostname !== hostname) return route.abort();
    if (url.pathname.startsWith('/api/orders/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: ID, status, amount: 11990, pixCode: 'FIXTURE_NOT_PAYABLE', expiresAt: Date.now() + 86400000 }) });
    const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '') + (url.pathname.endsWith('/') ? 'index.html' : ''));
    return fs.existsSync(file) ? route.fulfill({ contentType: file.endsWith('.html') ? 'text/html' : 'application/octet-stream', body: fs.readFileSync(file) }) : route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  return { page, sdkRequests, origin: 'https://' + hostname };
}
test('production landing and checkout send the correct pixel and funnel events', async t => {
  const h = await setup(t);
  for (const [pathname, event] of [['/', 'ViewContent'], ['/checkout/', 'InitiateCheckout']]) {
    await h.page.goto(h.origin + pathname);
    await h.page.waitForFunction(() => window.pixelEvents);
    const events = await h.page.evaluate(() => window.pixelEvents);
    assert.equal(events.filter(e => e[0] === 'page').length, 1);
    const tracked = events.filter(e => e[0] === 'track');
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0][1], event);
    assert.equal(tracked[0][2].currency, 'BRL');
    assert.equal(tracked[0][2].value, 119.9);
  }
  assert.equal(h.sdkRequests.length, 2);
  assert.ok(h.sdkRequests.every(url => new URL(url).searchParams.get('sdkid') === 'DA5U5MRC77U8NT7JF3A0'));
});
test('authenticated paid receipt sends Purchase once, uses server amount, and excludes customer data', async t => {
  const h = await setup(t);
  await h.page.goto(h.origin + '/obrigado/?status=paid&value=1');
  await h.page.waitForFunction(() => window.pixelEvents?.some(e => e[1] === 'Purchase'));
  const events = await h.page.evaluate(() => window.pixelEvents);
  const purchase = events.find(e => e[1] === 'Purchase');
  assert.equal(purchase[2].value, 119.9);
  assert.equal(purchase[3].event_id, 'mareazul_purchase_' + ID);
  assert.doesNotMatch(JSON.stringify(purchase), /accessToken|email|document|phone|receipt/);
  await h.page.reload();
  await h.page.waitForFunction(() => document.body.dataset.paymentState === 'paid' && window.pixelEvents);
  assert.equal(await h.page.evaluate(() => window.pixelEvents.some(e => e[1] === 'Purchase')), false);
});
test('pending Pix and forged paid URL never emit Purchase', async t => {
  const h = await setup(t, { status: 'pending' });
  await h.page.goto(h.origin + '/obrigado/?status=paid');
  await h.page.waitForURL('**/pagamento/');
  await h.page.waitForFunction(() => window.pixelEvents);
  assert.equal(await h.page.evaluate(() => window.pixelEvents.some(e => e[1] === 'Purchase')), false);
  assert.equal(await h.page.evaluate(() => Object.keys(localStorage).some(k => k.includes('.purchase.'))), false);
});
test('blocked TikTok cannot break payment confirmation or mark purchase as sent', async t => {
  const h = await setup(t, { blocked: true });
  await h.page.goto(h.origin + '/obrigado/');
  await h.page.waitForFunction(() => document.body.dataset.paymentState === 'paid');
  assert.equal(await h.page.evaluate(() => Object.keys(localStorage).some(k => k.includes('.purchase.'))), false);
});
test('preview deployments never load production pixel', async t => {
  const h = await setup(t, { hostname: 'preview.mare-azul.pages.dev' });
  await h.page.goto(h.origin + '/obrigado/');
  await h.page.waitForFunction(() => document.body.dataset.paymentState === 'paid');
  assert.equal(h.sdkRequests.length, 0);
});
