// Regenerates the README screenshots from the demo vault (never from a real vault: the
// screenshots are public, real notes are private).
//
//   PORT=13398 VAULT_PATH=$PWD/template bun run dev   # in one terminal
//   bun add --no-save playwright-core && bun scripts/readme-screenshots.ts       # in another
//
// Uses your installed Chrome (CHROME=/path/to/chrome to override). Writes docs/screenshots/*.png.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright-core'

const BASE = process.env.SOII_URL ?? 'http://localhost:13398'
const OUT = join(import.meta.dir, '..', 'docs', 'screenshots')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })

const go = async (p: Page, path: string) => {
  await p.goto(BASE + path, { waitUntil: 'networkidle' })
  await p.waitForTimeout(600) // let covers and charts settle
}
const shot = (p: Page, name: string) => p.screenshot({ path: join(OUT, `${name}.png`) })

/** Opens the first note card/row on the page, so the reader shot needs no hard-coded id. */
async function openFirst(p: Page, selector: string) {
  await p.locator(selector).first().click()
  await p.waitForURL(/\/n\//)
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(400)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
await go(desk, '/w/today')
await desk.evaluate(() => localStorage.clear())
await go(desk, '/w/today')
await shot(desk, 'today')
await go(desk, '/w/library/books')
await shot(desk, 'library')
await openFirst(desk, '[data-browse-grid] > button, main a[href^="/n/"]')
await shot(desk, 'reader')
await go(desk, '/w/people/overview')
await shot(desk, 'people')
await go(desk, '/w/finance/overview')
await shot(desk, 'finance')
await go(desk, '/w/goals/board')
await shot(desk, 'goals')
await go(desk, '/log')
await shot(desk, 'log')

const dark = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
await go(dark, '/w/library/books')
await shot(dark, 'library-dark')

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', isMobile: true, hasTouch: true })
await go(phone, '/w/today')
await shot(phone, 'phone-today')
await go(phone, '/w/people/overview')
await shot(phone, 'phone-people')

await browser.close()
console.log(`Screenshots written to ${OUT}`)
