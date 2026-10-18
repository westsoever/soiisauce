// Zod 4 probes `new Function('')` to decide whether it may compile parsers, which the page's Content-Security-Policy
// (no 'unsafe-eval') blocks and reports on every load. Say so up front: it parses without compiling, the same results.
// Imported first in main.tsx, so it runs before any schema is built.
import { z } from 'zod'

z.config({ jitless: true })
