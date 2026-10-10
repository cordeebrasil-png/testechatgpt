import {authorize,refreshOrder,publicOrder,json,configured,reportFailure} from '../../_lib/orders.js';
export async function onRequestGet({request,env,params}) {
 if(!configured(env))return json({error:'Pagamento temporariamente indisponível.',code:'PAYMENT_CONFIGURATION_MISSING',retrySafe:false},503);
 try{
  let row=await authorize(request,env,params.id);if(!row)return json({error:'Pedido não encontrado nesta sessão.'},404);
  try{row=await refreshOrder(env,row);}catch(error){const failure=reportFailure(error,'refresh');return json({...publicOrder(row),verificationDelayed:true,...failure,retrySafe:false});}
  return json(publicOrder(row));
 }catch(error){const failure=reportFailure(error,'lookup');return json({error:'Não foi possível consultar o pagamento agora.',...failure,retrySafe:false},503);}
}
