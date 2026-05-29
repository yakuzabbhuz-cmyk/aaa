// ============================================
// DL Chat Desktop - Webpack Preload Config
// ============================================
const path = require('path');

module.exports = {
  entry: './src/main/preload.ts',
  target: 'electron-preload',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: path.resolve(__dirname, 'tsconfig.json'),
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts'],
  },
  output: {
    path: path.resolve(__dirname, '.webpack/main'),
    filename: 'preload.js',
  },
};
