export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        urdu: ['Noto Nastaliq Urdu', 'serif'],
      },
      direction: {
        ltr: 'ltr',
        rtl: 'rtl',
      }
    },
  },
  plugins: [],
  safelist: [
    'dir-rtl',
    'dir-ltr'
  ]
}
