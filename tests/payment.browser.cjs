const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://checkout.test';
const SESSION = { id: '11111111-1111-4111-8111-111111111111', accessToken: 'a'.repeat(64) };
const OTHER_SESSION = { id: '22222222-2222-4222-8222-222222222222', accessToken: 'b'.repeat(64) };
// This deliberately nonpayable fixture is used only by intercepted browser responses.
const PIX = '00020126580014BR.GOV.BCB.PIX0136fixture-only-not-a-payment-key5204000053039865406119.905802BR5912TEST FIXTURE6009SAO PAULO62070503***6304ABCD';
const ADDRESS = { cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };
let browser;

before(async () => {
  browser = await chromium.launch({
    ...(fs.existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}),
    headless: true,
    args: ['--no-sandbox'],
  });
});
after(async () => { await browser?.close(); });

function pending(id = SESSION.id) {
  return { id, status: 'pending', amount: 11990, pixCode: PIX, expiresAt: Date.now() + 86400000 };
}
async function json(route, body, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function harness(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const state = { gets: 0, posts: [], pageErrors: [], blocked: [] };
  await context.addInitScript(({ session }) => {
    if (session && !sessionStorage.getItem('mareazul.ironpayOrder')) {
      sessionStorage.setItem('mareazul.ironpayOrder', JSON.stringify(session));
    }
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => window.__copied.push(value) } });
    const originalFetch = window.fetch.bind(window);
    window.__orderFetches = { active: 0, maxActive: 0 };
    window.fetch = (...args) => {
      const isOrder = String(args[0]).includes('/api/orders/');
      if (isOrder) {
        window.__orderFetches.active++;
        window.__orderFetches.maxActive = Math.max(window.__orderFetches.maxActive, window.__orderFetches.active);
      }
      return originalFetch(...args).finally(() => { if (isOrder) window.__orderFetches.active--; });
    };
  }, { session: options.session === false ? null : options.session || SESSION });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    // Every request is intercepted. Never forward any request to a real provider.
    if (url.origin !== ORIGIN) {
      state.blocked.push(request.url());
      return route.abort();
    }
    if (url.pathname.startsWith('/api/cep/')) return json(route, ADDRESS);
    if (url.pathname === '/api/orders' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.posts.push(body);
      if (options.postOrder) return options.postOrder(route, body, state);
      return json(route, pending(body.id), 201);
    }
    if (url.pathname.startsWith('/api/orders/') && request.method() === 'GET') {
      state.gets++;
      if (options.getOrder) return options.getOrder(route, state);
      return json(route, pending(url.pathname.split('/').pop()));
    }
    if (url.pathname === '/obrigado/' && !options.realThankyou) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Obrigado — destino simulado</h1>' });
    }
    if (request.method() !== 'GET') return route.abort();
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') + (url.pathname.endsWith('/') ? 'index.html' : '');
    const filename = path.resolve(ROOT, relative);
    if (!filename.startsWith(ROOT + path.sep) || !fs.existsSync(filename)) return route.fulfill({ status: 404, body: '' });
    const contentType = filename.endsWith('.html') ? 'text/html' : filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType, body: fs.readFileSync(filename) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => state.pageErrors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  page.setDefaultTimeout(5000);
  if (options.clock) await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  return { page, state, context };
}

async function openPayment(h) {
  await h.page.goto(`${ORIGIN}/pagamento/`);
  await h.page.waitForTimeout(100);
}
async function paymentState(page) {
  return page.evaluate(() => ({
    code: document.getElementById('pixCode')?.value,
    disabled: document.getElementById('copyPix')?.disabled,
    status: document.getElementById('paymentStatus')?.textContent,
    message: document.getElementById('paymentMessage')?.textContent,
    deadlineVisible: Boolean(document.querySelector('.deadline')?.getClientRects().length),
    canvasCount: document.querySelectorAll('.qr-code canvas').length,
    text: document.body.innerText,
    countdown: document.getElementById('countdown')?.textContent,
  }));
}
async function expectUnavailable(h) {
  const result = await paymentState(h.page);
  assert.equal(result.code, '', 'Unavailable payments must not expose a fallback Pix');
  assert.equal(result.disabled, true, 'Copy remains disabled without a provider code');
  assert.equal(result.canvasCount, 0);
  assert.equal(result.deadlineVisible, false, 'No countdown without an issued Pix');
  assert.doesNotMatch(result.text, /DEMONSTRACAO|Demonstração visual|Código de demonstração/i);
  assert.match(`${result.status} ${result.message}`, /aguarde|não|confer|verific|indispon|tente|suporte|prepar|localiz|sessão|pedido|cancel|reembols/i);
  assert.deepEqual(h.state.pageErrors, []);
}

