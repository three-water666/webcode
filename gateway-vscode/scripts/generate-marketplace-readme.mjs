import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDir, '..');
const repoRoot = resolve(extensionRoot, '..');

const chineseReadme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8').trimEnd();
const englishReadme = readFileSync(resolve(repoRoot, 'README_en.md'), 'utf8').trimEnd();
const marketplaceReadme = [
  '<!-- This README is generated for the VS Code Marketplace package. -->',
  '<!-- Sources: ../README.md and ../README_en.md -->',
  '',
  chineseReadme,
  '',
  '---',
  '',
  englishReadme,
  ''
].join('\n');

if (process.argv.includes('--stdout')) {
  process.stdout.write(marketplaceReadme);
} else {
  writeFileSync(resolve(extensionRoot, 'README.md'), marketplaceReadme, 'utf8');
}
