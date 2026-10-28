export const CALCAS_NAME = 'Kit 2 Calças Jeans UltraModel';
export const CALCAS_PREVIEW_AMOUNT = 9491; // Pix price shown in the supplied sales page.
export const CALCAS_COLORS = ['Preta', 'Azul escuro', 'Azul médio', 'Azul claro'];
export const CALCAS_SIZES = ['P (34-36)', 'M (38-40)', 'G (42-44)', 'GG (46-48)', 'XGG (50-52)', 'XXGG (54-56)'];
export function calcasSelection(input = {}) {
  const colors = input.colors || ['Azul escuro', 'Preta'];
  const size = input.size || CALCAS_SIZES[0];
  if (!Array.isArray(colors) || colors.length !== 2 || colors.some(c => !CALCAS_COLORS.includes(c)) || !CALCAS_SIZES.includes(size)) {
    const error = new Error('INVALID_VARIANT'); error.fields = { selection: 'Selecione as cores e o tamanho das calças.' }; throw error;
  }
  return { colors: [...colors], size };
}
export function calcasPricing(amount, shippingFee = 0) {
  const fee = Number(shippingFee) || 0;
  return { 
    version: 1, 
    plan: { id: 'calcas', name: CALCAS_NAME, price: amount }, 
    subtotal: amount,
    shipping: fee > 0 ? { id: 'sedex', name: 'SEDEX', amount: fee } : { id: 'free', name: 'Frete Grátis', amount: 0 }, 
    total: amount + fee 
  };
}
