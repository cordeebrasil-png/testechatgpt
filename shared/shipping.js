// Public display catalogue. The server independently computes the payable amount from this file.
export const BASE_AMOUNT = 11990;
export const SHIPPING = Object.freeze([
 Object.freeze({id:'free',name:'Frete Grátis',description:'4 a 7 dias úteis',price:0,icon:'gift'}),
 Object.freeze({id:'jadlog',name:'JadLog',description:'3 a 5 dias úteis',price:990,icon:'truck'}),
 Object.freeze({id:'pickup',name:'Retirada no Shopping Iguatemi',description:'Ribeirão Preto · retire no mesmo dia',price:0,icon:'pin'}),
 Object.freeze({id:'express',name:'Full 24hrs',description:'Entrega em 24 horas ⚡',price:1990,icon:'bolt'}),
]);
export function quoteShipping(selection = 'free') {
 const option=SHIPPING.find(item=>item.id===selection);
 if(!option){const error=new Error('INVALID_SHIPPING');error.fields={shipping:'Selecione uma opção de frete válida.'};throw error;}
 return {version:1,subtotal:BASE_AMOUNT,shipping:{id:option.id,name:option.name,amount:option.price},total:BASE_AMOUNT+option.price};
}
