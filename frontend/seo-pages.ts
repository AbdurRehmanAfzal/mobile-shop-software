/** Build step (owner 2026-11-20, ADR-115): each shop-kind address of the landing page
 *  (`src/features/landing/topics.ts`) gets its own HTML file — `dist/laptop-shop-software.html` —
 *  which is `index.html` with that page's title, description, canonical address, link-preview tags,
 *  a WebPage entry for answer engines and its own text for readers without JavaScript. The web
 *  server gives that file for that address (deploy/Caddyfile: `{path}.html`); the app then starts
 *  as on any page. The texts are the English `landing.topic.<key>.*` of the app, never a second copy.
 *  A change in index.html that this step cannot follow stops the build instead of shipping a wrong head. */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { SITE, TOPICS, TOPIC_KEYS } from './src/features/landing/topics'

type Texts = Record<'metaTitle' | 'metaDesc' | 'h1' | 'sub' | 'q' | 'a' | 'p1' | 'p2' | 'p3' | 'p4', string>
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** index.html rewritten for one address; throws when a tag it must change is not there exactly once */
export function topicHtml(html: string, path: string, t: Texts): string {
  const url = `${SITE}${path}`
  let out = html
  const swap = (what: string, re: RegExp, to: string, times = 1) => {
    const found = out.match(new RegExp(re.source, 'g'))?.length ?? 0
    if (found !== times) throw new Error(`seo-pages: ${what} found ${found} times in index.html, expected ${times}`)
    out = out.replace(new RegExp(re.source, 'g'), () => to)
  }
  swap('title', /<title>[^<]*<\/title>/, `<title>${text(t.metaTitle)}</title>`)
  swap('description', /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${attr(t.metaDesc)}" />`)
  swap('canonical', /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
  swap('hreflang', /(<link rel="alternate" hreflang="[^"]*" href=")[^"]*(" \/>)/, '', 3)
  swap('og:url', /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
  swap('og:title', /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${attr(t.metaTitle)}" />`)
  swap('og:description', /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${attr(t.metaDesc)}" />`)
  swap('twitter:title', /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${attr(t.metaTitle)}" />`)
  swap('twitter:description', /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${attr(t.metaDesc)}" />`)
  const page = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#page`,
    url,
    name: t.metaTitle,
    headline: t.h1,
    description: t.metaDesc,
    inLanguage: ['en', 'ur'],
    isPartOf: { '@type': 'WebSite', name: 'Mobile Shop', url: `${SITE}/welcome` },
    about: { '@id': `${SITE}/#app` },
    mainEntity: { '@type': 'Question', name: t.q, acceptedAnswer: { '@type': 'Answer', text: t.a } },
  }
  swap('head end', /<\/head>/, `  <script type="application/ld+json">${JSON.stringify(page).replace(/</g, '\\u003c')}</script>\n  </head>`)
  swap('noscript top', /<!--seo:top-->[\s\S]*?<!--\/seo:top-->/, [
    `<h1>${text(t.h1)}</h1>`,
    `<p>${text(t.sub)}</p>`,
    `<h2>${text(t.q)}</h2>`,
    `<p>${text(t.a)}</p>`,
    `<ul>${[t.p1, t.p2, t.p3, t.p4].map((p) => `<li>${text(p)}</li>`).join('')}</ul>`,
  ].join('\n        '))
  return out
}

export default function seoPages(): Plugin {
  let dist = 'dist'
  let root = '.'
  return {
    name: 'seo-pages',
    apply: 'build',
    configResolved(c) { dist = resolve(c.root, c.build.outDir); root = c.root },
    closeBundle() {
      const html = readFileSync(resolve(dist, 'index.html'), 'utf-8')
      const en = JSON.parse(readFileSync(resolve(root, 'src/i18n/locales/en.json'), 'utf-8')) as { landing: { topic: Record<string, Texts> } }
      for (const k of TOPIC_KEYS) writeFileSync(resolve(dist, `${TOPICS[k].slice(1)}.html`), topicHtml(html, TOPICS[k], en.landing.topic[k]))
    },
  }
}
