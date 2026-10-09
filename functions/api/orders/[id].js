import {authorize,refreshOrder,publicOrder,json,configured} from '../../_lib/orders.js';
export async function onRequestGet({request,env,params}) {
 if(!configured(env))return json({error:'Pagamento temporariamente indisponível.'},503);
 try{
  let row=await authorize(request,env,params.id);if(!row)return json({error:'Pedido não encontrado nesta sessão.'},404);
  try{row=await refreshOrder(env,row);}catch{return json({...publicOrder(row),verificationDelayed:true});}
  return json(publicOrder(row));
 }catch{return json({error:'Não foi possível consultar o pagamento agora.'},503);}
}
