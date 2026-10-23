/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'rose': {
          100: '#edbec8',
          300: '#e49daf',
          500: '#c96378',
          700: '#a3253a',
          900: '#76111b',
        },
        'ivory': {
          50: '#fdfbf7',
          100: '#f9f8f6',
          200: '#efeae0',
        },
        'charcoal': {
          800: '#3a3836',
          900: '#2c2a29',
        },
        brand: {
          light: '#edbec8',
          DEFAULT: '#c96378',
          dark: '#a3253a',
          darker: '#76111b',
        },
        surface: {
          DEFAULT: '#ffffff',
          soft: '#FCF8F5',
          rose: '#fcf3f5',
        }
      },
      fontFamily: {
        'serif': ['var(--font-serif)'],
        'sans': ['var(--font-sans)'],
      }
    },
  },
  plugins: [],
}
