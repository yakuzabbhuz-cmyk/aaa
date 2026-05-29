// ============================================
// DL Chat Desktop - Webpack Renderer Config
// ============================================
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');

const isDev = process.env.NODE_ENV !== 'production';

module.exports = {
  entry: './src/renderer/index.ts',
  target: 'electron-renderer',
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'eval-source-map' : false,
  module: {
    rules: [
      // TypeScript / TSX
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
      // CSS / PostCSS
      {
        test: /\.css$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              modules: {
                auto: true,
                localIdentName: isDev ? '[name]__[local]--[hash:base64:5]' : '[hash:base64]',
              },
            },
          },
          'postcss-loader',
        ],
      },
      // Images
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico|webp)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[name].[hash][ext]',
        },
      },
      // Fonts
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/fonts/[name].[hash][ext]',
        },
      },
      // Audio
      {
        test: /\.(mp3|wav|ogg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/audio/[name].[hash][ext]',
        },
      },
      // Native modules
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
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
    fallback: {
      // Polyfills for Node.js APIs used in renderer
      path: require.resolve('path-browserify'),
      crypto: false,
      fs: false,
      os: false,
    },
  },
  output: {
    path: path.resolve(__dirname, '.webpack/renderer'),
    filename: 'index.js',
    publicPath: isDev ? 'http://localhost:3000/' : './',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
      inject: true,
      minify: !isDev && {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true,
      },
    }),
    !isDev &&
      new MiniCssExtractPlugin({
        filename: 'assets/css/[name].[contenthash].css',
        chunkFilename: 'assets/css/[id].[contenthash].css',
      }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.API_BASE_URL': JSON.stringify(
        process.env.API_BASE_URL || 'https://dl-chat-api.death-legion-dlchat.workers.dev'
      ),
      'process.env.WS_BASE_URL': JSON.stringify(
        process.env.WS_BASE_URL || 'wss://dl-chat-api.death-legion-dlchat.workers.dev'
      ),
    }),
  ].filter(Boolean),
  devServer: {
    port: 3000,
    hot: true,
    static: {
      directory: path.join(__dirname, 'src/renderer/public'),
    },
    headers: {
      // Allow Electron to load the dev server
      'Access-Control-Allow-Origin': '*',
    },
    historyApiFallback: true,
  },
  optimization: {
    splitChunks: isDev
      ? false
      : {
          chunks: 'all',
          name: false,
        },
  },
};
