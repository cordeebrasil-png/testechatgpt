import { buildPixRequest, ORDER_AMOUNT } from './ironpay.js';
const API = 'https://api.ironpayapp.com.br/api/public/v1';
export const DAY = 86400000;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const ACCESS = /^[a-f0-9]{64}$/;
export const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export function configured(env) { return Boolean(env.ORDERS_DB && env.IRONPAY_API_TOKEN && env.IRONPAY_OFFER_HASH && env.IRONPAY_PRODUCT_HASH); }
export async function sha(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join(''); }
export async function signature(value, secret) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function provider(env, path, payload) {
 const url = new URL(API + path); url.searchParams.set('api_token', env.IRONPAY_API_TOKEN);
 // Do not log this URL, request bodies or upstream errors: they can contain secrets/PII.
 let response;
 try { response = await fetch(url, {method:payload?'POST':'GET',headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(18000),redirect:'error'}); }
 catch { throw new Error('PROVIDER_UNAVAILABLE'); }
 if (!response.ok) { const error=new Error('PROVIDER_ERROR');error.definitive=[400,401,403,422].includes(response.status);throw error; }
 let raw;try { raw=await response.json(); } catch { throw new Error('PROVIDER_RESPONSE_INVALID'); }
 if(raw?.success===false)throw new Error('PROVIDER_RESPONSE_INVALID');
 return raw?.data && typeof raw.data==='object' && !Array.isArray(raw.data) ? raw.data : raw;
}
export function normalize(data, expectedHash) {
 if(!data || typeof data.hash!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.hash) || (expectedHash && data.hash!==expectedHash))throw new Error('PROVIDER_ID_MISMATCH');
 if(data.payment_method!=='pix' || data.amount!==ORDER_AMOUNT || (data.amount_total!=null && data.amount_total!==ORDER_AMOUNT))throw new Error('PROVIDER_AMOUNT_MISMATCH');
 const state=data.payment_status ?? data.status;
 if(!['pending','paid','canceled','refunded'].includes(state))throw new Error('PROVIDER_STATUS_INVALID');
 const code=data.pix?.pix_qr_code;
 let expiresAt=null;
 // Honor only unambiguous provider timestamps; never interpret a local timestamp as UTC.
 if(typeof data.expires_at==='string' && /(?:Z|[+-]\d{2}:?\d{2})$/.test(data.expires_at)) {
  const value=Date.parse(data.expires_at);if(Number.isFinite(value))expiresAt=value;
 }
 return {hash:data.hash,state,code:typeof code==='string'&&code.length>0&&code.length<=8192?code:null,expiresAt};
}
export function receipt(input, payload) {
 const c=payload.customer;
 return {name:c.name,email:c.email,street:c.street_name,number:c.number,extra:c.complement,district:c.neighborhood,city:c.city,state:c.state,cep:c.zip_code,color:['Azul','Preto','Verde','Vermelho'].includes(input.color)?input.color:'Azul'};
}
export function publicOrder(row) {
 return {id:row.id,status:row.state,amount:ORDER_AMOUNT,pixCode:['pending','paid'].includes(row.state)?row.pix_code:null,expiresAt:row.expires_at,createdAt:row.created_at,receipt:row.state==='paid'?JSON.parse(row.receipt_json):undefined};
}
export async function findOrder(env,id) { return env.ORDERS_DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first(); }
export async function authorize(request,env,id) {
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'') || '';
 if(!UUID.test(id)||!ACCESS.test(token))return null;
 const row=await findOrder(env,id);if(!row || row.access_hash!==await sha(token))return null;
 return row;
}
export async function refreshOrder(env,row,force=false) {
 if(!row.provider_hash || row.state==='refunded')return row;
 const now=Date.now();
 if(!force && now-row.last_checked<10000)return row;
 const claim=await env.ORDERS_DB.prepare('UPDATE orders SET last_checked = ? WHERE id = ? AND last_checked = ?').bind(now,row.id,row.last_checked).run();
 if(!claim.meta.changes)return await findOrder(env,row.id);
 const result=normalize(await provider(env,'/transactions/'+encodeURIComponent(row.provider_hash)),row.provider_hash);
 // Ignore a stale pending notification after an authoritative payment confirmation.
 const state=row.state==='paid' && ['pending','canceled'].includes(result.state)?'paid':result.state;
 await env.ORDERS_DB.prepare('UPDATE orders SET state = ?, pix_code = COALESCE(?,pix_code), expires_at = COALESCE(?,expires_at) WHERE id = ?').bind(state,result.code,result.expiresAt,row.id).run();
 return await findOrder(env,row.id);
}
export async function createOrder(request,env) {
 if(!configured(env))return json({error:'O pagamento ainda está sendo configurado. Tente novamente mais tarde.'},503);
 const origin=request.headers.get('Origin');if(origin!==new URL(request.url).origin)return json({error:'Solicitação inválida.'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Formato inválido.'},415);
 let input;try {const raw=await request.text();if(raw.length>16000)return json({error:'Solicitação muito grande.'},413);input=JSON.parse(raw);}catch{return json({error:'Dados inválidos.'},400);}
 if(!UUID.test(input?.id||'')||!ACCESS.test(input?.accessToken||''))return json({error:'Sessão inválida.'},400);
 let payload;try{payload=buildPixRequest(input,env);}catch(error){return json({error:error.fields?'Confira os dados do formulário.':'O pagamento ainda está sendo configurado.',fields:error.fields},error.fields?422:503);}
 const fingerprint=await signature(JSON.stringify(payload),env.IRONPAY_API_TOKEN),accessHash=await sha(input.accessToken);
 const now=Date.now();
 const insert=await env.ORDERS_DB.prepare('INSERT OR IGNORE INTO orders (id,access_hash,request_hash,state,created_at,expires_at,receipt_json) VALUES (?,?,?,?,?,?,?)').bind(input.id,accessHash,fingerprint,'creating',now,now+DAY,JSON.stringify(receipt(input,payload))).run();
 if(!insert.meta.changes){
  const existing=await findOrder(env,input.id);
  if(!existing || existing.access_hash!==accessHash)return json({error:'Sessão inválida.'},403);
  if(existing.request_hash!==fingerprint)return json({error:'Já existe uma tentativa de pagamento nesta sessão. Consulte o pagamento anterior antes de alterar o pedido.',code:'ORDER_EXISTS',id:existing.id},409);
  if(existing.state==='rejected')return json({error:'A cobrança anterior foi recusada. Confira seus dados e tente novamente.',retrySafe:true},422);
  return json(publicOrder(existing),existing.state==='creating'?202:200);
 }
 const callback=new URL('/api/ironpay-webhook',request.url);
 callback.searchParams.set('id',input.id);callback.searchParams.set('key',await signature('webhook:'+input.id,env.IRONPAY_API_TOKEN));payload.postback_url=callback.href;
 try{
  const raw=await provider(env,'/transactions',payload);
  // Save the hash before mapping remaining fields so unexpected formats can be reconciled safely.
  if(typeof raw?.hash==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(raw.hash))await env.ORDERS_DB.prepare('UPDATE orders SET provider_hash = ? WHERE id = ?').bind(raw.hash,input.id).run();
  const result=normalize(raw);
  await env.ORDERS_DB.prepare('UPDATE orders SET provider_hash = ?, state = ?, pix_code = ?, expires_at = ?, last_checked = ? WHERE id = ?').bind(result.hash,result.state,result.code,result.expiresAt??now+DAY,now,input.id).run();
  return json(publicOrder(await findOrder(env,input.id)),201);
 }catch(error){
  const state=error.definitive?'rejected':'uncertain';
  await env.ORDERS_DB.prepare('UPDATE orders SET state = ? WHERE id = ?').bind(state,input.id).run();
  return error.definitive?json({error:'A IronPay não autorizou a criação do Pix. Confira seus dados ou fale com o suporte.',retrySafe:true},422):json(publicOrder(await findOrder(env,input.id)),202);
 }
}
