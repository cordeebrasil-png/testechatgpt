export async function onRequestGet({params}) {
 const cep=String(params.cep||'');
 const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':status===200?'public, max-age=86400':'no-store'}});
 if(!/^\d{8}$/.test(cep))return json({error:'CEP inválido'},400);
 const sources=[{url:'https://brasilapi.com.br/api/cep/v1/'+cep,map:d=>({logradouro:d.street||'',bairro:d.neighborhood||'',localidade:d.city,uf:d.state})},{url:'https://viacep.com.br/ws/'+cep+'/json/',map:d=>d}];
 for(const source of sources){
  try{
   const r=await fetch(source.url,{signal:AbortSignal.timeout(6000)});
   if(!r.ok)continue;
   const d=source.map(await r.json());
   if(d.erro||!d.localidade||!d.uf)continue;
   return json({cep,logradouro:d.logradouro||'',bairro:d.bairro||'',localidade:d.localidade,uf:d.uf});
  }catch{}
 }
 return json({error:'Não foi possível consultar o CEP'},503);
}
