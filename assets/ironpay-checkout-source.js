import { SESSION_KEY, INTENT_KEY, readSession, readJson, validOrder, diagnostic } from './order-session.js';

const button = document.getElementById('finish');
const form = document.getElementById('checkoutForm');
const errorBox = document.getElementById('paymentError');
const value = id => document.getElementById(id)?.value?.trim() || '';
const originalContent = button.innerHTML;
let submitting = false;
window.__mareAzulIronpayLoaded = true;
button.disabled = false;
diagnostic({ code: 'READY' });

async function start(event) {
  event.preventDefault();
  if (submitting || !validateCheckout()) return;
  submitting = true;
  button.disabled = true;
  button.textContent = 'Preparando Pix…';
  errorBox.textContent = '';
  let httpStatus = null;
  try {
    const customer = {
      name: value('name'), email: value('email'), phone_number: value('phone'), document: value('cpf'),
      street_name: value('street'), number: value('number'), complement: value('extra'),
      neighborhood: value('district'), city: value('city'), state: value('state'), zip_code: value('cep')
    };
    const color = new URLSearchParams(location.search).get('cor') || 'Azul';
    const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({customer, color}))))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    let intent = readSession(INTENT_KEY);
    if (intent && intent.fingerprint !== fingerprint) {
      errorBox.textContent = 'Existe uma tentativa de pagamento em andamento. Consulte o pedido anterior antes de alterar os dados.';
      const link = document.createElement('a');
      link.href = '../pagamento/'; link.textContent = ' Consultar pagamento';
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: intent.id, accessToken: intent.accessToken }));
      errorBox.append(link);
      return;
    }
    if (!intent) {
      const accessToken = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      intent = { id: crypto.randomUUID(), accessToken, fingerprint };
      // Save before POST: retrying a dropped connection must reuse the same order ID.
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try { response = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ id: intent.id, accessToken: intent.accessToken, customer, color })
    }); } finally { clearTimeout(timeout); }
    httpStatus = response.status;
    const data = await readJson(response);
    if (!response.ok) {
      if (data.retrySafe || (response.status === 422 && data.fields)) sessionStorage.removeItem(INTENT_KEY);
      diagnostic({ code: data.code || 'CREATE_FAILED', httpStatus });
      const detail = data.fields ? Object.values(data.fields).join(' ') : data.error;
      errorBox.textContent = detail || 'Não foi possível gerar o Pix. Tente consultar novamente.';
      if (data.code) errorBox.append(document.createTextNode(' Referência: ' + data.code));
      return;
    }
    if (!validOrder(data, intent.id)) throw new Error('API_RESPONSE_INVALID');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: intent.id, accessToken: intent.accessToken,
      creationCode: typeof data.code === 'string' && /^[A-Z_]+$/.test(data.code) ? data.code : null,
      providerStatus: Number.isInteger(data.providerStatus) ? data.providerStatus : null }));
    diagnostic({ code: data.code, httpStatus, orderStatus: data.status, hasPix: Boolean(data.pixCode) });
    location.assign('../pagamento/');
  } catch (error) {
    const code = error.message === 'API_RESPONSE_INVALID' ? error.message : 'CREATE_CONNECTION_FAILED';
    diagnostic({ code, httpStatus });
    errorBox.textContent = code === 'API_RESPONSE_INVALID'
      ? 'O servidor não retornou uma resposta válida para o pagamento. Referência: API_RESPONSE_INVALID.'
      : 'Não foi possível confirmar a geração do Pix. Clique novamente para consultar a mesma tentativa.';
  } finally {
    submitting = false; button.disabled = false; button.innerHTML = originalContent;
  }
}
button.addEventListener('click', start);
form.addEventListener('submit', start);