test('payment without session stays nonpayable and does not query orders', async t => {
  const h = await harness(t, { session: false });
  await openPayment(h);
  await expectUnavailable(h);
  assert.equal(h.state.gets, 0);
});

for (const status of ['creating', 'uncertain']) {
  test(`${status} order never displays or copies demonstration Pix`, async t => {
    const h = await harness(t, { getOrder: route => json(route, { id: SESSION.id, status, pixCode: null }) });
    await openPayment(h);
    await expectUnavailable(h);
    assert.equal(h.state.gets, 1);
  });
}

for (const scenario of [
  { name: 'API 502', handler: route => json(route, { error: 'Serviço temporariamente indisponível', code: 'PAYMENT_PROVIDER_UNAVAILABLE' }, 502) },
  { name: 'HTTP 200 with HTML instead of JSON', handler: route => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Site fallback</h1>' }) },
]) {
  test(`${scenario.name} produces an honest, nonpayable error state`, async t => {
    const h = await harness(t, { getOrder: scenario.handler });
    await openPayment(h);
    await expectUnavailable(h);
    assert.equal(h.state.gets, 1);
  });
}

test('pending order displays only API-provided Pix, draws QR and copies exact code', async t => {
  const h = await harness(t);
  await openPayment(h);
  await h.page.waitForFunction(code => document.getElementById('pixCode').value === code, PIX);
  const result = await paymentState(h.page);
  assert.equal(result.disabled, false);
  assert.equal(result.canvasCount, 1);
  assert.equal(result.deadlineVisible, true);
  assert.doesNotMatch(result.text, /demonstração|ainda não foram gerados|prazo deste pix terminou/i);
  await h.page.click('#copyPix');
  assert.deepEqual(await h.page.evaluate(() => window.__copied), [PIX]);
  assert.equal(await h.page.locator('#copyFeedback').textContent(), '');
  await h.page.click('#copyPixIcon');
  assert.deepEqual(await h.page.evaluate(() => window.__copied), [PIX, PIX]);
  await h.page.focus('#copyPixIcon');
  await h.page.keyboard.press('Enter');
  assert.deepEqual(await h.page.evaluate(() => window.__copied), [PIX, PIX, PIX]);
  await h.page.click('#pixCode');
  assert.deepEqual(await h.page.evaluate(() => window.__copied), [PIX, PIX, PIX, PIX]);
  assert.equal(await h.page.locator('#copyLabel').textContent(), 'Copiar código Pix');
  assert.equal(await h.page.locator('#copyToast').textContent(), 'Código PIX copiado');
  const checkStyle = await h.page.locator('#copyToast').evaluate(el => ({
    position: getComputedStyle(el, '::before').backgroundPosition,
    image: getComputedStyle(el, '::before').backgroundImage,
    detachedCheck: getComputedStyle(el, '::after').content
  }));
  assert.ok(checkStyle.position.startsWith('50% 50%'));
  assert.match(checkStyle.image, /data:image\/svg\+xml/);
  assert.equal(checkStyle.detachedCheck, 'none');
  assert.equal(await h.page.locator('#copyToast').isVisible(), true);
  assert.equal(await h.page.locator('#copyBackdrop').isVisible(), true);
  assert.equal(await h.page.locator('#copyFeedback').textContent(), '');
  assert.deepEqual(h.state.pageErrors, []);
});

test('paid response redirects to thank-you even when provider code is absent', async t => {
  const h = await harness(t, { getOrder: route => json(route, { id: SESSION.id, status: 'paid', pixCode: null, receipt: { name: 'Pessoa Teste' } }) });
  await openPayment(h);
  await h.page.waitForURL('**/obrigado/**');
  assert.equal(new URL(h.page.url()).searchParams.get('pedido'), SESSION.id);
  assert.deepEqual(h.state.pageErrors, []);
});

test('copy toast disappears automatically and repeated copies restart its duration', async t => {
  const h = await harness(t, { clock: true });
  await openPayment(h);
  await h.page.click('#copyPix');
  assert.equal(await h.page.locator('#copyToast').isVisible(), true);
  await h.page.clock.fastForward(1000);
  await h.page.click('#pixCode');
  await h.page.clock.fastForward(1000);
  assert.equal(await h.page.locator('#copyToast').isVisible(), true);
  await h.page.clock.fastForward(800);
  assert.equal(await h.page.locator('#copyToast').isVisible(), false);
  assert.equal(await h.page.locator('#copyBackdrop').isVisible(), false);
  await h.page.click('#copyPixIcon');
  assert.equal(await h.page.locator('#copyBackdrop').isVisible(), true);
  assert.equal(h.state.posts.length, 0);
  assert.equal(await h.page.locator('#copyLabel').textContent(), 'Copiar código Pix');
});

test('reference spacing remains separated without copy instruction or horizontal overflow', async t => {
  const h = await harness(t);
  await openPayment(h);
  for (const width of [320, 390, 480]) {
    await h.page.setViewportSize({ width, height: 1000 });
    const layout = await h.page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      return {
        trustGap: box('.code-trust').top - box('#copyPix').bottom,
        cardGap: box('.qr-section').top - box('section[aria-label="Pix copia e cola"]').bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
        text: document.body.innerText
      };
    });
    assert.ok(layout.trustGap >= 20);
    assert.ok(layout.cardGap >= 10);
    assert.equal(layout.overflow, false);
    assert.doesNotMatch(layout.text, /Abra o aplicativo do seu banco e escolha Pix copia e cola/);
  }
  if (process.env.PIX_LAYOUT_SCREENSHOT) await h.page.screenshot({ path: '/tmp/pix-reference-layout.png', fullPage: true });
});

