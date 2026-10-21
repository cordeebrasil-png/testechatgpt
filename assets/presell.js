(() => {
  const proceed = document.getElementById('proceed');
  const loading = document.querySelector('.presell-loading');
  const ready = document.querySelector('.presell-ready');
  const progress = document.querySelector('.progress');
  const fill = document.querySelector('.progress-fill');

  // Garante que o botao comece desativado e sem link
  proceed.removeAttribute('href');
  proceed.classList.add('disabled');
  proceed.setAttribute('aria-disabled', 'true');

  let finished = false;
  let value = 0;
  const totalDuration = 4500; // 4.5 segundos de verificacao
  const intervalTime = 50;
  const step = 100 / (totalDuration / intervalTime);

  const tick = setInterval(() => {
    value = Math.min(100, value + step);
    fill.style.width = Math.round(value) + '%';
    progress.setAttribute('aria-valuenow', String(Math.round(value)));

    if (value >= 100) {
      clearInterval(tick);
      showReady();
    }
  }, intervalTime);

  function showReady() {
    if (finished) return;
    finished = true;
    clearInterval(tick);

    // Exibe a tela de confirmacao de estoque
    loading.hidden = true;
    ready.hidden = false;

    // Libera o botao e injeta o link somente apos o carregamento
    setTimeout(() => {
      proceed.href = '/' + location.search + location.hash;
      proceed.classList.remove('disabled');
      proceed.removeAttribute('aria-disabled');
    }, 600);
  }
})();