import { calcasSelection } from '../../shared/calcas.js';
import { SESSION_KEY, INTENT_KEY, readSession, readJson, validOrder, diagnostic } from './order-session.js';
const initTikTok = () => {}, trackAddressStarted = () => {};
initTikTok();
document.getElementById('street').addEventListener('input', event => {
  if (event.isTrusted && event.target.value.trim()) trackAddressStarted();
});

const button = document.getElementById('finish');
const form = document.getElementById('checkoutForm');
const value = id => document.getElementById(id)?.value?.trim() || '';
const originalContent = button.innerHTML;
let submitting = false;
let needsRetry = false;
window.__mareAzulIronpayLoaded = true;
button.disabled = true;
diagnostic({ code: 'READY' });

let configured = false;
const params = new URLSearchParams(location.search);
let selection;
try { selection = calcasSelection({ colors: [params.get('cor1') || 'Azul escuro', params.get('cor2') || 'Preta'], size: params.get('tamanho') || 'P (34-36)' }); }
catch { selection = calcasSelection(); }
if (!params.has('cor1') && !params.has('tamanho')) { try { selection = calcasSelection(JSON.parse(sessionStorage.getItem('cordee.calcas.selection') || '{}')); } catch {} }
try { sessionStorage.setItem('cordee.calcas.selection', JSON.stringify(selection)); } catch {}
document.getElementById('calcasSelection').textContent = selection.colors.join(' + ') + ' · ' + selection.size;
const pictures = {'Preta':'preta', 'Azul escuro':'azul-escuro', 'Azul médio':'azul-medio', 'Azul claro':'azul-claro'};
document.querySelector('.product>img').src='../assets/'+pictures[selection.colors[0]]+'.png';
fetch('/api/calcas-config', {cache:'no-store'}).then(async response => {
  if (!response.ok) throw new Error('CONFIG_UNAVAILABLE');
  const config = await response.json();
  if (!Number.isSafeInteger(config.amount) || config.amount <= 0) return;
  const money = value => (value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  for (const el of document.querySelectorAll('.price,.pix-option-price')) el.textContent=money(config.amount);
  document.querySelector('.saving strong').textContent=money(Math.max(0,26990-config.amount));
  configured=config.configured===true;
  button.disabled=!configured;
  if (!configured) button.textContent='Em breve';
}).catch(()=>{button.disabled=true;button.textContent='Em breve';});

function ready(data) {
  return data.status === 'paid' || (data.status === 'pending' && typeof data.pixCode === 'string' && data.pixCode.trim() && !data.pixCode.includes('DEMONSTRACAO'));
}
async function openPaymentWhenReady(data, intent) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: intent.id, accessToken: intent.accessToken,
    creationCode: typeof data.code === 'string' && /^[A-Z_]+$/.test(data.code) ? data.code : null }));
  diagnostic({ code: data.code, httpStatus: 200, orderStatus: data.status, hasPix: Boolean(data.pixCode) });
  if (!ready(data)) {
    // Reconcile this same order, never create another charge to replace an uncertain one.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/orders/' + encodeURIComponent(intent.id), {
        headers: { Authorization: 'Bearer ' + intent.accessToken }, cache: 'no-store', signal: controller.signal
      });
      const result = await readJson(response);
      diagnostic({ code: result.code || data.code, httpStatus: response.status, orderStatus: result.status, hasPix: Boolean(result.pixCode) });
      if (!response.ok || !validOrder(result, intent.id)) { needsRetry = true; return; }
      data = result;
    } finally { clearTimeout(timeout); }
  }
  if (ready(data)) location.assign('../pagamento/');
  else needsRetry = true;
}

async function start(event) {
  event.preventDefault();
  if (!configured || submitting || !validateCheckout()) return;
  submitting = true;
  needsRetry = false;
  button.disabled = true;
  button.textContent = 'Preparando Pix…';
  let httpStatus = null;
  try {
    const customer = {
      name: value('name'), email: value('email'), phone_number: value('phone'), document: value('cpf'),
      street_name: value('street'), number: value('number'), complement: value('extra'),
      neighborhood: value('district'), city: value('city'), state: value('state'), zip_code: value('cep')
    };
    const color = selection.colors.join(' + ');
    const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({customer, selection}))))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    let intent = readSession(INTENT_KEY);
    if (intent && intent.fingerprint !== fingerprint) {
      await openPaymentWhenReady({ status: 'uncertain' }, intent);
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
      body: JSON.stringify({ id: intent.id, accessToken: intent.accessToken, customer, store: 'calcas', selection })
    }); } finally { clearTimeout(timeout); }
    httpStatus = response.status;
    const data = await readJson(response);
    if (!response.ok) {
      if (data.retrySafe || (response.status === 422 && data.fields)) sessionStorage.removeItem(INTENT_KEY);
      diagnostic({ code: data.code || 'CREATE_FAILED', httpStatus });
      needsRetry = true;
      return;
    }
    if (!validOrder(data, intent.id)) throw new Error('API_RESPONSE_INVALID');
    await openPaymentWhenReady(data, intent);
  } catch (error) {
    const code = error.message === 'API_RESPONSE_INVALID' ? error.message : 'CREATE_CONNECTION_FAILED';
    diagnostic({ code, httpStatus });
    needsRetry = true;
  } finally {
    submitting = false; button.disabled = !configured;
    if (needsRetry) button.textContent = 'TENTAR NOVAMENTE';
    else button.innerHTML = originalContent;
  }
}
button.addEventListener('click', start);
form.addEventListener('submit', start);
