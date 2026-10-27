/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif'],
      },
      colors: {
        ink: rgb('--ink'),
        ground: rgb('--ground'),
        surface: rgb('--surface'),
        line: rgb('--line'),
        muted: rgb('--muted'),
        emerald: { DEFAULT: rgb('--emerald'), deep: rgb('--emerald-deep'), tint: rgb('--emerald-tint') },
        gold: { DEFAULT: rgb('--gold'), text: rgb('--gold-text') },
        receivable: { DEFAULT: rgb('--receivable'), tint: rgb('--receivable-tint') },
        payable: { DEFAULT: rgb('--payable'), tint: rgb('--payable-tint') },
        hero: { DEFAULT: rgb('--hero'), text: rgb('--hero-text') },
        nav: rgb('--nav'),
        sell: { DEFAULT: rgb('--t-sell'), fg: rgb('--t-sell-fg'), icon: rgb('--t-sell-icon') },
        buy: { DEFAULT: rgb('--t-buy'), fg: rgb('--t-buy-fg'), icon: rgb('--t-buy-icon') },
        khata: { DEFAULT: rgb('--t-khata'), fg: rgb('--t-khata-fg'), icon: rgb('--t-khata-icon') },
        stockt: { DEFAULT: rgb('--t-stock'), fg: rgb('--t-stock-fg'), icon: rgb('--t-stock-icon') },
        repair: { DEFAULT: rgb('--t-repair'), fg: rgb('--t-repair-fg'), icon: rgb('--t-repair-icon') },
        expense: { DEFAULT: rgb('--t-expense'), fg: rgb('--t-expense-fg'), icon: rgb('--t-expense-icon') },
        ret: { DEFAULT: rgb('--t-return'), fg: rgb('--t-return-fg'), icon: rgb('--t-return-icon') },
      },
      // buttons / cards follow the look (Modern uses tighter, Stripe-like corners)
      borderRadius: { '2xl': 'var(--r-btn)', '3xl': 'var(--r-card)' },
      boxShadow: {
        hero: '0 18px 40px -24px rgba(27,31,36,.45)',
        cta: '0 12px 24px -14px rgba(30,107,69,.7)',
        fab: '0 10px 24px -10px rgba(14,22,19,.7)',
      },
    },
  },
  plugins: [],
}
