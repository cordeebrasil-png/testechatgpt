import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

// Keep one source per flow; inline bundles are generated, never patched by hand.
for (const [name, htmlFile, source, bundle] of [
  ['tiktok', 'index.html', 'assets/tiktok-landing-source.js', null],
  ['checkout', 'checkout/index.html', 'assets/ironpay-checkout-source.js', null],
  ['payment', 'pagamento/index.html', 'assets/pix-live-source.js', 'assets/pix-live.js'],
  ['thankyou', 'obrigado/index.html', 'assets/thankyou-source.js', null]
]) {
  const result = await build({ entryPoints: [source], bundle: true, write: false,
    platform: 'browser', format: 'iife', target: 'es2020', minify: true, legalComments: 'inline' });
  const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = await readFile(htmlFile, 'utf8');
  const start = `<!-- generated:${name}:start -->`;
  const end = `<!-- generated:${name}:end -->`;
  const from = html.indexOf(start), to = html.indexOf(end);
  if (from < 0 || to < from) throw new Error(`Missing generated region in ${htmlFile}`);
  await writeFile(htmlFile, html.slice(0, from) + start + '\n<script>\n' + code + '\n</script>\n' + html.slice(to));
  if (bundle) await writeFile(bundle, code);
}
