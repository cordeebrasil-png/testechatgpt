import QRCode from 'qrcode';
import { initTikTok, trackGeneratedPix } from './tiktok-source.js';
initTikTok();
import { SESSION_KEY, INTENT_KEY, readSession, readJson, validOrder, diagnostic } from './order-session.js';

const session = readSession();
const $ = id => document.getElementById(id);
const DISPLAY_WINDOW = 30 * 60 * 1000;
let busy = false, ended = false, nextPoll, clockTimer, renderedCode = '', latest = null;
let copyToastTimer;
window.__mareAzulPixLoaded = true;
const message = (title, detail) => {
  $('paymentStatus').textContent = title;
  $('paymentMessage').textContent = detail;
};
function fitPixCode() {
  const field = $('pixCode');
  if (!field.value) return;
  field.style.height = 'auto';
  const style = getComputedStyle(field);
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  field.style.height = Math.max(96, Math.ceil(field.scrollHeight + borders)) + 'px';
}
function clearPayment() {
  clearTimeout(copyToastTimer);
  $('copyToast').hidden = true;
  $('copyBackdrop').hidden = true;
  $('copyToast').textContent = '';
  clearInterval(clockTimer);
  $('pixCode').value = ''; $('copyPix').disabled = true;
  $('pixCode').style.height = '';
  $('copyPixIcon').disabled = true;
  delete $('pixCode').dataset.live;
  $('copyFeedback').textContent = '';
  document.querySelector('.deadline').hidden = true;
  document.querySelector('.code-trust').hidden = true;
  document.querySelector('.qr-section').hidden = true;
  document.querySelector('.qr-code').replaceChildren(); renderedCode = '';
  $('countdown').textContent = '--:--';
  $('expiredMessage').hidden = true;
}
function issue(title, detail, code, retry = true) {
  clearPayment();
  const terminal = ['PIX_EXPIRED', 'REJECTED', 'CANCELED', 'REFUNDED'].includes(code);
  message(terminal ? title : 'Aguardando pagamento', terminal ? 'Consulte as informações do seu pedido.' : 'Pague via Pix para concluir seu pedido.');
  $('pixCode').placeholder = terminal ? 'Este código não está disponível para pagamento.' : 'Preparando seu código Pix…';
}
function displayDeadline(data) {
  // Anchor to this order; reloads/polls and another order cannot reset/share the clock.
  if (Number.isFinite(data.createdAt) && data.createdAt > 0) return data.createdAt + DISPLAY_WINDOW;
  const key = 'mareazul.pixDisplayExpiresAt:' + session.id;
  let deadline = 0;
  try { deadline = Number(sessionStorage.getItem(key)); } catch {}
  if (!deadline) {
    deadline = Date.now() + DISPLAY_WINDOW;
    try { sessionStorage.setItem(key, String(deadline)); } catch {}
  }
  return deadline;
}
function startClock(data) {
  clearInterval(clockTimer);
  const deadline = displayDeadline(data);
  const providerDeadline = Number(data.expiresAt) || Infinity;
  const tick = () => {
    if (Date.now() >= providerDeadline) {
      issue('Prazo do Pix encerrado', 'O prazo informado para este código terminou. Se você já pagou, aguarde a confirmação.', 'PIX_EXPIRED');
      return;
    }
    const remaining = Math.max(0, Math.min(1800, Math.ceil((Math.min(deadline, providerDeadline) - Date.now()) / 1000)));
    $('countdown').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    $('timerProgress').style.width = `${remaining / 1800 * 100}%`;
    $('expiredMessage').hidden = remaining > 0;
    $('expiredMessage').textContent = 'O tempo sugerido terminou. O Pix pode continuar válido no banco; a confirmação do pedido continua sendo consultada.';
  };
  clockTimer = setInterval(tick, 1000); tick();
}
async function render(data) {
  if (data.status === 'uncertain' && session.creationCode && data.code === 'PAYMENT_CREATION_UNCERTAIN') {
    data = { ...data, code: session.creationCode };
  }
  latest = data;
  diagnostic({ code: data.code, httpStatus: 200, orderStatus: data.status, hasPix: Boolean(data.pixCode) });
  if (data.status === 'paid') {
    clearPayment(); ended = true; clearTimeout(nextPoll);
    message('Pagamento confirmado', 'Seu pagamento foi confirmado. Abrindo as informações do pedido…');
    try { if (readSession(INTENT_KEY)?.id === session.id) sessionStorage.removeItem(INTENT_KEY); } catch {}
    location.replace('../obrigado/?pedido=' + encodeURIComponent(data.id));
    return;
  }
  if (['rejected', 'canceled', 'refunded'].includes(data.status)) {
    ended = true;
    const labels = { rejected: 'Pix não gerado', canceled: 'Pagamento cancelado', refunded: 'Pagamento reembolsado' };
    issue(labels[data.status], 'Esta cobrança não está disponível para pagamento. Entre em contato com o suporte se precisar de ajuda.', data.code || data.status.toUpperCase(), false);
    try { if (readSession(INTENT_KEY)?.id === session.id) sessionStorage.removeItem(INTENT_KEY); } catch {}
    return;
  }
  const hasCode = typeof data.pixCode === 'string' && data.pixCode.trim().length > 0 && !data.pixCode.includes('DEMONSTRACAO');
  if (data.status !== 'pending' || !hasCode) {
    issue(data.status === 'uncertain' ? 'Geração do Pix não confirmada' : 'Preparando seu Pix',
      data.status === 'uncertain'
        ? 'Ainda não recebemos o código de pagamento. Consulte novamente ou fale com o suporte antes de iniciar outro pedido.'
        : 'O código ainda não foi disponibilizado. Estamos consultando o pagamento.', data.code || 'PIX_CODE_PENDING');
    return;
  }
  if (Number(data.expiresAt) > 0 && Date.now() >= Number(data.expiresAt)) {
    issue('Prazo do Pix encerrado', 'Se você já pagou, aguarde enquanto consultamos a confirmação.', 'PIX_EXPIRED'); return;
  }
  message('Aguardando pagamento', Number.isSafeInteger(data.amount)&&data.amount>0 ? 'Total: '+(data.amount/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+(data.pricing?.shipping?' · '+data.pricing.shipping.name:'') : 'Pague via Pix para concluir seu pedido.');
  $('pixCode').value = data.pixCode; $('pixCode').dataset.live = 'true'; $('copyPix').disabled = false;
  trackGeneratedPix(data);
  $('copyPixIcon').disabled = false;
  fitPixCode();
  document.querySelector('.code-trust').hidden = false;
  document.querySelector('.deadline').hidden = false;
  if (renderedCode !== data.pixCode) {
    const qr = document.querySelector('.qr-code');
    const canvas = document.createElement('canvas');
    try {
      await QRCode.toCanvas(canvas, data.pixCode, { width: 155, margin: 1, color: { dark: '#09205a', light: '#ffffff' } });
      qr.replaceChildren(canvas); renderedCode = data.pixCode;
      document.querySelector('.qr-section').hidden = false;
    } catch { document.querySelector('.qr-section').hidden = true; }
  }
  startClock(data);
}
async function poll() {
  if (!session || busy || ended) return;
  clearTimeout(nextPoll); busy = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let httpStatus = null;
  try {
    const response = await fetch('/api/orders/' + encodeURIComponent(session.id), {
      headers: { Authorization: 'Bearer ' + session.accessToken }, cache: 'no-store', signal: controller.signal
    });
    httpStatus = response.status;
    const data = await readJson(response);
    if (!response.ok) {
      const code = data.code || 'PAYMENT_LOOKUP_FAILED';
      issue(response.status === 404 ? 'Pedido não encontrado' : 'Não foi possível consultar o Pix',
        response.status === 404 ? 'Não encontramos o pedido desta sessão. Volte ao checkout para conferir sua compra.'
          : 'Tente consultar novamente. Se o problema continuar, informe a referência abaixo ao suporte.', code);
      diagnostic({ code, httpStatus });
      if (response.status === 404) ended = true;
      return;
    }
    if (!validOrder(data, session.id)) throw new Error('API_RESPONSE_INVALID');
    await render(data);
  } catch (error) {
    const code = error.message === 'API_RESPONSE_INVALID' ? error.message : 'PAYMENT_CONNECTION_FAILED';
    issue('Não foi possível consultar o Pix', 'Verifique sua conexão e tente consultar novamente.', code);
    diagnostic({ code, httpStatus });
  } finally {
    clearTimeout(timeout); busy = false;
    if (!ended) nextPoll = setTimeout(poll, 15000);
  }
}
async function copyPix() {
  if ($('copyPix').disabled || !$('pixCode').dataset.live || latest?.status !== 'pending') return;
  try {
    await navigator.clipboard.writeText($('pixCode').value);
    $('copyFeedback').textContent = '';
    clearTimeout(copyToastTimer);
    $('copyToast').hidden = false;
    $('copyBackdrop').hidden = false;
    $('copyToast').textContent = 'Código PIX copiado';
    copyToastTimer = setTimeout(() => {
      $('copyToast').hidden = true;
      $('copyBackdrop').hidden = true;
      $('copyToast').textContent = '';
    }, 1600);
  } catch {
    $('pixCode').focus(); $('pixCode').select(); $('copyFeedback').textContent = 'Selecione o código e copie manualmente.';
  }
}
$('copyPix').addEventListener('click', copyPix);
$('copyPixIcon').addEventListener('click', copyPix);
$('pixCode').addEventListener('click', copyPix);
window.addEventListener('resize', fitPixCode);
document.fonts?.ready.then(fitPixCode);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
clearPayment();
if (session) poll();
else {
  issue('Nenhum pedido nesta sessão', 'Volte ao checkout para iniciar seu pagamento.', 'SESSION_MISSING', false);
  diagnostic({ code: 'SESSION_MISSING' });
}