test('long Pix code is fully visible at mobile widths and after resizing', async t => {
  const longCode = PIX.repeat(3);
  const h = await harness(t, { getOrder: route => json(route, { ...pending(), pixCode: longCode }) });
  await openPayment(h);
  for (const width of [390, 320, 480]) {
    await h.page.setViewportSize({ width, height: 1000 });
    await h.page.waitForFunction(() => {
      const field = document.getElementById('pixCode');
      return field.scrollHeight <= field.clientHeight;
    });
    const field = await h.page.locator('#pixCode').evaluate(el => ({ value: el.value, height: el.clientHeight }));
    assert.equal(field.value, longCode);
    assert.ok(field.height > 96);
  }
});

for (const status of ['canceled', 'refunded']) {
  test(`${status} clears a code and disables payment`, async t => {
    const h = await harness(t, { getOrder: route => json(route, { ...pending(), status }) });
    await openPayment(h);
    await expectUnavailable(h);
  });
}

test('suggested 30-minute window persists on reload, is per order, and never invents provider expiration', async t => {
  const h = await harness(t, { clock: true });
  await openPayment(h);
  await h.page.waitForFunction(code => document.getElementById('pixCode').value === code, PIX);
  assert.match((await paymentState(h.page)).countdown, /^(?:30:00|29:59)$/);
  await h.page.clock.fastForward(120000);
  await h.page.reload();
  await h.page.waitForFunction(code => document.getElementById('pixCode').value === code, PIX);
  assert.match((await paymentState(h.page)).countdown, /^(?:28:0[01]|27:59)$/);
  await h.page.evaluate(session => sessionStorage.setItem('mareazul.ironpayOrder', JSON.stringify(session)), OTHER_SESSION);
  await h.page.reload();
  await h.page.waitForFunction(code => document.getElementById('pixCode').value === code, PIX);
  assert.match((await paymentState(h.page)).countdown, /^(?:30:00|29:59)$/);
  await h.page.clock.fastForward(1801000);
  const result = await paymentState(h.page);
  assert.equal(result.countdown, '00:00');
  assert.doesNotMatch(result.text, /prazo deste pix terminou|pix expirou|prazo encerrado/i);
  assert.match(result.text, /sugerido|preferencial/i);
  assert.deepEqual(h.state.pageErrors, []);
});

