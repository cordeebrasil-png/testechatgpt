import {createOrder,json} from '../../_lib/orders.js';
export async function onRequestPost({request,env}) {
 try{return await createOrder(request,env);}catch{return json({error:'Não foi possível preparar o pagamento. Tente consultar a mesma tentativa novamente.'},503);}
}
