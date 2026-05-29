// ============================================
// DL Chat Desktop - Webpack Main Process Config
// ============================================
const path = require('path');

module.exports = {
  /**
   * This is the main process webpack configuration.
   * We only have one entry point (the main process).
   */
  entry: './src/main/index.ts',
  target: 'electron-main',
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
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  output: {
    path: path.resolve(__dirname, '.webpack/main'),
    filename: 'index.js',
  },
  externals: {
    // Electron built-ins
    electron: 'commonjs electron',
    // Native modules
    'electron-updater': 'commonjs electron-updater',
    'electron-store': 'commonjs electron-store',
  },
};
