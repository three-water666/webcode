import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const extensionTestDir = fileURLToPath(new URL('../out/extension-test', import.meta.url));

if (!hasTestFile(extensionTestDir)) {
  console.log('No VS Code Extension Host tests found in out/extension-test/**/*.test.js.');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'vscode-test.cmd' : 'vscode-test';
const result = spawnSync(command, process.argv.slice(2), {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function hasTestFile(directory) {
  if (!existsSync(directory)) {
    return false;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && hasTestFile(entryPath)) {
      return true;
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      return true;
    }
  }

  return false;
}
