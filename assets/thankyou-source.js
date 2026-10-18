import { INTENT_KEY, readSession, readJson, validOrder, diagnostic } from './order-session.js';
import { initTikTok, trackPaidPurchase } from './tiktok-source.js';
initTikTok();
const session = readSession();
const title = document.getElementById('customerGreeting');
const message = document.getElementById('customerMessage');
const retry = document.getElementById('receiptRetry');
let busy = false;
async function verify() {
  if (busy) return;
  if (!session) {
    title.textContent = 'Pedido não encontrado nesta sessão';
    message.textContent = 'Abra o pagamento no navegador em que iniciou a compra.';
    diagnostic({ code: 'SESSION_MISSING' }); return;
  }
  busy = true; retry.hidden = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/api/orders/' + encodeURIComponent(session.id), {
      headers: { Authorization: 'Bearer ' + session.accessToken }, cache: 'no-store', signal: controller.signal
    });
    const data = await readJson(response);
    diagnostic({ code: data.code, httpStatus: response.status, orderStatus: data.status });
    if (!response.ok || !validOrder(data, session.id)) throw new Error('RECEIPT_UNAVAILABLE');
    if (data.status !== 'paid') { location.replace('../pagamento/'); return; }
    trackPaidPurchase(data);
    document.body.dataset.paymentState = 'paid';
    title.textContent = 'Obrigado pela sua compra!';
    message.textContent = 'Seu pagamento foi confirmado.';
    if (data.receipt) personalizeOrder(data.receipt);
    if (readSession(INTENT_KEY)?.id === session.id) sessionStorage.removeItem(INTENT_KEY);
  } catch {
    title.textContent = 'Não foi possível consultar o pedido';
    message.textContent = 'Tente consultar novamente para verificar a confirmação do pagamento.';
    retry.hidden = false;
  } finally { clearTimeout(timeout); busy = false; }
}
retry.addEventListener('click', verify);
verify();
