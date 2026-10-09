(() => {
  const button = document.getElementById('finish');
  if (!button) return;
  const value = id => document.getElementById(id)?.value?.trim() || '';
  const makeToken = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const preview = () => ({
    name: value('name'), email: value('email'), phone: value('phone'), document: value('cpf'),
    street: value('street'), number: value('number'), extra: value('extra'), district: value('district'),
    city: value('city'), state: value('state'), cep: value('cep'),
    color: new URLSearchParams(location.search).get('cor') || 'Azul', savedAt: Date.now()
  });
  const start = async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof validateCheckout === 'function' && !validateCheckout()) return;
    const id = crypto.randomUUID();
    const accessToken = makeToken();
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparando Pix…';
    const customer = {
      name: value('name'), email: value('email'), phone_number: value('phone'), document: value('cpf'),
      street_name: value('street'), number: value('number'), complement: value('extra'),
      neighborhood: value('district'), city: value('city'), state: value('state'), zip_code: value('cep')
    };
    try {
      sessionStorage.setItem('mareazul.orderPreview', JSON.stringify(preview()));
      const response = await fetch('../api/orders', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id, accessToken, customer, color: preview().color})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 201 && response.status !== 202) throw new Error(body.error || 'Não foi possível preparar o Pix.');
      sessionStorage.setItem('mareazul.ironpayOrder', JSON.stringify({id, accessToken}));
      sessionStorage.removeItem('mareazul.demoPixExpiresAt');
      location.href = '../pagamento/';
    } catch (error) {
      button.disabled = false;
      button.textContent = oldText;
      alert(error.message || 'Não foi possível preparar o Pix. Tente novamente.');
    }
  };
  button.addEventListener('click', start, true);
})();
