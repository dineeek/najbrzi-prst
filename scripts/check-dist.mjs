import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '..', 'dist');
const manifest = JSON.parse(
  readFileSync(resolve(dist, 'manifest.json'), 'utf8')
);
const failures = [];

const loaderPath = resolve(dist, manifest.background.service_worker);
const loader = readFileSync(loaderPath, 'utf8');
const imported = loader.match(/import\s+['"](.+?)['"]/)?.[1];
if (!imported)
  failures.push(`service worker loader has no import: ${loaderPath}`);
else {
  const worker = readFileSync(resolve(dist, imported), 'utf8');
  if (!worker.includes('registerContentScripts'))
    failures.push(
      `service worker chunk ${imported} is not the background code`
    );
  if (worker.includes('attachShadow'))
    failures.push(`service worker chunk ${imported} contains page code`);
}

for (const file of [
  'src/content/index.js',
  'offscreen.html',
  'popup.html',
  '_locales/hr/messages.json',
  '_locales/en/messages.json',
  ...Object.values(manifest.icons)
]) {
  if (!existsSync(resolve(dist, file))) failures.push(`missing ${file}`);
}

if (failures.length) {
  console.error('dist check failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`dist ok: worker ${imported}, version ${manifest.version}`);
