import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/extension-test/**/*.test.js',
});
