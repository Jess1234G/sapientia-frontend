/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
   extend: {
     colors: {
       'sapientia-bg': '#212121',
       'sapientia-input': '#2f2f2f',
       'sapientia-blue': '#4d6bfe',
       'sapientia-beige': '#cbc7b7', // <-- ¡El color beige que pediste!
      },
     fontFamily: {
       'sans': ['"Open Sauce Sans"', 'sans-serif'], // <-- La fuente que pediste
      }
    },
  },
  plugins: [],
}