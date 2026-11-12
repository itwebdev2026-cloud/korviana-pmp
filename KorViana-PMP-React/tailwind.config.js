/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/views/**/*.ejs',
    './src/**/*.ts',
    './public/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#17314E',
        muted: '#59697B',
        bone: '#F7F6F1',
        gold: '#B8944D',
        'gold-deep': '#89682E',
        hair: '#DCE3EA',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
