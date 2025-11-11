/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#5b21b6',
          light: '#7c3aed'
        }
      }
    }
  },
  plugins: []
};
