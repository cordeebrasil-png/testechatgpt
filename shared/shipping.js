// Public display catalogue. The server independently computes the payable amount from this file.
export const BASE_AMOUNT = 11990;
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
export function quoteShipping(selection = 'free', upgrade = 'none') {
 const option=SHIPPING.find(item=>item.id===selection);
 if(!option){const error=new Error('INVALID_SHIPPING');error.fields={shipping:'Selecione uma opção de frete válida.'};throw error;}
 const up = Object.hasOwn(UPGRADES, upgrade) ? UPGRADES[upgrade] : UPGRADES.none;
 const subtotal = BASE_AMOUNT + up.amount;
 return {version:1,subtotal:subtotal,upgrade:{id:up.id,name:up.name,amount:up.amount},shipping:{id:option.id,name:option.name,amount:option.price},total:subtotal+option.price};
}
