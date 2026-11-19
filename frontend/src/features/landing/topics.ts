/** The landing page's own addresses for one kind of shop (owner 2026-11-20, ADR-115): the same page
 *  with that shop's heading, answer and points on top, so a search for "laptop shop software" lands
 *  on a page about laptops. One list for the router, the page, the sitemap test and the build, which
 *  writes each address its own HTML head (`seo-pages.ts`). The texts are `landing.topic.<key>.*`. */

export const SITE = 'https://mobileshop.oopsolutions.com'

export const TOPICS = {
  accessories: '/accessories-shop-software',
  laptops: '/laptop-shop-software',
  used: '/used-mobile-shop-software',
} as const

export type Topic = keyof typeof TOPICS
export const TOPIC_KEYS = Object.keys(TOPICS) as Topic[]
