/** The new product's icons, copied path for path from the owner's mock-up files (ADR-134), so a
 *  screen is the drawing and not an approximation. They are the mock-ups' own stroked 24×24 icons;
 *  `className` carries the size and colour exactly as the file does (`w-4 h-4 text-slate-600`…). */

type P = { className?: string; strokeWidth?: number }

const svg = (children: React.ReactNode, sw = 2) =>
  function Icon({ className = 'w-4 h-4', strokeWidth }: P) {
    return (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? sw} viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    )
  }

const cap = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const IconHome = svg(<path {...cap} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />)
export const IconChevronRight = svg(<path {...cap} d="M9 5l7 7-7 7" />, 2.2)
export const IconTag = svg(<path {...cap} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />, 2.2)
export const IconPlus = svg(<path {...cap} d="M12 4v16m8-8H4" />, 2.2)
export const IconBook = svg(<path {...cap} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />)
export const IconPhone = svg(<><rect x="6" y="2" width="12" height="20" rx="2.5" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" strokeLinecap="round" /></>)
export const IconCog = svg(<><path {...cap} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></>)
export const IconReturn = svg(<path {...cap} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />)
export const IconDoc = svg(<path {...cap} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />)
export const IconWallet = svg(<path {...cap} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />)
export const IconUsers = svg(<path {...cap} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />, 1.9)
export const IconBars = svg(<path {...cap} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />, 1.9)
export const IconCalendar = svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>, 1.9)
export const IconPie = svg(<path {...cap} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />, 1.9)
export const IconBank = svg(<path {...cap} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />, 1.9)
export const IconBox = svg(<path {...cap} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />, 1.9)
export const IconUser = svg(<path {...cap} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />, 1.9)
export const IconGrid = svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>, 1.9)
export const IconSearch = svg(<><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></>)
export const IconScan = svg(<path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />)
export const IconMenu = svg(<path {...cap} d="M4 6h16M4 12h16M4 18h16" />)
export const IconClose = svg(<path {...cap} d="M6 18L18 6M6 6l12 12" />)
export const IconMoon = svg(<path {...cap} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />)
export const IconSun = svg(<><circle cx="12" cy="12" r="5" /><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>)
export const IconBell = svg(<path {...cap} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />)

/* the stock screen (mock-ups 11 and 13) */
export const IconBack = svg(<path {...cap} d="M15 19l-7-7 7-7" />, 2.2)
export const IconList = svg(<path {...cap} d="M4 6h16M4 10h16M4 14h16M4 18h16" />)
export const IconClipboardCheck = svg(<path {...cap} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />)
export const IconEyeOff = svg(<path {...cap} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />)
export const IconDocChart = svg(<path {...cap} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />)
export const IconPrinter = svg(<path {...cap} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />)
export const IconDownload = svg(<path {...cap} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />)
export const IconShare = svg(<path {...cap} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />)
/* the five kinds of stock, as mock-up 13 draws them */
export const IconKindPhone = svg(<><rect x="6" y="2" width="12" height="20" rx="2.5" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" strokeLinecap="round" /></>, 1.9)
export const IconKindTablet = svg(<><rect x="4" y="2" width="16" height="20" rx="2.5" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" strokeLinecap="round" /></>, 1.9)
export const IconKindWatch = svg(<><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6V3h6v3M9 18v3h6v-3" {...cap} /><path d="M12 9v3l2 1" {...cap} /></>, 1.9)
export const IconKindLaptop = svg(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20" strokeLinecap="round" /></>, 1.9)
export const IconKindItems = svg(<><path d="M3 18v-6a9 9 0 0 1 18 0v6" {...cap} /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" {...cap} /></>)
