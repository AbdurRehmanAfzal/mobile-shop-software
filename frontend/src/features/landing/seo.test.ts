/** ADR-115: the landing page's shop-kind addresses — one list, in the sitemap, with texts in three
 *  languages, and an HTML head of their own written by the build from the real index.html. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { topicHtml } from '../../../seo-pages'
import en from '@/i18n/locales/en.json'
import roman from '@/i18n/locales/roman.json'
import ur from '@/i18n/locales/ur.json'
import { SITE, TOPICS, TOPIC_KEYS } from './topics'

const file = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf-8')
const FIELDS = ['metaTitle', 'metaDesc', 'h1', 'sub', 'q', 'a', 'p1', 'p2', 'p3', 'p4'] as const
const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))

describe('landing topics', () => {
  it('every topic has its texts in three languages, short enough for a search result', () => {
    for (const k of TOPIC_KEYS) {
      for (const lang of [en, ur, roman]) {
        const t = (lang.landing.topic as Record<string, Record<string, string>>)[k]
        for (const f of FIELDS) expect(t[f], `${k}.${f}`).toBeTruthy()
        expect(t.metaTitle.length, `${k} title`).toBeLessThanOrEqual(65)
        expect(t.metaDesc.length, `${k} description`).toBeLessThanOrEqual(260)
      }
    }
  })

  it('the sitemap and robots.txt list every topic address', () => {
    const sitemap = file('public/sitemap.xml')
    const robots = file('public/robots.txt')
    for (const k of TOPIC_KEYS) {
      expect(sitemap).toContain(`<loc>${SITE}${TOPICS[k]}</loc>`)
      expect(robots).toContain(`Allow: ${TOPICS[k]}`)
    }
    expect(robots).toContain('Disallow: /control')
  })

  it('index.html carries valid structured data with the new questions', () => {
    const [graph] = ld(file('index.html'))
    const faq = graph['@graph'].find((x: { '@type': string }) => x['@type'] === 'FAQPage')
    const names = faq.mainEntity.map((q: { name: string }) => q.name).join(' | ')
    expect(names).toContain('accessories shop')
    expect(names).toContain('laptop shop software')
    expect(names).toContain('Which reports')
  })

  it('the build writes each topic its own head from index.html', () => {
    const index = file('index.html')
    for (const k of TOPIC_KEYS) {
      const t = en.landing.topic[k]
      const html = topicHtml(index, TOPICS[k], t)
      const url = `${SITE}${TOPICS[k]}`
      expect(html).toContain(`<link rel="canonical" href="${url}" />`)
      expect(html).toContain(`<meta property="og:url" content="${url}" />`)
      expect(html).not.toContain('hreflang')
      expect(html.match(/<title>/g)).toHaveLength(1)
      expect(html).toContain(`<h1>${t.h1}</h1>`)
      expect(html).toContain('<div id="root"></div>') // still the app
      const data = ld(html)
      expect(data).toHaveLength(2)
      expect(data[1].url).toBe(url)
      expect(data[1].mainEntity.acceptedAnswer.text).toBe(t.a)
    }
  })

  it('a changed index.html stops the build instead of shipping a wrong head', () => {
    expect(() => topicHtml('<html><head></head></html>', '/x', en.landing.topic.laptops)).toThrow(/seo-pages/)
  })
})
