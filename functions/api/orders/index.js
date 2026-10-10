import {createOrder,json,reportFailure} from '../../_lib/orders.js';
export async function onRequestPost({request,env}) {
 try{return await createOrder(request,env);}catch(error){const failure=reportFailure(error,'create');return json({error:'Não foi possível preparar o pagamento. Tente consultar a mesma tentativa novamente.',...failure,retrySafe:false},503);}
}
