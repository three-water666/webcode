import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDir, '..');
const repoRoot = resolve(extensionRoot, '..');

const chineseReadme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8').trimEnd();
const englishReadme = readFileSync(resolve(repoRoot, 'README_en.md'), 'utf8').trimEnd();
const marketplaceReadme = replaceSvgImagesWithLinks([
  '<!-- This README is generated for the VS Code Marketplace package. -->',
  '<!-- Sources: ../README.md and ../README_en.md -->',
  '',
  chineseReadme,
  '',
  '---',
  '',
  englishReadme,
  ''
].join('\n'));

if (process.argv.includes('--stdout')) {
  process.stdout.write(marketplaceReadme);
} else {
  writeFileSync(resolve(extensionRoot, 'README.md'), marketplaceReadme, 'utf8');
}

function replaceSvgImagesWithLinks(readme) {
  return readme
    .replace(/<img\b[^>]*>/gi, (image) => {
      const src = image.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (!src || !/\.svg(?:[?#]|$)/i.test(src)) {return image;}
      const alt = image.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2] || 'SVG';
      return `<a href="${src}">${alt}</a>`;
    })
    .replace(/!\[([^\]]*)\]\(([^)\s]+\.svg(?:[?#][^)\s]*)?)(?:\s+["'][^"']*["'])?\)/gi, '[$1]($2)');
}
