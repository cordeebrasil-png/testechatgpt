// Separate Cordee offer: never fall back to the boxes or the former Maré Azul product.
const PRODUCT_HASH = 'iexqbvgequ';
const OFFER_HASH = '1gcfvqrjeb';
const AMOUNT_CENTS = 9491;
export function calcasConfig(env = {}) {
  const amount = Number(env.CALCAS_AMOUNT_CENTS ?? AMOUNT_CENTS);
  const product = env.CALCAS_PRODUCT_HASH ?? PRODUCT_HASH;
  const offer = env.CALCAS_OFFER_HASH ?? OFFER_HASH;
  const valid = Number.isSafeInteger(amount) && amount > 0;
  const hash = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
  return { amount: valid ? amount : null, configured: valid && hash(product) && hash(offer) };
}
export function calcasOffer(env = {}) {
  const config = calcasConfig(env);
  if (!config.configured) throw new Error('CALCAS_PRODUCT_CONFIGURATION_MISSING');
  return { amount: config.amount, product_hash: env.CALCAS_PRODUCT_HASH ?? PRODUCT_HASH, offer_hash: env.CALCAS_OFFER_HASH ?? OFFER_HASH };
}
