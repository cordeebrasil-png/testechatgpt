// Server-only request builder. Never accept prices or product hashes from the browser.
import { calcasOffer } from './calcas.js';
import { CALCAS_NAME, calcasSelection, calcasPricing } from '../../shared/calcas.js';
import { PLANS, quoteShipping } from '../../shared/shipping.js';

export const IRONPAY_API_TOKEN_DEFAULT = '';
export const ORDER_AMOUNT = 11990;
const CHAIR_PRODUCT_HASH = 'jbkikbdjti';
const CHAIR_OFFER_HASH = '0ciksaxint';
export const CHAIR_NAME = 'Kit Dobrável Duo 3 em 1 — Cadeiras, Cooler e Guarda-Sol';
export const CHAIR_AMOUNT = 11990;

const digits = value => String(value ?? '').replace(/\D/g, '');
const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);

export function validCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const check = (sum * 10) % 11;
    if ((check === 10 ? 0 : check) !== Number(cpf[length])) return false;
  }
  return true;
}

export function buildPixRequest(input, env) {
  const pants = input?.store === 'calcas' ? calcasOffer(env) : null;
  const chairs = input?.store === 'cadeiras';
  const selection = pants ? calcasSelection(input.selection) : null;
  const planKey = (input?.plan || 'prata').toLowerCase();
  const plan = PLANS[planKey] || PLANS.prata;

  const isSedex = input?.shipping === 'sedex' || input?.shippingMethod === 'sedex' || Number(input?.shippingFee) === 1783;
  const shippingFee = isSedex ? 1783 : 0;

  const standardPricing = quoteShipping(input?.shipping, input?.upgrade, planKey);
  const pricing = pants
    ? calcasPricing(pants.amount, shippingFee)
    : chairs
      ? { ...standardPricing, plan: { id: 'cadeiras', name: CHAIR_NAME, price: CHAIR_AMOUNT }, subtotal: CHAIR_AMOUNT + standardPricing.upgrade.amount, total: CHAIR_AMOUNT + standardPricing.upgrade.amount + standardPricing.shipping.amount }
      : standardPricing;

  const c = input?.customer ?? {};
  const customer = {
    name: text(c.name),
    email: text(c.email, 254),
    phone_number: digits(c.phone_number),
    document: digits(c.document),
    street_name: text(c.street_name),
    number: text(c.number, 30),
    complement: text(c.complement),
    neighborhood: text(c.neighborhood),
    city: text(c.city),
    state: text(c.state, 2).toUpperCase(),
    zip_code: digits(c.zip_code)
  };

  const issues = {};
  if (customer.name.split(/\s+/).length < 2) issues.name = 'Informe nome e sobrenome.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) issues.email = 'Informe um e-mail válido.';
  if (!/^[1-9]\d9\d{8}$/.test(customer.phone_number)) issues.phone_number = 'Informe celular com DDD.';
  if (!validCpf(customer.document)) issues.document = 'Confira os dígitos do CPF.';
  if (!/^\d{8}$/.test(customer.zip_code)) issues.zip_code = 'Informe CEP com 8 dígitos.';
  if (!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(customer.state)) issues.state = 'Selecione um estado válido.';
  for (const key of ['street_name', 'number', 'neighborhood', 'city']) {
    if (!customer[key]) issues[key] = 'Preencha este campo.';
  }
  if (Object.keys(issues).length) {
    const error = new Error('INVALID_CUSTOMER');
    error.fields = issues;
    throw error;
  }

  const upgradeLabel = pricing.upgrade?.amount > 0 ? ` + ${pricing.upgrade.name}` : '';
  const shippingLabel = pricing.shipping?.id === 'free' ? '' : ` + ${pricing.shipping?.name || 'SEDEX'}`;

  const offerHash = chairs ? CHAIR_OFFER_HASH : pants?.offer_hash || plan.offer_hash || env.IRONPAY_OFFER_HASH;
  const productHash = chairs ? CHAIR_PRODUCT_HASH : pants?.product_hash || plan.product_hash || env.IRONPAY_PRODUCT_HASH;

  const payload = {
    amount: pricing.total,
    offer_hash: offerHash,
    payment_method: 'pix',
    installments: 1,
    customer,
    cart: [{
      product_hash: productHash,
      title: chairs ? `${CHAIR_NAME} — ${text(input.color || 'Azul', 24)}${upgradeLabel}${shippingLabel}` : pants ? `${CALCAS_NAME} — ${selection.colors.join(" + ")} — ${selection.size}${shippingLabel}` : `${plan.name}${upgradeLabel}${shippingLabel}`,
      cover: null,
      price: pricing.total,
      quantity: 1,
      operation_type: 1,
      tangible: true
    }],
    transaction_origin: 'api'
  };

  if (env.IRONPAY_POSTBACK_URL) {
    const url = new URL(env.IRONPAY_POSTBACK_URL);
    if (url.protocol !== 'https:') throw new Error('INVALID_POSTBACK_URL');
    payload.postback_url = url.href;
  }

  return payload;
}
