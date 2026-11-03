// The user manual as print HTML and PDF (owner 2026-11-03). Reads docs/manual/<lang>.md (a small
// markdown subset: ## / ### headings, paragraphs, - and 1. lists, tables, one-line > notes,
// **bold**, `code`, and ![Caption](shot:name) for docs/manual/img/<lang>/name.jpg) and writes
// docs/manual/Mobile-Shop-User-Manual-<lang>.html and .pdf. Run from frontend/:
//   node scripts/manual-pdf.mjs            (all three)      node scripts/manual-pdf.mjs ur

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), '..', 'docs', 'manual')
const LANGS = (process.argv[2] ?? 'en,ur,roman').split(',')

const T = {
  en: { title: 'Mobile Shop', sub: 'User Manual', tag: 'Stock, sales, used-phone verification, repairs, udhaar, len-den, reports and the shop audit — step by step.', contents: 'Contents', fig: 'Picture', page: 'Page', of: 'of', by: 'OOP Solutions · mobileshop.oopsolutions.com' },
  ur: { title: 'موبائل شاپ', sub: 'استعمال کی گائیڈ', tag: 'اسٹاک، سیل، پرانے فون کی تصدیق، ریپئر، ادھار، لین دین، رپورٹس اور شاپ آڈٹ — قدم بہ قدم۔', contents: 'فہرست', fig: 'تصویر', page: 'صفحہ', of: 'از', by: 'OOP Solutions · mobileshop.oopsolutions.com' },
  roman: { title: 'Mobile Shop', sub: 'Istemal ki Guide', tag: 'Stock, sale, purane phone ki tasdeeq, repair, udhaar, len-den, reports aur shop audit — qadam ba qadam.', contents: 'Fehrist', fig: 'Tasveer', page: 'Safha', of: 'az', by: 'OOP Solutions · mobileshop.oopsolutions.com' },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>')

function render(md, lang) {
  const out = []
  const toc = []
  let list = null // 'ul' | 'ol'
  let para = []
  let fig = 0
  let ch = 0
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = [] }
  const closeList = () => { if (list) out.push(`</${list}>`); list = null }
  const lines = md.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    let m
    if (!t) { flushPara(); closeList(); continue }
    if (t.startsWith('# ')) { flushPara(); closeList(); continue } // the cover carries the title
    if ((m = t.match(/^## (.+)$/))) {
      flushPara(); closeList(); ch++
      toc.push({ id: `c${ch}`, text: m[1] })
      out.push(`<h2 id="c${ch}">${inline(m[1])}</h2>`)
      continue
    }
    if ((m = t.match(/^### (.+)$/))) { flushPara(); closeList(); out.push(`<h3>${inline(m[1])}</h3>`); continue }
    if ((m = t.match(/^!\[(.*)\]\(shot:([\w-]+)\)$/))) {
      flushPara(); closeList(); fig++
      out.push(`<figure><img src="img/${lang}/${m[2]}.jpg" alt=""><figcaption>${T[lang].fig} ${fig}: ${inline(m[1])}</figcaption></figure>`)
      continue
    }
    if ((m = t.match(/^>\s?(.*)$/))) {
      flushPara(); closeList()
      const kind = /^\*\*(Important|Note|اہم|نوٹ|Ahem|Aham|Zaroori)/i.test(m[1]) ? 'note' : 'tip'
      out.push(`<aside class="${kind}">${inline(m[1])}</aside>`)
      continue
    }
    if (t.startsWith('|')) {
      flushPara(); closeList()
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim())
      i--
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|?$/.test(r)))
      out.push('<table><thead><tr>' + cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.slice(1).map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>')
      continue
    }
    if ((m = t.match(/^(-|\*|\d+\.)\s+(.*)$/))) {
      flushPara()
      const kind = /\d/.test(m[1]) ? 'ol' : 'ul'
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind }
      out.push(`<li>${inline(m[2])}</li>`)
      continue
    }
    if (list && /^\s+/.test(line)) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(t)}</li>`); continue }
    closeList(); para.push(t)
  }
  flushPara(); closeList()
  return { body: out.join('\n'), toc }
}

function page(lang, { body, toc }) {
  const t = T[lang]
  const rtl = lang === 'ur'
  const font = rtl ? "'Noto Nastaliq Urdu', serif" : "'Inter', system-ui, sans-serif"
  const date = new Date().toISOString().slice(0, 10)
  return `<!doctype html>
<html lang="${lang === 'ur' ? 'ur' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title} — ${t.sub}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 18mm 16mm 20mm }
  :root { --ink:#0E1613; --muted:#55615c; --brand:#5B5BF6; --navy:#0B2440; --soft:#EEF0FF; --line:#dfe3ea; --gold:#B7791F }
  * { box-sizing: border-box }
  body { margin:0; color:var(--ink); background:#fff; font-family:${font}; font-size:${rtl ? '11pt' : '10.5pt'}; line-height:${rtl ? '2.15' : '1.6'} }
  .cover { height: 257mm; display:flex; flex-direction:column; justify-content:center; padding: 0 6mm; page-break-after: always;
    background: radial-gradient(120% 70% at 100% 0%, #e7e8ff 0%, #fff 60%) }
  .cover .brand { font-family:'Inter',sans-serif; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--brand); font-size:10pt }
  .cover h1 { font-size:${rtl ? '40pt' : '44pt'}; line-height:1.25; margin:6mm 0 2mm; color:var(--navy) }
  .cover .sub { font-size:${rtl ? '22pt' : '22pt'}; color:var(--brand); font-weight:700 }
  .cover .tag { margin-top:10mm; font-size:13pt; color:var(--muted); max-width:150mm }
  .cover .shots { display:flex; gap:6mm; margin-top:14mm }
  .cover .shots img { width:42mm; border-radius:5mm; box-shadow:0 8px 24px rgba(11,36,64,.18); border:1px solid var(--line) }
  .cover .by { margin-top:auto; font-family:'Inter',sans-serif; font-size:9pt; color:var(--muted) }
  .toc { page-break-after: always }
  .toc h2 { border:0; margin-top:0 }
  .toc ol { list-style:none; padding:0; columns:${rtl ? 1 : 2}; column-gap:10mm }
  .toc li { padding:1.6mm 0; border-bottom:1px dotted var(--line); break-inside:avoid }
  .toc a { color:var(--ink); text-decoration:none }
  h2 { page-break-before: always; font-size:${rtl ? '20pt' : '20pt'}; color:var(--navy); margin:0 0 4mm; padding-bottom:2.5mm; border-bottom:3px solid var(--brand); line-height:1.5 }
  h3 { font-size:${rtl ? '14pt' : '13pt'}; color:var(--brand); margin:6mm 0 1.5mm; page-break-after: avoid; line-height:1.6 }
  p { margin: 0 0 2.6mm }
  ul, ol { margin: 0 0 3mm; padding-${rtl ? 'right' : 'left'}: 7mm }
  li { margin: .8mm 0 }
  strong { color:var(--navy) }
  code { font-family:'Inter',sans-serif; background:var(--soft); padding:.2mm 1.4mm; border-radius:1mm; direction:ltr; unicode-bidi:embed }
  figure { margin:4mm auto 5mm; text-align:center; page-break-inside:avoid }
  figure img { max-height:118mm; max-width:72mm; border-radius:4mm; border:1px solid var(--line); box-shadow:0 4px 14px rgba(11,36,64,.12) }
  figcaption { font-size:${rtl ? '9.5pt' : '9pt'}; color:var(--muted); margin-top:1.5mm }
  aside { margin:3mm 0; padding:2.5mm 4mm; border-radius:2.5mm; page-break-inside:avoid; background:var(--soft); border-${rtl ? 'right' : 'left'}:4px solid var(--brand) }
  aside.note { background:#FFF7E6; border-color:var(--gold) }
  table { width:100%; border-collapse:collapse; margin:3mm 0 4mm; font-size:${rtl ? '10pt' : '9.5pt'}; page-break-inside:auto }
  tr { page-break-inside:avoid }
  th, td { border:1px solid var(--line); padding:1.6mm 2.4mm; text-align:${rtl ? 'right' : 'left'}; vertical-align:top }
  th { background:var(--navy); color:#fff }
  tbody tr:nth-child(even) td { background:#f7f8fb }
</style>
</head>
<body>
<section class="cover">
  <div class="brand">OOP Solutions</div>
  <h1>${t.title}</h1>
  <div class="sub">${t.sub}</div>
  <div class="tag">${t.tag}</div>
  <div class="shots"><img src="img/${lang}/home.jpg" alt=""><img src="img/${lang}/sale-pick.jpg" alt=""><img src="img/${lang}/verify.jpg" alt=""></div>
  <div class="by">${t.by} · ${date}</div>
</section>
<nav class="toc">
  <h2>${t.contents}</h2>
  <ol>${toc.map((c) => `<li><a href="#${c.id}">${inline(c.text)}</a></li>`).join('')}</ol>
</nav>
${body}
</body>
</html>`
}

const browser = await chromium.launch()
for (const lang of LANGS) {
  const md = readFileSync(join(DIR, `${lang}.md`), 'utf8')
  const name = `Mobile-Shop-User-Manual-${lang}`
  const html = join(DIR, `${name}.html`)
  writeFileSync(html, page(lang, render(md, lang)))
  const p = await browser.newPage()
  await p.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  const t = T[lang]
  await p.pdf({
    path: join(DIR, `${name}.pdf`), format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:8px;color:#8a948f;font-family:Inter,sans-serif;padding:0 16mm;display:flex;justify-content:space-between"><span>${t.title} — ${t.sub}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
  })
  await p.close()
  console.log('wrote', name)
}
await browser.close()
