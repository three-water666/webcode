//@ts-check

'use strict';

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

function resolveRipgrepBinary() {
  const arch = process.env.npm_config_arch || process.arch;
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const platformPackage = `@vscode/ripgrep-${process.platform}-${arch}`;
  const ripgrepMain = require.resolve('@vscode/ripgrep');

  return createRequire(ripgrepMain).resolve(`${platformPackage}/bin/${binaryName}`);
}

class CopyRipgrepPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyRipgrepPlugin', compilation => {
      const sourcePath = resolveRipgrepBinary();
      const targetPath = path.join(compilation.outputOptions.path, 'bin', path.basename(sourcePath));

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    });
  }
}

/** @type {WebpackConfig} */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: {
    extension: './src/extension.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    clean: true
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  experiments: {
    topLevelAwait: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.md$/,
        type: 'asset/source'
      }
    ]
  },
  devtool: 'nosources-source-map',
  ignoreWarnings: [
    {
      module: /express[\\/]lib[\\/]view\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    }
  ],
  infrastructureLogging: {
    level: 'log'
  },
  plugins: [
    new CopyRipgrepPlugin()
  ]
};

module.exports = [extensionConfig];
