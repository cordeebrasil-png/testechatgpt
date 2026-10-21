// Update shared/shipping.js
export const PLANS = Object.freeze({
  bronze: Object.freeze({ id: 'bronze', name: 'Caixa Surpresa Bronze (1 kg)', price: 4970, product_hash: 'op1ca40s1e', offer_hash: 'ic0d92du1c' }),
  prata: Object.freeze({ id: 'prata', name: 'Caixa Surpresa Prata (3 kg)', price: 7990, product_hash: 'twibnzsrpv', offer_hash: 'ijgamlldba' }),
  ouro: Object.freeze({ id: 'ouro', name: 'Caixa Surpresa Ouro (5 kg)', price: 9990, product_hash: '46kwckwion', offer_hash: 'oexp241tjh' })
});

export const BASE_AMOUNT = 7990;

export const SHIPPING = Object.freeze([
 Object.freeze({id:'free',name:'Frete Grátis',description:'4 a 7 dias úteis',price:0,icon:'gift'}),
 Object.freeze({id:'jadlog',name:'JadLog',description:'3 a 5 dias úteis',price:990,icon:'truck'}),
 Object.freeze({id:'pickup',name:'Retirada no Shopping Iguatemi',description:'Ribeirão Preto · retire no mesmo dia',price:0,icon:'pin'}),
 Object.freeze({id:'express',name:'Full 24hrs',description:'Entrega em 24 horas ⚡',price:1990,icon:'bolt'}),
]);

export const UPGRADES = Object.freeze({
 premium: Object.freeze({id:'premium',name:'Upgrade Premium',description:'Produto premium garantido na caixa',amount:1990}),
 dobro: Object.freeze({id:'dobro',name:'Caixa em Dobro',description:'Recebe o dobro de produtos na caixa',amount:2590}),
 none: Object.freeze({id:'none',name:'Sem upgrade',description:'Não quero nenhum upgrade',amount:0})
});

export function quoteShipping(selection = 'free', upgrade = 'none', plan = 'prata') {
 const option = SHIPPING.find(item => item.id === selection);
 if(!option){const error=new Error('INVALID_SHIPPING');error.fields={shipping:'Selecione uma opção de frete válida.'};throw error;}
 const planKey = Object.hasOwn(PLANS, plan) ? plan : 'prata';
 const p = PLANS[planKey];
 const up = Object.hasOwn(UPGRADES, upgrade) ? UPGRADES[upgrade] : UPGRADES.none;
 const subtotal = p.price + up.amount;
 return {
   version: 1,
   plan: { id: p.id, name: p.name, price: p.price },
   subtotal: subtotal,
   upgrade: { id: up.id, name: up.name, amount: up.amount },
   shipping: { id: option.id, name: option.name, amount: option.price },
   total: subtotal + option.price
 };
}
