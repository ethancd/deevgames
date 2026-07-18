const path = require('path');
const ESLintPlugin = require('eslint-webpack-plugin');

module.exports = {
  entry: './mythgarden/static/mythgarden/js/react-script.tsx',
  plugins: [new ESLintPlugin()],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'],
          }
        },
        exclude: /node_modules/,
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          // Creates `style` nodes from JS strings
          "style-loader",
          // Translates CSS into CommonJS
          "css-loader",
          // Compiles Sass to CSS
          "sass-loader",
        ],
      },
    ],
  },
  mode: 'development',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, './mythgarden/static/mythgarden/dist'),
  },
};