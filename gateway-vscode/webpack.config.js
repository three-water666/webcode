//@ts-check

'use strict';

const path = require('path');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

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
  }
};

module.exports = [extensionConfig];
