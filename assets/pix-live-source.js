import QRCode from 'qrcode';

const session = (() => {
  try { return JSON.parse(sessionStorage.getItem('mareazul.ironpayOrder') || 'null'); } catch { return null; }
})();
const $ = id => document.getElementById(id);
const auth = session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
const DISPLAY_WINDOW = 30 * 60 * 1000;
const DISPLAY_EXPIRY_KEY = 'mareazul.pixDisplayExpiresAt';
const setStatus = (text, error = false) => { const el = $('paymentStatus'); if (el) { el.innerHTML = text; el.classList.toggle('error', error); } };
const seconds = deadline => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

function render(data) {
  if (!data?.pixCode) return;
  $('pixCode').value = data.pixCode;
  $('pixCode').dataset.live = 'true';
  $('expiredMessage').hidden = data.status === 'paid';
  const qr = document.querySelector('.qr-demo');
  if (qr) { qr.replaceChildren(); const canvas = document.createElement('canvas'); qr.append(canvas); QRCode.toCanvas(canvas, data.pixCode, { width: 155, margin: 1, color: { dark: '#09205a', light: '#ffffff' } }); }
  let displayDeadline = 0;
  try { displayDeadline = Number(sessionStorage.getItem(DISPLAY_EXPIRY_KEY)) || 0; } catch {}
  if (!displayDeadline) {
    displayDeadline = Date.now() + DISPLAY_WINDOW;
    try { sessionStorage.setItem(DISPLAY_EXPIRY_KEY, String(displayDeadline)); } catch {}
  }
  const providerDeadline = Number(data.expiresAt) || displayDeadline;
  const deadline = Math.min(displayDeadline, providerDeadline);
  const tick = () => { const left = seconds(deadline); $('countdown').textContent = clock(left); $('timerProgress').style.width = `${Math.min(100, left / (24 * 60 * 60) * 100)}%`; if (!left) $('paymentCard').classList.add('expired'); };
  tick();
  clearInterval(window.mareAzulPixTimer);
  window.mareAzulPixTimer = setInterval(tick, 1000);
  if (data.status === 'paid') { setStatus('Pagamento confirmado'); setTimeout(() => { location.href = `../obrigado/?pedido=${encodeURIComponent(data.id)}`; }, 800); }
}

async function poll() {
  if (!session?.id || !session?.accessToken) return;
  try { const response = await fetch(`../api/orders/${encodeURIComponent(session.id)}`, { headers: auth, cache: 'no-store' }); if (!response.ok) return; render(await response.json()); } catch {}
}

if (session?.id && session?.accessToken) { poll(); setInterval(poll, 15000); }
const copy = $('copyPix');
copy?.addEventListener('click', async event => {
  if (!$('pixCode').dataset.live) return;
  event.preventDefault(); event.stopImmediatePropagation();
  try { await navigator.clipboard.writeText($('pixCode').value); $('copyLabel').textContent = 'Código copiado!'; $('copyFeedback').textContent = 'Código Pix copiado com segurança.'; }
  catch { $('pixCode').focus(); $('pixCode').select(); $('copyFeedback').textContent = 'Selecione o código e copie manualmente.'; }
}, true);
