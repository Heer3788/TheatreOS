import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [html, css, i18n, js, core, insights] = await Promise.all([
  readFile(resolve(root, 'app/index.html'), 'utf8'),
  readFile(resolve(root, 'app/styles.css'), 'utf8'),
  readFile(resolve(root, 'app/i18n.js'), 'utf8'),
  readFile(resolve(root, 'app/app.js'), 'utf8'),
  readFile(resolve(root, 'server/core.mjs'), 'utf8'),
  readFile(resolve(root, 'server/insights.mjs'), 'utf8')
]);
const sampleData = await readFile(resolve(root, 'data/analytics/export/sample-records.json'), 'utf8').then(JSON.parse).catch(cause => { if (cause.code === 'ENOENT') return null; throw cause; });
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
const assetSource = `import { createApp, createDemoState, MemoryStore } from './core.mjs';\nconst assets = { html: ${JSON.stringify(html)}, css: ${JSON.stringify(css)}, i18n: ${JSON.stringify(i18n)}, js: ${JSON.stringify(js)} };\nconst sampleData = ${JSON.stringify(sampleData)};\n`;
const workerEntry = `
const store = new MemoryStore(createDemoState());
let handler;
export default {
  fetch(request, env) {
    handler ||= createApp({ store, assets, env, loadSampleInsights: async () => sampleData });
    return handler(request);
  }
};
`;
await Promise.all([
  writeFile(resolve(root, 'dist/index.html'), html),
  writeFile(resolve(root, 'dist/styles.css'), css),
  writeFile(resolve(root, 'dist/i18n.js'), i18n),
  writeFile(resolve(root, 'dist/app.js'), js),
  writeFile(resolve(root, 'dist/server/index.js'), assetSource + workerEntry),
  writeFile(resolve(root, 'dist/server/core.mjs'), core),
  writeFile(resolve(root, 'dist/server/insights.mjs'), insights),
  writeFile(resolve(root, 'dist/.openai/hosting.json'), await readFile(resolve(root, '.openai/hosting.json')))
]);
console.log('Built TheatreOS Site Worker and browser assets');
