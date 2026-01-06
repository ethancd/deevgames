/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'crimson': '#8B0000',
        'iron': '#708090',
        'void': '#4B0082',
        'silk': '#FFD700',
        'dream': '#98FB98',
        'ghost': '#696969',
      },
    },
  },
  plugins: [],
}
