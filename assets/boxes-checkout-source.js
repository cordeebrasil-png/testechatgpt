import { initIronPayCheckout } from './ironpay-checkout-source.js';
// Address/payment contents were absent from SingleFile: reconstructed with original design tokens.
// Test layout uses the existing IronPay product and its server-fixed R$119.90 price.
const plans = {
  bronze: {name:'Bronze', amount:11990, image:'f27b4f275c81d505.png'},
  prata: {name:'Prata', amount:11990, image:'4533661a7b85490c.png'},
  ouro: {name:'Ouro', amount:11990, image:'e7067139f8507f7c.png'},
};
const key = new URLSearchParams(location.search).get('plano');
const plan = Object.hasOwn(plans, key) ? plans[key] : plans.prata;
const $ = id => document.getElementById(id);
const money = cents => (cents / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
$('sum-name').textContent = `Caixa Surpresa ${plan.name}`;
$('sum-img').src = `/assets/${plan.image}`;
$('sum-img').alt = `Caixa ${plan.name}`;
$('sum-price').textContent = $('sum-subtotal').textContent = money(plan.amount);
$('sum-total').textContent = money(plan.amount);
function field(id, label, placeholder, autocomplete, max = '') {
  return `<div class="form-group" id="fg-${id}"><label for="${id}">${label}</label><input id="${id}" type="text" placeholder="${placeholder}" autocomplete="${autocomplete}" ${max ? `maxlength="${max}"` : ''}><div class="field-error sf-hidden">Preencha ${label.toLowerCase()} corretamente.</div></div>`;
}
const shippingOptions = [
 {id:'free',name:'Frete Grátis',description:'4 a 7 dias úteis',price:0,icon:'gift'},
 {id:'jadlog',name:'JadLog',description:'3 a 5 dias úteis',price:990,icon:'truck'},
 {id:'pickup',name:'Retirada no Shopping Iguatemi',description:'Ribeirão Preto · retire no mesmo dia',price:0,icon:'pin'},
 {id:'express',name:'Full 24hrs',description:'Entrega em 24 horas ⚡',price:1990,icon:'bolt'},
];
const shippingIcons = {
 gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
 truck:'<path d="M1 4h13v13H1zM14 9h5l4 5v3h-9M18 9v5h5"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 bolt:'<path d="m13 2-10 12h8l-1 8L22 9h-9l1-7Z"/>',
};
$('body-entrega').innerHTML = field('cep','CEP','00000-000','postal-code',9)
 + field('street','Rua / Endereço','Rua, Avenida...','address-line1')
 + `<div class="form-row">${field('number','Número','123','off')}${field('extra','Complemento','Apto, Bloco...','address-line2')}</div>`
 + `<div class="form-row">${field('district','Bairro','Bairro','address-level3')}${field('city','Cidade','Cidade','address-level2')}</div>`
 + `<div class="form-group"><label for="state">Estado</label><select id="state" autocomplete="address-level1"><option value="">Selecione...</option>${'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(uf=>`<option value="${uf}">${uf}</option>`).join('')}</select><div class="field-error sf-hidden">Selecione um estado.</div></div>`
 + `<fieldset class="shipping-options"><legend>Escolha o frete:</legend>${shippingOptions.map((option,index)=>`<label class="shipping-choice"><input type="radio" name="shipping" value="${option.id}" ${index===0?'checked':''}><span class="shipping-icon ${option.icon}" aria-hidden="true"><svg viewBox="0 0 24 24">${shippingIcons[option.icon]}</svg></span><span class="shipping-copy"><strong>${option.name}</strong><small class="${option.id==='express'?'express-copy':''}">${option.description}</small></span><span class="shipping-price ${option.price===0?'free-price':''}">${option.price===0?'Grátis':money(option.price)}</span><span class="shipping-radio" aria-hidden="true"></span></label>`).join('')}</fieldset>`
 + '<button type="button" class="btn-continuar" id="continuar-entrega">Continuar para Pagamento <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></button>';
// Shipping selection is visual in this fixed-price test; never change the API amount.
for(const input of document.querySelectorAll('input[name="shipping"]')) input.addEventListener('change',()=>{
 const option=shippingOptions.find(item=>item.id===input.value);
 $('sum-frete-label').textContent=option.name;
 $('sum-frete').textContent=option.price?'Incluído no teste':'Grátis';
});
$('body-pagamento').innerHTML = '<div class="payment-option"><strong>Pix</strong><span>Pagamento à vista</span></div><p class="preview-note">Total deste teste: <strong>R$ 119,90</strong>.</p><button type="submit" class="btn-continuar" id="finish" disabled>GERAR PIX DE R$ 119,90</button>';
for (const input of document.querySelectorAll('.form-group input, .form-group select')) {
  input.previousElementSibling?.setAttribute('for', input.id);
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    input.parentElement.querySelector('.field-error')?.classList.add('sf-hidden');
  });
}
const digits = value => value.replace(/\D/g,'');
$('cpf').addEventListener('input', e => {
  const v=digits(e.target.value).slice(0,11);
  e.target.value=v.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/,'$1.$2.$3-$4');
});
$('phone').addEventListener('input', e => { e.target.value=e.target.value.replace(/[^\d+() -]/g,'').slice(0,22); });
$('cep').inputMode = 'numeric';
$('cep').addEventListener('input', e => {e.target.value=digits(e.target.value).slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');});

function validCPF(value) {
  const v=digits(value); if(v.length!==11 || /^(\d)\1+$/.test(v))return false;
  for(let size=9;size<=10;size++) { let sum=0;for(let i=0;i<size;i++)sum+=Number(v[i])*(size+1-i);const digit=(sum*10)%11; if((digit===10?0:digit)!==Number(v[size]))return false; }return true;
}
function validate(rules) {
  let first=null;
  for(const [id,valid] of rules) {
    const input=$(id), error=input.parentElement.querySelector('.field-error');
    input.setAttribute('aria-invalid',String(!valid));error?.classList.toggle('sf-hidden',valid);
    if(!valid&&!first)first=input;
  }
  first?.focus();return !first;
}
const validatePersonal = () => validate([
 ['name',$('name').value.trim().split(/\s+/).filter(Boolean).length>=2],
 ['email',/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim())],
 ['phone',/^[1-9]\d9\d{8}$/.test(phoneForAPI())],
 ['cpf',validCPF($('cpf').value)],
]);
const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const validateAddress=()=>validate([
 ['cep',digits($('cep').value).length===8],
 ...['street','number','district','city'].map(id=>[id,$(id).value.trim().length>0]),
 ['state',states.has($('state').value)],
]);
function openStep(name) {
 for(const id of ['dados','entrega','pagamento']) {
  const active=id===name; $('body-'+id).classList.toggle('sf-hidden',!active);$('body-'+id).classList.toggle('open',active);
  $('chev-'+id).classList.toggle('open',active);
  document.querySelector('#sec-'+id+' .section-header').setAttribute('aria-expanded',String(active));
 }
 $('sec-'+name).scrollIntoView({behavior:'smooth',block:'start'});
}
function go(name) {
 if(name!=='dados'&&!validatePersonal()){openStep('dados');return;}
 if(name==='pagamento'&&!validateAddress()){openStep('entrega');return;}
 if(name==='pagamento')$('sec-pagamento').classList.remove('section-locked');
 openStep(name);
}
document.querySelector('#body-dados .btn-continuar').addEventListener('click',()=>go('entrega'));
$('continuar-entrega').addEventListener('click',()=>go('pagamento'));
for(const name of ['dados','entrega','pagamento']) {
 const header=document.querySelector('#sec-'+name+' .section-header');
 header.setAttribute('role','button');header.tabIndex=0;header.setAttribute('aria-controls','body-'+name);header.setAttribute('aria-expanded',String(name==='dados'));
 header.addEventListener('click',()=>go(name));
 header.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(name);}});
}

function phoneForAPI() {
 const value=digits($('phone').value);
 return value.length===13&&value.startsWith('55')?value.slice(2):value;
}
function validateCheckout() {
 if (!validatePersonal()) { openStep('dados'); return false; }
 if (!validateAddress()) { openStep('entrega'); return false; }
 $('phone').value=phoneForAPI();
 return true;
}
// Address lookup preserves manual entry and ignores stale responses/user edits.
let cepSequence=0;
$('cep').addEventListener('input', async () => {
 const seq=++cepSequence, cep=digits($('cep').value);
 if(cep.length!==8)return;
 const original=Object.fromEntries(['street','district','city','state'].map(id=>[id,$(id).value]));
 try {
  const response=await fetch('/api/cep/'+cep,{signal:AbortSignal.timeout(14000)});
  if(!response.ok)return;
  const data=await response.json();if(seq!==cepSequence)return;
  const mapped={street:data.logradouro,district:data.bairro,city:data.localidade,state:data.uf};
  for(const [id,value] of Object.entries(mapped))if(typeof value==='string'&&$(id).value===original[id])$(id).value=value;
 }catch { /* Address remains editable. */ }
});
initIronPayCheckout(validateCheckout);
