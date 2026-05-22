import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDir, '..');
const repoRoot = resolve(extensionRoot, '..');
const sourceDir = resolve(repoRoot, 'bridge-browser', 'dist');
const targetDir = resolve(extensionRoot, 'browser-extension');

if (!existsSync(resolve(sourceDir, 'manifest.json'))) {
  throw new Error(`Browser extension build not found at ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
