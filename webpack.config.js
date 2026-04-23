const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    entry: {
      background: './src/background/index.ts',
      content: './src/content/index.ts',
      offscreen: './src/offscreen/ocrEngine.ts',
      popup: './src/popup/popup.ts',
      welcome: './src/welcome/welcome.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.js'],
      fallback: {
        fs: false,
        path: false,
        crypto: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.wasm$/,
          type: 'asset/resource',
        },
      ],
    },
    ignoreWarnings: [/asset size limit/],
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public/manifest.json', to: '.' },
          { from: 'public/_locales', to: '_locales' },
          { from: 'public/icons', to: 'icons', noErrorOnMissing: true },
          { from: 'src/offscreen/offscreen.html', to: '.' },
          {
            from: 'node_modules/ddddocr-node/onnx/*',
            to: 'models/[name][ext]',
            noErrorOnMissing: true,
          },
          {
            from: 'node_modules/onnxruntime-web/dist/*.wasm',
            to: 'wasm/[name][ext]',
            noErrorOnMissing: true,
          },
          {
            from: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs',
            to: 'wasm/[name][ext]',
            noErrorOnMissing: true,
          },
        ],
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
      }),
      new HtmlWebpackPlugin({
        template: './public/welcome.html',
        filename: 'welcome.html',
        chunks: ['welcome'],
      }),
    ],
    devtool: isProd ? false : 'inline-source-map',
    optimization: {
      minimize: isProd,
    },
  };
};
