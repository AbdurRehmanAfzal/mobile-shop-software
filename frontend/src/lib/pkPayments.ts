/** Pakistani banks and wallets, and remittance currencies and services (owner, 2026-10-28).
 *  Names are shown as they are (brand names are not translated). */

/** tapped most often: shown as big buttons; the rest are in "Other bank / wallet" */
export const POPULAR_BANKS = [
  'Easypaisa', 'JazzCash', 'Raast', 'HBL', 'Meezan Bank', 'UBL', 'MCB', 'Bank Alfalah', 'Allied Bank', 'NBP', 'SadaPay', 'NayaPay',
]

export const ALL_BANKS = [
  // wallets and payment apps
  'Easypaisa', 'JazzCash', 'Raast', 'SadaPay', 'NayaPay', 'UPaisa', 'Zindigi', 'HBL Konnect', 'Keenu',
  // banks
  'HBL', 'Meezan Bank', 'UBL', 'MCB', 'Bank Alfalah', 'Allied Bank', 'NBP', 'Askari Bank', 'Bank Al Habib',
  'Faysal Bank', 'Habib Metro', 'JS Bank', 'Soneri Bank', 'Bank of Punjab', 'Bank of Khyber', 'Sindh Bank',
  'Standard Chartered', 'Dubai Islamic Bank', 'BankIslami', 'Al Baraka Bank', 'MCB Islamic', 'Silkbank',
  'Samba / Saudi National Bank', 'Summit Bank', 'First Women Bank', 'Zarai Taraqiati Bank (ZTBL)', 'Bank of Azad Jammu & Kashmir',
  'Citibank', 'Deutsche Bank', 'ICBC', 'Bank of China',
  // microfinance banks
  'Mobilink Microfinance Bank', 'Telenor Microfinance Bank', 'U Microfinance Bank', 'Khushhali Microfinance Bank',
  'FINCA Microfinance Bank', 'NRSP Microfinance Bank', 'HBL Microfinance Bank', 'Advans Pakistan', 'Apna Microfinance Bank',
  'Other',
]

export interface Currency { code: string; country: string }

/** where most Pakistani remittances come from */
export const CURRENCIES: Currency[] = [
  { code: 'SAR', country: 'Saudi Arabia' },
  { code: 'AED', country: 'UAE' },
  { code: 'GBP', country: 'UK' },
  { code: 'USD', country: 'USA' },
  { code: 'EUR', country: 'Europe' },
  { code: 'QAR', country: 'Qatar' },
  { code: 'KWD', country: 'Kuwait' },
  { code: 'OMR', country: 'Oman' },
  { code: 'BHD', country: 'Bahrain' },
  { code: 'MYR', country: 'Malaysia' },
  { code: 'CAD', country: 'Canada' },
  { code: 'AUD', country: 'Australia' },
  { code: 'NOK', country: 'Norway' },
  { code: 'SEK', country: 'Sweden' },
  { code: 'CHF', country: 'Switzerland' },
  { code: 'JPY', country: 'Japan' },
  { code: 'CNY', country: 'China' },
  { code: 'TRY', country: 'Turkey' },
]

export const REMIT_SERVICES = [
  'Western Union', 'MoneyGram', 'Ria', 'Remitly', 'Wise', 'WorldRemit', 'Xpress Money', 'Al Ansari', 'Al Rajhi (Tahweel)', 'Bank transfer', 'Other',
]
