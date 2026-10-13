// soii's API on Vercel: one Bun function behind every /api/* path (see the
// rewrite in vercel.json). `bun run build` generates api/_generated/ (the
// bundled app and the compiled vault) before Vercel packages this file.
import { join } from 'node:path'
import { createSoiiApp, restoreApiPath } from './_generated/server-entry.js'

const app = createSoiiApp({ generatedDir: join(import.meta.dir, '_generated', 'vault') })

Bun.serve({
  fetch(request) {
    return app.fetch(restoreApiPath(request))
  }
})
