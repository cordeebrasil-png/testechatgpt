import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
for(const [name,page,source] of [['checkout','checkout','ironpay-checkout-source'],['payment','pagamento','pix-live-source'],['thankyou','obrigado','thankyou-source']]) {
  const {outputFiles}=await build({entryPoints:[`calcas/assets/${source}.js`],bundle:true,write:false,platform:'browser',format:'iife',target:'es2020',minify:true});
  const file=`calcas/${page}/index.html`,html=await readFile(file,'utf8');
  const start=`<!-- generated:${name}:start -->`,end=`<!-- generated:${name}:end -->`;
  const from=html.indexOf(start),to=html.indexOf(end);
  if(from<0||to<from)throw new Error('Missing generated region: '+file);
  await writeFile(file,html.slice(0,from)+start+'\n<script>\n'+outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'\n</script>\n'+html.slice(to));
}
