import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const shim = readFileSync(resolve(root, 'test/fixture/shim.js'), 'utf8');
const script = readFileSync(resolve(root, 'dist/src/content/index.js'), 'utf8');
writeFileSync(resolve(root, 'test/fixture/_bundle.js'), `${shim}\n${script}`);
console.log('wrote test/fixture/_bundle.js');