test('slow status reads do not overlap polls or create duplicate QR canvases', async t => {
  const releases = [];
  const h = await harness(t, {
    clock: true,
    getOrder: async route => {
      await new Promise(resolve => releases.push(resolve));
      await json(route, pending()).catch(() => {});
    },
  });
  await openPayment(h);
  await h.page.clock.fastForward(45000);
  assert.ok((await h.page.evaluate(() => window.__orderFetches.maxActive)) <= 1, 'At most one status fetch at a time');
  for (const release of releases.splice(0)) release();
  await h.page.waitForTimeout(100);
  await h.page.clock.fastForward(16000);
  for (const release of releases.splice(0)) release();
  await h.page.waitForTimeout(100);
  assert.ok((await h.page.evaluate(() => window.__orderFetches.maxActive)) <= 1);
  assert.ok((await paymentState(h.page)).canvasCount <= 1);
});

async function fillCheckout(page) {
  await page.goto(`${ORIGIN}/checkout/?cor=Azul`);
  for (const [id, value] of Object.entries({ email: 'fixture@example.invalid', name: 'Pessoa Teste', phone: '11999999999', cpf: '52998224725', cep: '01001000' })) {
    await page.locator(`#${id}`).fill(value);
  }
  await page.waitForFunction(() => document.getElementById('street').value === 'Praça da Sé');
  await page.locator('#number').fill('123');
  await page.locator('#extra').fill('Teste local');
}

for (const trigger of ['click', 'Enter']) {
  test(`checkout ${trigger} creates exactly one order and carries its access session`, async t => {
    const h = await harness(t, { session: false });
    await fillCheckout(h.page);
    if (trigger === 'click') await h.page.click('#finish');
    else await h.page.locator('#extra').press('Enter');
    await h.page.waitForURL('**/pagamento/');
    assert.equal(h.state.posts.length, 1);
    assert.match(h.state.posts[0].id, /^[0-9a-f-]{36}$/i);
    assert.match(h.state.posts[0].accessToken, /^[0-9a-f]{64}$/i);
    const stored = await h.page.evaluate(() => JSON.parse(sessionStorage.getItem('mareazul.ironpayOrder')));
    assert.equal(stored.id, h.state.posts[0].id);
    assert.equal(stored.accessToken, h.state.posts[0].accessToken);
    assert.deepEqual(h.state.pageErrors, []);
  });
}

for (const scenario of [
  { name: '500 failure', reply: route => json(route, { error: 'Falha temporária' }, 500) },
  { name: '200 HTML fallback', reply: route => route.fulfill({ contentType: 'text/html', body: '<h1>Fallback</h1>' }) },
  { name: '201 missing order id', reply: route => json(route, { status: 'pending', pixCode: PIX }, 201) },
  { name: '201 mismatching order id', reply: route => json(route, { ...pending(), id: OTHER_SESSION.id }, 201) },
  { name: '201 unknown order status', reply: (route, body) => json(route, { id: body.id, status: 'unknown-fake-status' }, 201) },
]) {
  test(`checkout ${scenario.name} stays in checkout and permits recovery`, async t => {
    const h = await harness(t, { session: false, postOrder: scenario.reply });
    await fillCheckout(h.page);
    await h.page.click('#finish');
    await h.page.waitForFunction(() => !document.getElementById('finish')?.disabled);
    assert.equal(new URL(h.page.url()).pathname, '/checkout/');
    assert.equal(h.state.posts.length, 1);
    assert.deepEqual(h.state.pageErrors, []);
  });
}

