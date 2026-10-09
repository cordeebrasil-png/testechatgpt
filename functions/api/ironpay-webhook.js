import {json,configured,UUID,signature,findOrder,refreshOrder} from '../_lib/orders.js';
export async function onRequestPost({request,env}) {
 if(!configured(env))return json({error:'Indisponível'},503);
 const url=new URL(request.url),id=url.searchParams.get('id')||'',key=url.searchParams.get('key');
 if(!UUID.test(id)||key!==await signature('webhook:'+id,env.IRONPAY_API_TOKEN))return json({error:'Inválido'},403);
 try{
  const row=await findOrder(env,id);if(!row?.provider_hash)return json({retry:true},503);
  // Webhook is only a notification. Its status/amount/body is never trusted as proof of payment.
  await refreshOrder(env,row);return json({received:true});
 }catch{return json({retry:true},503);}
}
