'use strict';
// The snapshot contains the poster only. Add the original MP4 here when available.
const VIDEO_URL = '';
// Set the real campaign deadline in ISO 8601 format. Until then retain snapshot digits.
const OFFER_ENDS_AT = '';
const track = document.getElementById('track');
for (const [id, direction] of [['prev', -1], ['next', 1]]) {
  document.getElementById(id)?.addEventListener('click', () => {
    const slide = track.querySelector('.slide');
    const gap = parseFloat(getComputedStyle(track).gap) || 12;
    track.scrollBy({left: direction * (slide.getBoundingClientRect().width + gap), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  });
}
const video = document.getElementById('vid');
const play = document.getElementById('play');
if (VIDEO_URL) video.src = VIDEO_URL;
play?.addEventListener('click', async () => {
  if (!VIDEO_URL) {
    play.innerHTML = '<span class="video-message" role="status">Vídeo não incluído no arquivo de referência.</span>';
    return;
  }
  try { await video.play(); video.controls = true; play.hidden = true; play.style.display = 'none'; }
  catch { play.setAttribute('aria-label', 'Tentar reproduzir o vídeo novamente'); }
});
if (OFFER_ENDS_AT && Number.isFinite(Date.parse(OFFER_ENDS_AT))) {
  const update = () => {
    const left = Math.max(0, Math.floor((Date.parse(OFFER_ENDS_AT) - Date.now()) / 1000));
    for (const [id, value] of [['h', Math.floor(left / 3600)], ['m', Math.floor(left / 60) % 60], ['s', left % 60]]) document.getElementById(id).textContent = String(value).padStart(2, '0');
  };
  update(); setInterval(update, 1000);
}
// Propagate the visitor's current attribution, never the saved snapshot's IDs.
const incoming = new URLSearchParams(location.search);
for (const link of document.querySelectorAll('a[href*="/checkout/"]')) {
  const url = new URL(link.href);
  for (const [key, value] of incoming) if (key.startsWith('utm_') || ['ttclid', 'sck'].includes(key)) url.searchParams.set(key, value);
  link.href = url.pathname + url.search;
}
