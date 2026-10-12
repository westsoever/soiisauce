// Renders app/client/icons/icon.svg to the PNG sizes the web manifest and iOS
// need. Run after editing the SVG: `bun run icons`.
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ICONS = join(import.meta.dir, '..', 'app', 'client', 'icons')
const svg = readFileSync(join(ICONS, 'icon.svg'), 'utf8')
for (const size of [192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(join(ICONS, `icon-${size}.png`), png)
  console.log(`soii: wrote icon-${size}.png`)
}
