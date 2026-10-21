(() => {
 const proceed=document.getElementById('proceed');
 // Destination is always the local sales page; attribution cannot override it.
 proceed.href='/'+location.search+location.hash;
 const loading=document.querySelector('.presell-loading');
 const ready=document.querySelector('.presell-ready');
 const progress=document.querySelector('.progress');
 const fill=document.querySelector('.progress-fill');
 let finished=false, value=0;
 function showReady(){
  if(finished)return;finished=true;clearInterval(tick);clearTimeout(fallback);
  loading.hidden=true;ready.hidden=false;
 }
 const tick=setInterval(()=>{value=Math.min(90,value+15);fill.style.width=value+'%';progress.setAttribute('aria-valuenow',String(value));},200);
 const fallback=setTimeout(showReady,3500);
 // Only prepare local presentation assets. This is not an inventory check.
 Promise.allSettled([
  document.fonts?.ready,
  document.querySelector('.logo').decode(),
  new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:1500)),
 ]).then(showReady);
})();
