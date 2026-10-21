import { readFile, writeFile } from 'node:fs/promises';

// Safe build step for local/CI environments
try {
  const { build } = await import('esbuild');
  for (const [name, htmlFile, source, bundle] of [
    ['tiktok', 'index.html', 'assets/tiktok-landing-source.js', null],
    ['payment', 'pagamento/index.html', 'assets/pix-live-source.js', 'assets/pix-live.js']
  ]) {
    try {
      const result = await build({ entryPoints: [source], bundle: true, write: false,
        platform: 'browser', format: 'iife', target: 'es2020', minify: true, legalComments: 'inline' });
      const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
      const html = await readFile(htmlFile, 'utf8');
      const start = `<!-- generated:${name}:start -->`;
      const end = `<!-- generated:${name}:end -->`;
      const from = html.indexOf(start), to = html.indexOf(end);
      if (from >= 0 && to > from) {
        await writeFile(htmlFile, html.slice(0, from) + start + '\n<script>\n' + code + '\n</script>\n' + html.slice(to));
      }
      if (bundle) await writeFile(bundle, code);
    } catch (e) {
      console.warn(`Optional bundle note for ${name}:`, e.message);
    }
  }
} catch (e) {
  console.log('Skipping esbuild in static mode');
}
