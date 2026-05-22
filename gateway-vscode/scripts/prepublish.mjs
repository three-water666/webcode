import { spawnSync } from 'node:child_process';

const usePrebuiltBrowserExtension = process.env.WEBCODE_BROWSER_PREBUILT === '1';

if (!usePrebuiltBrowserExtension) {
  run('pnpm', ['--filter', 'bridge-browser', 'run', 'build']);
}

run('node', ['scripts/copy-browser-extension.mjs']);
run('pnpm', ['exec', 'webpack', '--mode', 'production', '--devtool', 'hidden-source-map']);

function run(command, args) {
  const result = spawnSync(command, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}
