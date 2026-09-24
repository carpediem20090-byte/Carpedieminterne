/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        havane: '#123A6B',
        laiton: '#B8892E',
        corail: '#C1503A',
        creme: '#F1E6CD',
        encre: '#23180D',
      },
    },
  },
  plugins: [],
}