test('repeated click and submit while create is in flight issue only one POST', async t => {
  let finishRequest;
  const h = await harness(t, {
    session: false,
    postOrder: async (route, body) => {
      await new Promise(resolve => { finishRequest = resolve; });
      return json(route, pending(body.id), 201);
    },
  });
  await fillCheckout(h.page);
  await h.page.click('#finish');
  await h.page.waitForTimeout(100);
  await h.page.evaluate(() => {
    document.getElementById('finish').click();
    document.getElementById('checkoutForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  assert.equal(h.state.posts.length, 1);
  finishRequest();
  await h.page.waitForURL('**/pagamento/');
  assert.equal(h.state.posts.length, 1);
  assert.deepEqual(h.state.pageErrors, []);
});

test('retry after lost create response reuses the same order id and access token', async t => {
  const h = await harness(t, {
    session: false,
    postOrder: (route, body, state) => state.posts.length === 1 ? route.abort('failed') : json(route, pending(body.id), 201),
  });
  await fillCheckout(h.page);
  await h.page.click('#finish');
  await h.page.waitForFunction(() => !document.getElementById('finish')?.disabled);
  assert.equal(new URL(h.page.url()).pathname, '/checkout/');
  await h.page.click('#finish');
  await h.page.waitForURL('**/pagamento/');
  assert.equal(h.state.posts.length, 2);
  assert.equal(h.state.posts[1].id, h.state.posts[0].id);
  assert.equal(h.state.posts[1].accessToken, h.state.posts[0].accessToken);
  assert.deepEqual(h.state.pageErrors, []);
});

test('countdown uses order creation time, and only the provider expiry disables an issued Pix', async t => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const h = await harness(t, { clock: true, getOrder: route => json(route, {
    ...pending(), createdAt: now - 600000, expiresAt: now + 60000
  }) });
  await openPayment(h);
  assert.match((await paymentState(h.page)).countdown, /^0[01]:[0-5][0-9]$/);
  await h.page.clock.fastForward(61000);
  await expectUnavailable(h);
  assert.match((await paymentState(h.page)).status, /Prazo do Pix encerrado/);
});

test('uncertain create cause stays in console diagnostics and is never displayed to customers', async t => {
  const h = await harness(t, {
    session: { ...SESSION, creationCode: 'PROVIDER_UNAVAILABLE' },
    getOrder: route => json(route, { id: SESSION.id, status: 'uncertain', pixCode: null, code: 'PAYMENT_CREATION_UNCERTAIN' })
  });
  await openPayment(h);
  await expectUnavailable(h);
  assert.doesNotMatch(await h.page.locator('body').innerText(), /PROVIDER_UNAVAILABLE|Referência|erro|suporte/i);
  assert.equal(await h.page.locator('#paymentReference').count(), 0);
  const diagnostic = await h.page.evaluate(() => JSON.stringify(window.__mareAzulPixDiagnostics));
  assert.match(diagnostic, /PROVIDER_UNAVAILABLE/);
  assert.doesNotMatch(diagnostic, /accessToken/);
  assert.ok(!diagnostic.includes(SESSION.accessToken));
});

test('checkout never opens payment without a provider Pix code', async t => {
  const h = await harness(t, {
    session: false,
    postOrder: (route, body) => json(route, { id: body.id, status: 'uncertain', pixCode: null }, 202),
    getOrder: route => json(route, { id: new URL(route.request().url()).pathname.split('/').pop(), status: 'uncertain', pixCode: null })
  });
  await fillCheckout(h.page);
  await h.page.click('#finish');
  await h.page.waitForFunction(() => !document.getElementById('finish')?.disabled);
  assert.equal(new URL(h.page.url()).pathname, '/checkout/');
  assert.equal(h.state.posts.length, 1);
  assert.equal(h.state.gets, 1);
  assert.doesNotMatch(await h.page.locator('body').innerText(), /Referência|API_RESPONSE|PROVIDER_|PIX_CODE_PENDING/);
});

test('thank-you verifies paid receipt from API instead of trusting preview data', async t => {
  const h = await harness(t, { realThankyou: true, getOrder: route => json(route, {
    id: SESSION.id, status: 'paid', pixCode: null,
    receipt: { name: 'Ana Teste', email: 'fixture@example.invalid', color: 'Verde' }
  }) });
  await h.page.goto(`${ORIGIN}/obrigado/?pedido=${SESSION.id}`);
  await h.page.waitForFunction(() => document.body.dataset.paymentState === 'paid');
  assert.equal(await h.page.locator('#customerGreeting').innerText(), 'Obrigado, Ana!');
  assert.equal(await h.page.locator('#recipientEmail').innerText(), 'fixture@example.invalid');
  assert.doesNotMatch(await h.page.locator('body').innerText(), /demonstração|prévia/i);
  assert.deepEqual(h.state.pageErrors, []);
});

test('thank-you without session cannot claim payment confirmation', async t => {
  const h = await harness(t, { realThankyou: true, session: false });
  await h.page.goto(`${ORIGIN}/obrigado/`);
  assert.doesNotMatch(await h.page.locator('body').innerText(), /Pagamento confirmado|Total pago|preparação/i);
  assert.equal(h.state.gets, 0);
  assert.deepEqual(h.state.pageErrors, []);
});
