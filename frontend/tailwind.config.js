/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  // ADR-134: the new product under /new is the only place that uses `dark:` classes; the
  // software the shops run has none, so this changes nothing for it
  darkMode: ['selector', ':root[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif'],
        // ADR-132: headings and big figures; IMEIs, bill numbers and small figures
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // ADR-134: the new product's own palette, taken from the mock-up files
        limebrand: { DEFAULT: '#B4F000', hover: '#A3DC00', dark: '#65A30D', 400: '#A3E635', 500: '#84CC16', 600: '#65A30D' },
        // each mock-up file has its own shades: [data-file] sets them (index.css); file 11's are the default
        obsidian: { 950: rgb('--obs-950'), 900: rgb('--obs-900'), 850: rgb('--obs-850'), 800: rgb('--obs-800'), 700: rgb('--obs-700') },
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
